/**
 * The test run record (EP-40-S1 AC5, EP-40-S13 AC5): scripts/test-run-record.mjs turns vitest
 * JSON reports into one table row per suite, in the job summary file when CI names one.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
const SCRIPT = fileURLToPath(new URL('../../../../scripts/test-run-record.mjs', import.meta.url));
let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});
const report = (passed: number, failed: number, pending = 0) => ({
  numPassedTests: passed,
  numFailedTests: failed,
  numPendingTests: pending,
  numTodoTests: 0,
  startTime: 1_000_000,
  testResults: [{ endTime: 1_001_500 }, { endTime: 1_002_400 }],
});
function run(files: Record<string, unknown>, env: Record<string, string> = {}) {
  dir = mkdtempSync(join(tmpdir(), 'run-record-'));
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, `${name}.json`), typeof body === 'string' ? body : JSON.stringify(body));
  }
  // CI sets GITHUB_SHA; drop it so the commit column is 'local' unless a test sets it.
  const { GITHUB_SHA: _ignored, ...inherited } = process.env;
  const res = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8', env: { ...inherited, GITHUB_STEP_SUMMARY: '', ...env } });
  return { status: res.status, stdout: res.stdout };
}
describe('test run record', () => {
  it('prints one row per suite with commit, passed, failed, skipped and duration', () => {
    const res = run({ shared: report(194, 0), web: report(68, 1, 2), api: report(1200, 0) }, { GITHUB_SHA: 'abcdef0123456789' });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('| abcdef012345 | shared | 194 | 0 | 0 | 2.4 s |');
    expect(res.stdout).toContain('| abcdef012345 | web | 68 | 1 | 2 | 2.4 s |');
    expect(res.stdout).toContain('| abcdef012345 | api | 1200 | 0 | 0 | 2.4 s |');
  });
  it('names a suite with no report or an unreadable one, and still exits 0', () => {
    const res = run({ shared: report(1, 0), web: 'not json' });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('| local | web | unreadable report |');
    expect(res.stdout).toContain('| local | api | no report |');
  });
  it('appends the table to the job summary file instead of printing it', () => {
    const summary = join(tmpdir(), `summary-${process.pid}.md`);
    writeFileSync(summary, 'earlier step\n');
    try {
      const res = run({ shared: report(3, 0), web: report(2, 0), api: report(1, 0) }, { GITHUB_STEP_SUMMARY: summary });
      expect(res.stdout).toBe('');
      const text = readFileSync(summary, 'utf8');
      expect(text.startsWith('earlier step\n')).toBe(true);
      expect(text).toContain('### Test run record');
      expect(text).toContain('| local | shared | 3 | 0 | 0 |');
    } finally {
      rmSync(summary, { force: true });
    }
  });
});
