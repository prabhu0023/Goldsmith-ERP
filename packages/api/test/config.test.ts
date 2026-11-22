import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_API_PORT, ENV_VARS, loadConfig } from '../src/config.js';

const valid = {
  APP_ENV: 'development',
  APP_URL: 'http://localhost:3000',
  SESSION_SECRET: 'test-only-session-secret-0123456789abcdef',
};

describe('loadConfig', () => {
  it('reads a valid environment and defaults the port', () => {
    const c = loadConfig(valid);
    expect(c.appEnv).toBe('development');
    expect(c.port).toBe(DEFAULT_API_PORT);
    expect(c.databaseUrl).toBeUndefined();
  });

  it('defaults the maximum request body to 102400 bytes and reads a set value', () => {
    expect(loadConfig(valid).maxBodyBytes).toBe(102400);
    expect(loadConfig({ ...valid, API_MAX_BODY_BYTES: '2048' }).maxBodyBytes).toBe(2048);
  });

  it.each(['0', '-5', '1.5', 'lots'])('names API_MAX_BODY_BYTES when it is %s', (bad) => {
    expect(() => loadConfig({ ...valid, API_MAX_BODY_BYTES: bad })).toThrow(
      'API_MAX_BODY_BYTES must be a positive integer',
    );
  });

  it('defaults the idempotency retention to 24 hours and reads a set value', () => {
    expect(loadConfig(valid).idempotencyRetentionHours).toBe(24);
    expect(loadConfig({ ...valid, IDEMPOTENCY_RETENTION_HOURS: '72' }).idempotencyRetentionHours).toBe(72);
  });
  it.each(['0', '-1', '2.5', 'a day'])('names IDEMPOTENCY_RETENTION_HOURS when it is %s', (bad) => {
    expect(() => loadConfig({ ...valid, IDEMPOTENCY_RETENTION_HOURS: bad })).toThrow(
      'IDEMPOTENCY_RETENTION_HOURS must be a positive integer',
    );
  });
  it('defaults the database pool timeouts to 5000 ms connect and 30000 ms query, and reads set values', () => {
    expect(loadConfig(valid)).toMatchObject({ databaseConnectTimeoutMs: 5000, databaseQueryTimeoutMs: 30000 });
    expect(
      loadConfig({ ...valid, DATABASE_CONNECT_TIMEOUT_MS: '1500', DATABASE_QUERY_TIMEOUT_MS: '8000' }),
    ).toMatchObject({ databaseConnectTimeoutMs: 1500, databaseQueryTimeoutMs: 8000 });
  });
  it.each(['DATABASE_CONNECT_TIMEOUT_MS', 'DATABASE_QUERY_TIMEOUT_MS'])('names %s when it is not a positive integer', (name) => {
    for (const bad of ['0', '-1', '2.5', 'soon']) {
      expect(() => loadConfig({ ...valid, [name]: bad })).toThrow(`${name} must be a positive integer (milliseconds)`);
    }
  });
  it('runs the job scheduler every 15000 ms by default and reads set values (EP-10)', () => {
    expect(loadConfig(valid)).toMatchObject({ jobsEnabled: true, jobsPollIntervalMs: 15000 });
    expect(loadConfig({ ...valid, JOBS_ENABLED: 'false', JOBS_POLL_INTERVAL_MS: '1000' })).toMatchObject({
      jobsEnabled: false,
      jobsPollIntervalMs: 1000,
    });
    expect(loadConfig({ ...valid, JOBS_ENABLED: 'true', JOBS_POLL_INTERVAL_MS: '60000' })).toMatchObject({
      jobsEnabled: true,
      jobsPollIntervalMs: 60000,
    });
  });
  it.each(['maybe', 'yes', '1', 'FALSE'])('names JOBS_ENABLED when it is %s', (bad) => {
    expect(() => loadConfig({ ...valid, JOBS_ENABLED: bad })).toThrow('JOBS_ENABLED must be true or false');
  });
  it.each(['0', '500', '70000', '1500.5', 'abc'])('names JOBS_POLL_INTERVAL_MS when it is %s', (bad) => {
    expect(() => loadConfig({ ...valid, JOBS_POLL_INTERVAL_MS: bad })).toThrow(
      'JOBS_POLL_INTERVAL_MS must be an integer between 1000 and 60000 (milliseconds)',
    );
  });
  it('defaults the sign-in settings (EP-04) and reads set values', () => {
    expect(loadConfig(valid)).toMatchObject({
      accountEmailMode: 'stub',
      sessionIdleMinutes: 720,
      authLimits: { windowMinutes: 15, signInPerPhone: 10, signInPerDevice: 30, resetPerPhone: 3, resetPerDevice: 10 },
    });
    expect(loadConfig({ ...valid, APP_ENV: 'staging' }).accountEmailMode).toBe('stub');
    expect(loadConfig({ ...valid, APP_ENV: 'production' }).accountEmailMode).toBe('disabled');
    expect(
      loadConfig({
        ...valid,
        ACCOUNT_EMAIL_MODE: 'stub',
        SESSION_IDLE_MINUTES: '60',
        AUTH_RATE_WINDOW_MINUTES: '5',
        AUTH_SIGN_IN_PER_PHONE: '4',
        AUTH_SIGN_IN_PER_DEVICE: '8',
        AUTH_RESET_PER_PHONE: '1',
        AUTH_RESET_PER_DEVICE: '2',
      }),
    ).toMatchObject({
      accountEmailMode: 'stub',
      sessionIdleMinutes: 60,
      authLimits: { windowMinutes: 5, signInPerPhone: 4, signInPerDevice: 8, resetPerPhone: 1, resetPerDevice: 2 },
    });
  });
  it.each([
    'SESSION_IDLE_MINUTES',
    'AUTH_RATE_WINDOW_MINUTES',
    'AUTH_SIGN_IN_PER_PHONE',
    'AUTH_SIGN_IN_PER_DEVICE',
    'AUTH_RESET_PER_PHONE',
    'AUTH_RESET_PER_DEVICE',
  ])('names %s when it is not a positive integer', (name) => {
    for (const bad of ['0', '-1', '2.5', 'often']) {
      expect(() => loadConfig({ ...valid, [name]: bad })).toThrow(`${name} must be a positive integer`);
    }
  });
  it('defaults the storage and file settings (EP-09) and reads set values', () => {
    expect(loadConfig(valid)).toMatchObject({
      storageEndpoint: undefined,
      storageRegion: 'us-east-1',
      fileMaxBytes: 10485760,
      fileLinkTtlSeconds: 900,
      fileRetentionPoDays: 365,
      fileRetentionStandardDays: undefined,
    });
    expect(
      loadConfig({
        ...valid,
        STORAGE_ENDPOINT: 'http://localhost:8333',
        STORAGE_REGION: 'ap-south-1',
        FILE_MAX_BYTES: '2048',
        FILE_LINK_TTL_SECONDS: '5',
        FILE_RETENTION_PO_DAYS: '30',
        FILE_RETENTION_STANDARD_DAYS: '3650',
      }),
    ).toMatchObject({
      storageEndpoint: 'http://localhost:8333',
      storageRegion: 'ap-south-1',
      fileMaxBytes: 2048,
      fileLinkTtlSeconds: 5,
      fileRetentionPoDays: 30,
      fileRetentionStandardDays: 3650,
    });
  });
  it.each(['FILE_MAX_BYTES', 'FILE_LINK_TTL_SECONDS', 'FILE_RETENTION_PO_DAYS', 'FILE_RETENTION_STANDARD_DAYS'])(
    'names %s when it is not a positive integer',
    (name) => {
      for (const bad of ['0', '-1', '2.5', 'lots']) {
        expect(() => loadConfig({ ...valid, [name]: bad })).toThrow(`${name} must be a positive integer`);
      }
    },
  );
  it('names STORAGE_ENDPOINT when it is not an absolute URL', () => {
    expect(() => loadConfig({ ...valid, STORAGE_ENDPOINT: 'not a url' })).toThrow(
      'STORAGE_ENDPOINT must be an absolute URL',
    );
  });
  it('refuses an unknown ACCOUNT_EMAIL_MODE', () => {
    expect(() => loadConfig({ ...valid, ACCOUNT_EMAIL_MODE: 'smtp' })).toThrow('ACCOUNT_EMAIL_MODE must be stub or unset');
  });
  it('S4 AC2: refuses ACCOUNT_EMAIL_MODE=stub in production', () => {
    expect(() => loadConfig({ ...valid, APP_ENV: 'production', ACCOUNT_EMAIL_MODE: 'stub' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...valid, APP_ENV: 'production', ACCOUNT_EMAIL_MODE: 'stub' })).toThrow(
      'ACCOUNT_EMAIL_MODE=stub is not allowed in production',
    );
  });
  it('names every missing required variable', () => {
    const err = (() => {
      try {
        loadConfig({ APP_ENV: 'development', SESSION_SECRET: '' });
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).message).toContain('APP_URL is required');
    expect((err as ConfigError).message).toContain('SESSION_SECRET is required');
  });

  it('rejects bad values without printing them', () => {
    const secret = 'short-secret';
    try {
      loadConfig({ ...valid, APP_ENV: 'prod', SESSION_SECRET: secret, API_PORT: 'abc' });
      expect.unreachable();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('APP_ENV must be one of');
      expect(msg).toContain('SESSION_SECRET must be at least');
      expect(msg).toContain('API_PORT must be an integer');
      expect(msg).not.toContain(secret);
    }
  });
});

describe('.env.example', () => {
  const example = readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8');
  const entries = new Map(
    example
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const eq = line.indexOf('=');
        return [line.slice(0, eq).trim(), line.slice(eq + 1).trim()] as const;
      }),
  );

  it.each(ENV_VARS.map((v) => v.name))('documents %s, which packages/api/src/config.ts reads', (name) => {
    expect(entries.has(name), `${name} is read by packages/api/src/config.ts but missing from .env.example`).toBe(
      true,
    );
  });

  it('holds no values, only names', () => {
    const filled = [...entries].filter(([, value]) => value !== '' && value !== '""').map(([name]) => name);
    expect(filled, 'these variables have a value in .env.example').toEqual([]);
  });
});
