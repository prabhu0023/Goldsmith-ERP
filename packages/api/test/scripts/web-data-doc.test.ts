/**
 * The pattern document (EP-08-S17 AC1, AC2, AC4): docs/setup/web-data.md has the required
 * sections, names the weight helpers, and every source file and test it cites exists.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const doc = readFileSync(join(ROOT, 'docs/setup/web-data.md'), 'utf8');
/** Every file under `dir` as a path from the repo root. */
const walk = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(`${dir}/${e.name}`)) : [`${dir}/${e.name}`],
  );
const known = [...walk('packages/web/src'), ...walk('packages/api/test/scripts'), ...walk('packages/api/test/live'), ...walk('scripts'), ...walk('docs/setup')];
const headings = doc.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3));
describe('docs/setup/web-data.md (EP-08-S17)', () => {
  it('AC1: has the five required sections', () => {
    for (const heading of [
      'Declaring a query',
      'Declaring an action and what it affects',
      'Adding event-to-query entries',
      'Loading, read error, reconnecting and offline states',
      'Showing refusal sentences and retry',
    ]) {
      expect(headings, heading).toContain(heading);
    }
  });
  it('AC4: has the weights rule with the integer helpers and no floating point', () => {
    expect(headings).toContain('Weights');
    for (const word of ['gramsToUnits', 'unitsToGrams', 'fmtG', '0.0001 g', 'four decimals', 'floating point']) {
      expect(doc).toContain(word);
    }
  });
  it('has the migration checklist, the worked example, the acceptance-criteria map and the lane-a run', () => {
    for (const heading of ['Moving a screen off `useStore()`', 'Worked example', 'Acceptance-criteria map', 'Lane-a two-browser run (EP-08-S9, S18 AC2)']) {
      expect(headings, heading).toContain(heading);
    }
    expect(doc).toContain('npm run lint');
    for (let n = 1; n <= 19; n += 1) expect(doc, `S${n}`).toMatch(new RegExp(`\\| S${n} `));
  });
  it('AC2: the worked example cites the migrated screens, and every cited path exists', () => {
    for (const file of ['StaffDirectory.tsx', 'SecurityLog.tsx', 'OnboardStaff.tsx']) expect(doc).toContain(file);
    const cited = [...doc.matchAll(/`((?:packages|scripts|docs|components|query|shell|api|auth|settings|people|ui)[\w./-]*\.(?:ts|tsx|mjs|md))`/g)].map((m) => m[1]);
    expect(cited.length).toBeGreaterThan(20);
    // A path is exact from the repo root, or the tail of one file under the web source, api tests, scripts or docs.
    const missing = cited.filter((path) => !existsSync(join(ROOT, path)) && !known.some((file) => file === path || file.endsWith(`/${path}`)));
    expect(missing).toEqual([]);
  });
});
