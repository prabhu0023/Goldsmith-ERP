import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DRILLS_PATH,
  DRILL_STEPS,
  DRILLS_HEADER,
  type DrillEntry,
  DrillRecordError,
  recordDrill,
} from '../../src/ops/drill-record.js';

const allPass = Object.fromEntries(DRILL_STEPS.map((_, i) => [i + 1, 'pass']));
const entry = (over: Partial<DrillEntry> = {}): DrillEntry => ({
  date: '2026-11-30',
  environment: 'development',
  restorePoint: 'backup db-20261130T090000Z-ab12 taken 2026-11-30T09:00:00Z',
  durationMinutes: 12.5,
  steps: { ...allPass },
  runBy: 'prabhu',
  notes: 'first drill',
  ...over,
});

describe('recordDrill', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gs-drills-'));
  let path: string;
  let n = 0;
  beforeEach(() => {
    path = join(dir, `restore-drills-${n++}.md`);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const rows = (): string[] =>
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((l) => l.startsWith('| 20'));

  it('creates the file with its header and appends one row with every field', () => {
    const result = recordDrill(entry(), { path });
    const text = readFileSync(path, 'utf8');
    expect(text.startsWith(DRILLS_HEADER)).toBe(true);
    expect(rows()).toEqual([result.row]);
    expect(result.row).toBe(
      '| 2026-11-30 | development | backup db-20261130T090000Z-ab12 taken 2026-11-30T09:00:00Z | 12.5 | within 60 min (provisional) | 8 of 8 pass | prabhu | first drill |',
    );
    expect(result.withinTarget).toBe(true);
    expect(result.provisional).toBe(true);
  });

  it('appends under an existing header and keeps earlier rows', () => {
    writeFileSync(path, DRILLS_HEADER);
    recordDrill(entry(), { path });
    recordDrill(entry({ date: '2026-12-01' }), { path });
    expect(rows().map((r) => r.slice(0, 12))).toEqual(['| 2026-11-30', '| 2026-12-01']);
    expect(readFileSync(path, 'utf8').match(/^\| Date /gm)).toHaveLength(1);
  });

  it('marks a drill over the target, and a custom target is not provisional', () => {
    const over = recordDrill(entry({ durationMinutes: 61 }), { path });
    expect(over.withinTarget).toBe(false);
    expect(over.row).toContain('over 60 min (provisional)');
    const custom = recordDrill(entry({ durationMinutes: 30, targetMinutes: 20 }), { path });
    expect(custom.withinTarget).toBe(false);
    expect(custom.provisional).toBe(false);
    expect(custom.row).toContain('over 20 min |');
    expect(recordDrill(entry({ durationMinutes: 60 }), { path }).withinTarget).toBe(true);
  });

  it('names the failed steps', () => {
    const { row } = recordDrill(entry({ steps: { ...allPass, 4: 'fail', 5: 'fail' } }), { path });
    expect(row).toContain('| pass 1,2,3,6,7,8; fail 4,5 |');
  });

  it('rejects a missing step and writes nothing', () => {
    const { 6: _skipped, ...steps } = allPass;
    expect(() => recordDrill(entry({ steps }), { path })).toThrow(/Step 6 \(Check the audit log\) has no result/);
    expect(() => recordDrill(entry({ steps: { ...allPass, 2: 'maybe' } }), { path })).toThrow(/Step 2 .* pass or fail/);
    expect(() => recordDrill(entry({ steps: { ...allPass, 9: 'pass' } }), { path })).toThrow(/Step "9"/);
    expect(() => readFileSync(path)).toThrow(/ENOENT/);
  });

  it('rejects an invalid date, empty fields and a bad duration', () => {
    for (const date of ['', '30-11-2026', '2026-02-30', '2026-13-01', 'yesterday']) {
      expect(() => recordDrill(entry({ date }), { path })).toThrow(DrillRecordError);
    }
    expect(() => recordDrill(entry({ environment: ' ' }), { path })).toThrow(/Environment is required/);
    expect(() => recordDrill(entry({ restorePoint: '' }), { path })).toThrow(/Restore point is required/);
    expect(() => recordDrill(entry({ runBy: '' }), { path })).toThrow(/Run by is required/);
    for (const durationMinutes of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => recordDrill(entry({ durationMinutes }), { path })).toThrow(/Duration must be/);
    }
    expect(() => recordDrill(entry({ targetMinutes: 0 }), { path })).toThrow(/Target must be/);
    expect(() => readFileSync(path)).toThrow(/ENOENT/);
  });

  it('keeps a note with a pipe or a line break in one table cell', () => {
    const { row } = recordDrill(entry({ notes: 'a | b\nsecond line' }), { path });
    expect(row.endsWith('| a \\| b second line |')).toBe(true);
    expect(rows()).toHaveLength(1);
  });

  it('writes "-" when there are no notes', () => {
    expect(recordDrill(entry({ notes: undefined }), { path }).row.endsWith('| prabhu | - |')).toBe(true);
  });

  it('keeps the committed docs/setup/restore-drills.md at the header until a drill is recorded', () => {
    const committed = readFileSync(DEFAULT_DRILLS_PATH, 'utf8');
    expect(committed.startsWith(DRILLS_HEADER)).toBe(true);
  });

  it('points by default at docs/setup/restore-drills.md in the repository', () => {
    expect(DEFAULT_DRILLS_PATH.endsWith('/docs/setup/restore-drills.md')).toBe(true);
  });
});
