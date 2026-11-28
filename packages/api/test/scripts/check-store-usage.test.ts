/**
 * The store-usage report (EP-08-S17 AC3, S18 AC1): scripts/check-store-usage.mjs run against a
 * temp tree through its root argument. It prints how many screens still use the prototype store,
 * passes the allow-list, and fails naming a moved screen that imports the store again.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
const SCRIPT = fileURLToPath(new URL('../../../../scripts/check-store-usage.mjs', import.meta.url));
let root: string | undefined;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});
const USES_STORE = "import { useStore } from '../../store/StoreProvider';\nexport const S = () => useStore();";
/** A temp repo with packages/web/src holding `files` (path relative to src -> text). */
function tree(files: Record<string, string>): string {
  root = mkdtempSync(join(tmpdir(), 'store-usage-'));
  const src = join(root, 'packages/web/src');
  const base: Record<string, string> = {
    'store/StoreProvider.tsx': 'export const useStore = () => ({});',
    'store/selectors.ts': 'export const evaluate = () => 0;',
    'data/seed.ts': 'export const seed = {};',
    'components/people/StaffDirectory.tsx': "import { useSession } from '../../shell/session-context';\nexport const StaffDirectory = () => useSession();",
    'components/stock/StockOut.tsx': USES_STORE,
  };
  for (const [path, text] of Object.entries({ ...base, ...files })) {
    mkdirSync(dirname(join(src, path)), { recursive: true });
    writeFileSync(join(src, path), text);
  }
  return root;
}
const check = (dir: string) => {
  const run = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
};
describe('store usage report (EP-08-S17 AC3, S18 AC1)', () => {
  it('passes when only allow-listed screens use the store, and says how many of the screens do', () => {
    const res = check(tree({}));
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('1 of 2 screens still use useStore():');
    expect(res.stdout).toContain('components/stock/StockOut.tsx');
    expect(res.stdout).not.toContain('StaffDirectory');
  });
  it('fails with exit 1 when a moved screen imports the store again', () => {
    const res = check(tree({ 'components/people/StaffDirectory.tsx': USES_STORE }));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('packages/web/src/components/people/StaffDirectory.tsx imports the prototype store');
  });
  it('fails for every way a module can reach the store or the seed data', () => {
    const res = check(
      tree({
        'auth/SignInPage.tsx': "import { identities } from '../store/selectors';",
        'query/hook.ts': "export { seed } from '../data/seed';",
        'shell/Lazy.tsx': "const load = () => import('../store/transitions');",
        'components/ui/Chip.tsx': "import { useStore } from '@/src/store/StoreProvider';",
      }),
    );
    expect(res.status).toBe(1);
    for (const file of ['auth/SignInPage.tsx', 'query/hook.ts', 'components/ui/Chip.tsx']) {
      expect(res.stderr).toContain(`packages/web/src/${file} imports the prototype store`);
    }
  });
  it('ignores tests, which may build a store to probe the shell', () => {
    const res = check(tree({ 'auth/auth-screens.test.tsx': "import { StoreProvider } from '../store/StoreProvider';" }));
    expect(res.status).toBe(0);
  });
});
