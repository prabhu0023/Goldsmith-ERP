/**
 * The bundle check (EP-09-S13 AC4): scripts/check-bundled-images.mjs run against a temp tree
 * through its root argument. It passes on a clean tree and the allow-list, and fails naming
 * every import form Vite would bundle the images through.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../../../../scripts/check-bundled-images.mjs', import.meta.url));

let root: string | undefined;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

/** A temp repo with packages/web/src holding `files` (path relative to src -> text). */
function tree(files: Record<string, string>): string {
  root = mkdtempSync(join(tmpdir(), 'bundle-check-'));
  const src = join(root, 'packages/web/src');
  for (const [path, text] of Object.entries({ 'assets/images/x.jpg': '', 'data/images.ts': '', ...files })) {
    mkdirSync(dirname(join(src, path)), { recursive: true });
    writeFileSync(join(src, path), text);
  }
  return root;
}

const check = (dir: string) => {
  const run = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
};

describe('bundled image check (EP-09-S13 AC4)', () => {
  it('passes a tree whose only image imports are in the allow-list', () => {
    const res = check(
      tree({
        'data/seed.ts': "import x from '../assets/images/x.jpg';\nimport { IMAGES } from './images';",
        'components/Clean.tsx': "import { useState } from 'react';\nconst u = new URL('./icon.svg', import.meta.url);",
        'styles/app.css': ".a { background: url('../assets/logo.svg'); }",
      }),
    );
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('bundled image check: ok');
  });

  it('fails with exit 1 naming each import form that reaches the bundled images', () => {
    const res = check(
      tree({
        'components/Static.tsx': "import x from '../assets/images/x.jpg';",
        'components/Alias.tsx': "export { IMAGES } from '@/src/data/images';",
        'components/Dynamic.tsx': "const m = import('../data/images.ts');",
        'components/Glob.tsx': "const all = import.meta.glob('../assets/images/*.jpg', { eager: true });",
        'components/GlobList.tsx': "const all = import.meta.glob(['!../assets/x', '../assets/**/*.jpg']);",
        'components/AssetUrl.tsx': "const u = new URL('../assets/images/x.jpg', import.meta.url).href;",
        'components/Query.tsx': "import u from '../assets/images/x.jpg?url';",
        'styles/app.css': '.hero { background: url(../assets/images/x.jpg); }',
        'styles/more.scss': "@import '../assets/images/x.css';",
      }),
    );
    expect(res.status).toBe(1);
    for (const line of [
      'packages/web/src/components/Static.tsx imports ../assets/images/x.jpg',
      'packages/web/src/components/Alias.tsx imports @/src/data/images',
      'packages/web/src/components/Dynamic.tsx imports ../data/images.ts',
      'packages/web/src/components/Glob.tsx imports ../assets/images/*.jpg',
      'packages/web/src/components/GlobList.tsx imports ../assets/**/*.jpg',
      'packages/web/src/components/AssetUrl.tsx imports ../assets/images/x.jpg',
      'packages/web/src/components/Query.tsx imports ../assets/images/x.jpg?url',
      'packages/web/src/styles/app.css imports ../assets/images/x.jpg',
      'packages/web/src/styles/more.scss imports ../assets/images/x.css',
    ]) {
      expect(res.stderr).toContain(line);
    }
    expect(res.stderr).not.toContain('!../assets/x');
  });
});
