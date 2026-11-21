import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const JOBS_DIR = fileURLToPath(new URL('../../src/jobs/', import.meta.url));
/** Shared helpers that read the machine's local zone (or the prototype's demo clock). */
const LOCAL_TIME_HELPERS = ['startOfDay', 'sameDay', 'daysBetween', 'dueIn', 'isMonthDayToday', 'demoNow'];
const LOCAL_DATE_CALLS = /\.(getHours|getDate|getDay|setHours)\(/;

const sources = readdirSync(JOBS_DIR, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.ts'))
  .map((file) => ({ file, text: readFileSync(`${JOBS_DIR}${file}`, 'utf8') }));

/** EP-10-S10 AC5: no job computes days or hours in the machine's local zone. */
describe('jobs use Asia/Kolkata time only (EP-10-S10)', () => {
  it('reads every job source file, handlers included', () => {
    const files = sources.map((s) => s.file);
    expect(files).toContain('scheduler.ts');
    expect(files.some((f) => f.includes('handlers'))).toBe(true);
  });

  it.each(sources.map((s) => [s.file, s.text] as const))('%s imports no local-time helper', (_file, text) => {
    const imported = [...text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from/g)].flatMap((m) =>
      m[1].split(',').map((name) => name.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]),
    );
    expect(imported.filter((name) => LOCAL_TIME_HELPERS.includes(name))).toEqual([]);
    expect(text).not.toMatch(LOCAL_DATE_CALLS);
  });
});
