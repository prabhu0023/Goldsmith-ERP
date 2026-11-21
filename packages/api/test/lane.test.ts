import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { readDbEnv } from '../src/db/db-env.js';
import { laneApiPort, laneDatabaseUrl, laneTestDatabaseUrl, readLane, testDatabaseUrl } from '../src/lane.js';
import { assertWipeableTestDatabase } from './db/test-db-guard.js';

const server = 'postgres://user:pw@localhost:5432';
const valid = {
  APP_ENV: 'development',
  APP_URL: 'http://localhost:3000',
  SESSION_SECRET: 'test-only-session-secret-0123456789abcdef',
  DATABASE_URL: `${server}/goldsmith_dev`,
  TEST_DATABASE_URL: `${server}/goldsmith_test`,
};

describe('lanes (LANE)', () => {
  it('changes nothing when LANE is unset or empty', () => {
    for (const env of [valid, { ...valid, LANE: '' }]) {
      expect(readLane(env)).toBeUndefined();
      expect(loadConfig(env)).toMatchObject({ port: 4000, databaseUrl: `${server}/goldsmith_dev` });
      expect(readDbEnv(env)).toMatchObject({
        databaseUrl: `${server}/goldsmith_dev`,
        testDatabaseUrl: `${server}/goldsmith_test`,
      });
    }
  });

  it('gives lane a goldsmith_dev_a, goldsmith_a_test and api port 4001; lane b 4002', () => {
    const a = { ...valid, LANE: 'a' };
    expect(loadConfig(a)).toMatchObject({ lane: 'a', port: 4001, databaseUrl: `${server}/goldsmith_dev_a` });
    expect(readDbEnv(a)).toMatchObject({
      lane: 'a',
      databaseUrl: `${server}/goldsmith_dev_a`,
      testDatabaseUrl: `${server}/goldsmith_a_test`,
    });
    expect(loadConfig({ ...valid, LANE: 'b' }).port).toBe(4002);
    expect(laneApiPort('z')).toBe(4026);
  });

  it('keeps a name that already carries the lane and an API_PORT that is set', () => {
    expect(laneDatabaseUrl(`${server}/goldsmith_dev_a`, 'a')).toBe(`${server}/goldsmith_dev_a`);
    expect(laneTestDatabaseUrl(`${server}/goldsmith_a_test`, 'a')).toBe(`${server}/goldsmith_a_test`);
    expect(loadConfig({ ...valid, LANE: 'a', API_PORT: '5001' }).port).toBe(5001);
  });

  it('keeps the test wipe guard: a lane test database still ends in _test, a dev URL is still refused', () => {
    expect(assertWipeableTestDatabase(testDatabaseUrl({ ...valid, LANE: 'b' }) ?? '')).toBe('goldsmith_b_test');
    const wrong = testDatabaseUrl({ LANE: 'b', TEST_DATABASE_URL: `${server}/goldsmith_dev` }) ?? '';
    expect(() => assertWipeableTestDatabase(wrong)).toThrow('does not end in _test');
    expect(testDatabaseUrl({ LANE: 'b' })).toBeUndefined();
  });

  it.each(['A', 'ab', '1', 'lane-a'])('refuses LANE=%s', (bad) => {
    expect(() => readLane({ LANE: bad })).toThrow('LANE must be one lower-case letter');
    expect(() => loadConfig({ ...valid, LANE: bad })).toThrow('LANE must be one lower-case letter');
  });
});
