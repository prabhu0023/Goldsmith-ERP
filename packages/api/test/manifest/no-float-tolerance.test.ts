/**
 * Weight tests assert integer equality, never a float tolerance (EP-40-S2, epic section 13):
 * no test under packages/shared/test or packages/api/test uses a closeness matcher.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
const FORBIDDEN = ['toBe', 'CloseTo'].join('');
const here = fileURLToPath(new URL('..', import.meta.url));
const dirs = [here, fileURLToPath(new URL('../../../shared/test', import.meta.url))];
const testFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? testFiles(join(dir, e.name)) : /\.test\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
it('no shared or api test uses a float tolerance matcher', () => {
  const files = dirs.flatMap(testFiles);
  expect(files.length).toBeGreaterThan(100);
  const used = files.filter((f) => readFileSync(f, 'utf8').includes(FORBIDDEN)).map((f) => relative(here, f));
  expect(used).toEqual([]);
});
