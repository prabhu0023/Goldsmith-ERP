import { describe, expect, it } from 'vitest';
import {
  assertEnvironmentAllowed,
  assertRestoreBucket,
  assertRestoreTarget,
  assertTargetAbsent,
  OpsGuardError,
} from '../../src/ops/ops-guards.js';
const lane = (name: string, extra: Partial<Parameters<typeof assertRestoreTarget>[0]> = {}) =>
  assertRestoreTarget({ name, liveDatabase: 'goldsmith_dev_c', appEnv: 'development', lane: 'c', ...extra });
describe('assertRestoreTarget', () => {
  it.each(['goldsmith_restore_c', 'goldsmith_restore_c_ab12cd', 'goldsmith_restore_x_c_1'])('accepts %s with LANE=c', (name) => {
    expect(() => lane(name)).not.toThrow();
  });
  it.each([
    'goldsmith_dev_c',
    'goldsmith_dev',
    'goldsmith_dev_a',
    'goldsmith_test',
    'goldsmith_c_test',
    'goldsmith_restore_a',
    'goldsmith_restore',
    'goldsmith_restore_cc',
    'goldsmith_catalog_c',
    'postgres',
    'template1',
    'Goldsmith_restore_c',
    'goldsmith_restore_c"; drop database x; --',
  ])('refuses %s with LANE=c', (name) => {
    expect(() => lane(name)).toThrow(OpsGuardError);
  });
  it('refuses the database DATABASE_URL names', () => {
    expect(() => lane('goldsmith_restore_c', { liveDatabase: 'goldsmith_restore_c' })).toThrow('DATABASE_URL');
  });
  it('accepts a restore name without a lane (CI) but still refuses non-restore names', () => {
    expect(() => lane('goldsmith_restore_ab12', { lane: undefined })).not.toThrow();
    expect(() => lane('goldsmith_dev', { lane: undefined })).toThrow(OpsGuardError);
  });
  it('refuses production always and staging without the flag', () => {
    expect(() => lane('goldsmith_restore_c', { appEnv: 'production' })).toThrow('production');
    expect(() => lane('goldsmith_restore_c', { appEnv: 'production', allowStaging: true })).toThrow('production');
    expect(() => lane('goldsmith_restore_c', { appEnv: 'staging' })).toThrow('--allow-staging');
    expect(() => lane('goldsmith_restore_c', { appEnv: 'staging', allowStaging: true })).not.toThrow();
  });
});
describe('assertRestoreBucket', () => {
  const bucket = (name: string, appEnv: 'development' | 'production' = 'development') =>
    assertRestoreBucket({ name, appEnv, lane: 'c' });
  it('accepts goldsmith-restore-c and a suffixed name', () => {
    expect(() => bucket('goldsmith-restore-c')).not.toThrow();
    expect(() => bucket('goldsmith-restore-c-ab12')).not.toThrow();
  });
  it.each(['goldsmith-files', 'goldsmith-files-c', 'goldsmith-restore-a', 'goldsmith-restore'])('refuses %s', (name) => {
    expect(() => bucket(name)).toThrow(OpsGuardError);
  });
  it('refuses production', () => {
    expect(() => bucket('goldsmith-restore-c', 'production')).toThrow('production');
  });
});
describe('other guards', () => {
  it('assertEnvironmentAllowed lets development through', () => {
    expect(() => assertEnvironmentAllowed('development', false)).not.toThrow();
  });
  it('a restore never overwrites an existing database', () => {
    expect(() => assertTargetAbsent('goldsmith_restore_c', true)).toThrow('never overwrites');
    expect(() => assertTargetAbsent('goldsmith_restore_c', false)).not.toThrow();
  });
});
