/**
 * The focused-test guard (EP-40-S1 AC4): scripts/check-focused-tests.mjs run against a temp tree
 * through its root argument. It passes on a clean tree and fails naming file and line for each
 * focused form. The fixtures are built from pieces so this file does not trip the guard itself.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
const SCRIPT = fileURLToPath(new URL('../../../../scripts/check-focused-tests.mjs', import.meta.url));
const ONLY = `.${'on'}ly`;
const FIT = `f${'it'}`;
const FDESCRIBE = `f${'describe'}`;
let root: string | undefined;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});
/** A temp repo holding `files` (path relative to the repo root -> text). */
function tree(files: Record<string, string>): string {
  root = mkdtempSync(join(tmpdir(), 'focused-check-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}
const check = (dir: string) => {
  const run = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
};
describe('focused test check (EP-40-S1 AC4)', () => {
  it('passes a tree with no focused test, and ignores words that only contain "only"', () => {
    const res = check(
      tree({
        'packages/api/test/a.test.ts': "describe('a', () => { it('works', () => {}); it('is read-only', () => {}); });",
        'packages/web/test/b.test.tsx': "const onlyOne = 1; const fits = 2; it.skip('later', () => {});",
        'packages/api/src/not-a-test.ts': `it${ONLY}('not scanned', () => {});`,
      }),
    );
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('focused test check: ok (2 test files');
  });
  it('fails with exit 1 naming file and line for each focused form', () => {
    const res = check(
      tree({
        'packages/api/test/a.test.ts': `it('fine', () => {});\nit${ONLY}('x', () => {});`,
        'packages/shared/test/b.test.ts': `describe${ONLY}('y', () => {});`,
        'packages/web/test/c.test.tsx': `${FIT}('z', () => {});\n${FDESCRIBE}('w', () => {});\ntest${ONLY}.each([1])('v', () => {});`,
      }),
    );
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('packages/api/test/a.test.ts:2');
    expect(res.stderr).toContain('packages/shared/test/b.test.ts:1');
    expect(res.stderr).toContain('packages/web/test/c.test.tsx:1');
    expect(res.stderr).toContain('packages/web/test/c.test.tsx:2');
    expect(res.stderr).toContain('packages/web/test/c.test.tsx:3');
    expect(res.stderr).not.toContain('a.test.ts:1:');
  });
});
