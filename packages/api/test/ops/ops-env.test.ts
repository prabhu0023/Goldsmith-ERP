import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readBackupKey, readOpsEnv } from '../../src/ops/ops-env.js';
const base = { DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/goldsmith_dev', APP_ENV: 'development' };
describe('readOpsEnv', () => {
  it('uses the defaults and the repository .backups folder', () => {
    const env = readOpsEnv(base);
    expect(env).toMatchObject({ retentionDays: 30, graceHours: 2, alertGroupMinutes: 60, pgContainer: undefined });
    expect(env.laneDir.endsWith(join('.backups', 'default'))).toBe(true);
  });
  it('applies the lane to the database and the backup folder', () => {
    const env = readOpsEnv({ ...base, LANE: 'c', BACKUP_DIR: '/tmp/gs-backups' });
    expect(env.databaseUrl).toContain('/goldsmith_dev_c');
    expect(env.laneDir).toBe(join('/tmp/gs-backups', 'c'));
  });
  it('reads the BACKUP_* settings', () => {
    const env = readOpsEnv({
      ...base,
      BACKUP_RETENTION_DAYS: '7',
      BACKUP_GRACE_HOURS: '0',
      BACKUP_ALERT_GROUP_MINUTES: '5',
      BACKUP_PG_CONTAINER: 'pg-1',
    });
    expect(env).toMatchObject({ retentionDays: 7, graceHours: 0, alertGroupMinutes: 5, pgContainer: 'pg-1' });
  });
  it.each(['BACKUP_RETENTION_DAYS', 'BACKUP_GRACE_HOURS', 'BACKUP_ALERT_GROUP_MINUTES'])(
    'rejects a bad %s, naming the variable but not the value',
    (name) => {
      const run = () => readOpsEnv({ ...base, [name]: 'soon-4242' });
      expect(run).toThrow(name);
      expect(run).not.toThrow('4242');
    },
  );
  it('rejects a retention of 0 days', () => {
    expect(() => readOpsEnv({ ...base, BACKUP_RETENTION_DAYS: '0' })).toThrow('BACKUP_RETENTION_DAYS');
  });
});
describe('readBackupKey', () => {
  it('returns 32 bytes for 64 hex characters', () => {
    expect(readBackupKey({ BACKUP_ENCRYPTION_KEY: 'ab'.repeat(32) })).toHaveLength(32);
  });
  it('names the variable when it is missing', () => {
    expect(() => readBackupKey({})).toThrow('BACKUP_ENCRYPTION_KEY is required');
  });
  it('refuses a wrong key without printing it', () => {
    const bad = 'not-a-valid-key-9f8e7d6c';
    const run = () => readBackupKey({ BACKUP_ENCRYPTION_KEY: bad });
    expect(run).toThrow('BACKUP_ENCRYPTION_KEY must be 64 hex characters');
    expect(run).not.toThrow(bad);
  });
});
describe('.env.example', () => {
  const lines = readFileSync(new URL('../../../../.env.example', import.meta.url), 'utf8').split('\n');
  it.each([
    'BACKUP_ENCRYPTION_KEY',
    'BACKUP_DIR',
    'BACKUP_RETENTION_DAYS',
    'BACKUP_GRACE_HOURS',
    'BACKUP_ALERT_GROUP_MINUTES',
    'BACKUP_PG_CONTAINER',
  ])('names %s with an empty value', (name) => {
    expect(lines).toContain(`${name}=`);
  });
});
