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
