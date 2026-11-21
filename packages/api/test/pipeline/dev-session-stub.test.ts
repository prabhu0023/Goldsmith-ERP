import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { systemClock } from '../../src/pipeline/server-clock.js';
import {
  createDevSessionResolver,
  noSessionResolver,
  sessionResolverFor,
} from '../../src/pipeline/session-resolver.js';

/** Never queried: these tests only check which resolver is chosen. */
const pool = {} as pg.Pool;

const configFor = (appEnv: string) =>
  loadConfig({
    APP_ENV: appEnv,
    APP_URL: 'http://localhost:3000',
    SESSION_SECRET: 'test-only-session-secret-0123456789abcdef',
  });

describe('development session stub (EP-03-S3)', () => {
  it.each(['staging', 'production'] as const)('is refused when APP_ENV=%s', (appEnv) => {
    expect(() => createDevSessionResolver({ appEnv, pool, clock: systemClock })).toThrow(
      `The development session stub is refused when APP_ENV=${appEnv}`,
    );
  });

  it('is chosen in development when there is a database', () => {
    const resolver = sessionResolverFor(configFor('development'), pool, systemClock);
    expect(resolver).not.toBe(noSessionResolver);
  });

  it.each(['staging', 'production'])('is never chosen when APP_ENV=%s: nobody is signed in', async (appEnv) => {
    const resolver = sessionResolverFor(configFor(appEnv), pool, systemClock);
    expect(resolver).toBe(noSessionResolver);
    expect(await resolver.resolve({} as never)).toBeNull();
  });

  it('is not chosen without a database', () => {
    expect(sessionResolverFor(configFor('development'), undefined, systemClock)).toBe(noSessionResolver);
  });
});
