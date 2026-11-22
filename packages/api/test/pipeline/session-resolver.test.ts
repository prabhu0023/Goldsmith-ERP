import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { systemClock } from '../../src/pipeline/server-clock.js';
import { noSessionResolver, sessionResolverFor } from '../../src/pipeline/session-resolver.js';
import { describeDb } from '../db/db-test-helpers.js';
import { type Harness, startHarness } from '../support/api-harness.js';

/** Never queried: these tests only check which resolver is chosen. */
const pool = {} as pg.Pool;

const configFor = (appEnv: string) =>
  loadConfig({
    APP_ENV: appEnv,
    APP_URL: 'http://localhost:3000',
    SESSION_SECRET: 'test-only-session-secret-0123456789abcdef',
  });

describe('session resolver choice (EP-03-S3, EP-04)', () => {
  it.each(['development', 'staging', 'production'])('is the cookie resolver when APP_ENV=%s and there is a database', (appEnv) => {
    const resolver = sessionResolverFor(configFor(appEnv), pool, systemClock);
    expect(resolver).not.toBe(noSessionResolver);
    expect(resolver.confirm).toBeTypeOf('function');
  });

  it('is none without a database: nobody is signed in', async () => {
    const resolver = sessionResolverFor(configFor('development'), undefined, systemClock);
    expect(resolver).toBe(noSessionResolver);
    expect(await resolver.resolve({} as never)).toBeNull();
  });
});

describeDb('the x-dev-session stub is gone (EP-04)', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  it('an x-dev-session header alone is ignored: unauthenticated', async () => {
    const { rows } = await h.pool.query<{ id: string }>('select id from sessions where user_id = $1', [h.userId]);
    const res = await h.call(
      'createLead',
      { customerName: 'Meena Iyer', items: [{ name: 'Bangle', qty: 1 }] },
      { headers: { 'x-dev-session': rows[0].id } },
    );
    expect(res).toEqual({ status: 401, body: { code: 'unauthenticated', message: 'Sign in to continue.' } });
    expect(h.captured).toEqual([]);
  });

  it('the gs_session cookie is accepted', async () => {
    const res = await h.call(
      'createLead',
      { customerName: 'Meena Iyer', items: [{ name: 'Bangle', qty: 1 }] },
      { session: h.session },
    );
    expect(res.status).toBe(200);
  });
});
