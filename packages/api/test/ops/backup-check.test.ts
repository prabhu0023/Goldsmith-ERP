import { afterAll, describe, expect, it } from 'vitest';
import { checkBackupPresent } from '../../src/ops/backup-check.js';
import { appendRun, type RunRecord } from '../../src/ops/backup-records.js';
import { type BackupFolder, backupFolder, recordingNotifier } from './ops-test-helpers.js';
const folders: BackupFolder[] = [];
afterAll(() => {
  for (const f of folders) f.cleanup();
});
async function withRun(over: Partial<RunRecord> = {}) {
  const folder = backupFolder();
  folders.push(folder);
  await appendRun(folder.store, {
    id: 'db-20260518T010000Z-aaaa',
    kind: 'daily full',
    status: 'complete',
    environment: 'development',
    startedAt: '2026-05-18T01:00:00.000Z',
    finishedAt: '2026-05-18T01:00:30.000Z',
    ...over,
  });
  return folder;
}
const check = (folder: BackupFolder, now: string, notifier = recordingNotifier(), graceHours = 2) =>
  checkBackupPresent({ store: folder.store, notifier, environment: 'development', graceHours, now: new Date(now) }).then((r) => ({
    r,
    notifier,
  }));
describe('checkBackupPresent (injected clock)', () => {
  it('passes within 24 hours plus the grace period', async () => {
    const { r, notifier } = await check(await withRun(), '2026-05-19T03:00:30Z');
    expect(r.ok).toBe(true);
    expect(notifier.alerts).toEqual([]);
  });
  it('fails and alerts one second after 24 hours plus grace', async () => {
    const { r, notifier } = await check(await withRun(), '2026-05-19T03:00:31Z');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('No complete daily full backup in the last 26 hours');
    expect(notifier.alerts).toHaveLength(1);
    expect(notifier.alerts[0]).toMatchObject({ environment: 'development', kind: 'daily full' });
  });
  it('honours BACKUP_GRACE_HOURS', async () => {
    expect((await check(await withRun(), '2026-05-19T03:00:31Z', recordingNotifier(), 4)).r.ok).toBe(true);
    expect((await check(await withRun(), '2026-05-19T01:00:31Z', recordingNotifier(), 0)).r.ok).toBe(false);
  });
  it('fails when nothing was ever recorded', async () => {
    const folder = backupFolder();
    folders.push(folder);
    const { r, notifier } = await check(folder, '2026-05-19T03:00:00Z');
    expect(r).toMatchObject({ ok: false, message: 'No complete daily full backup has been recorded' });
    expect(notifier.alerts).toHaveLength(1);
  });
  it('ignores failed, deleted, other-environment and file storage runs', async () => {
    for (const over of [
      { status: 'failed' as const },
      { status: 'deleted' as const },
      { environment: 'staging' },
      { kind: 'file storage' as const },
    ]) {
      expect((await check(await withRun(over), '2026-05-18T02:00:00Z')).r.ok).toBe(false);
    }
  });
});
