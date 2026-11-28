/**
 * The production bundle check (EP-08-S19 AC2): scripts/check-production-bundle.mjs run against a
 * temp tree through its root argument. It passes a dist without prototype code, fails naming each
 * marker, and fails when there is no build to read.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
const SCRIPT = fileURLToPath(new URL('../../../../scripts/check-production-bundle.mjs', import.meta.url));
let root: string | undefined;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});
/** A temp repo whose packages/web/dist holds `files` (path relative to dist -> text). */
function dist(files: Record<string, string>): string {
  root = mkdtempSync(join(tmpdir(), 'bundle-prod-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, 'packages/web/dist', path)), { recursive: true });
    writeFileSync(join(root, 'packages/web/dist', path), text);
  }
  return root;
}
const check = (dir: string) => {
  const run = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
};
const CLEAN = 'var a=`Staff`;function f(){return fetch(`/api/ops/listUsers`)}';
describe('production bundle check (EP-08-S19 AC2)', () => {
  it('passes a bundle with no prototype code and prints the markers it looked for', () => {
    const res = check(dist({ 'assets/index-abc.js': CLEAN, 'assets/index.css': '.a{}', 'index.html': '<html></html>' }));
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('looked for 8 markers in 1 file(s)');
    expect(res.stdout).toContain('switchIdentity');
    expect(res.stdout).toContain('production bundle check: ok');
  });
  it.each([
    ['switchIdentity', 'switchIdentity'],
    ['demoNow', 'demoNow'],
    ['Dev · pricing', 'Dev · pricing'],
    ['the demo base date', 'new Date(2026,10,1,11,6,0).getTime()'],
    ['the demo base date with spaces', 'new Date(2026, 10, 1, 11, 6, 0)'],
    ['goldsmith:prototype-store', "S.displayName=`goldsmith:prototype-store`"],
    ['a seed customer', 'name:`Sri Murugan Jewellers`'],
    ['another seed customer', 'name:`Dr Fathima Beevi`'],
    ['a seed piece', 'name:`Temple Nakshi Haram`'],
  ])('fails with exit 1 on %s', (_label, marker) => {
    const res = check(dist({ 'assets/index-abc.js': `${CLEAN};${marker}` }));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('prototype code in the production bundle: packages/web/dist/assets/index-abc.js contains');
  });
  it('reads every .js file, in sub-folders too', () => {
    const res = check(dist({ 'assets/index-abc.js': CLEAN, 'assets/chunks/seed-def.js': 'var d=`demoNow`' }));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('packages/web/dist/assets/chunks/seed-def.js');
  });
  it('fails when there is no build to read', () => {
    root = mkdtempSync(join(tmpdir(), 'bundle-prod-'));
    const missing = check(root);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('no .js files');
    expect(check(dist({ 'index.html': '<html></html>' })).status).toBe(1);
  });
});
