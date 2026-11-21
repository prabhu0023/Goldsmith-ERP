import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { allowAllRateLimiter, type RateLimiter, type RateLimitInfo } from '../../src/pipeline/hooks.js';
import { addPiece, describeDb } from '../db/db-test-helpers.js';
import { type Harness, SERVER_NOW, startHarness } from '../support/api-harness.js';

const RATE_LIMITED = { code: 'rate_limited', message: 'Too many requests. Please wait a minute and try again.' };

/** A test limiter: `max` calls per minute per caller for one operation, counted on the server clock. */
function perMinute(operation: string, max: number): RateLimiter {
  const calls = new Map<string, number[]>();
  return ({ operation: op, userId, clientAddress }) => {
    if (op !== operation) return { allowed: true };
    const key = `${userId ?? clientAddress}`;
    const now = SERVER_NOW.getTime();
    const recent = (calls.get(key) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= max) return { allowed: false };
    calls.set(key, [...recent, now]);
    return { allowed: true };
  };
}

describeDb('rate-limit hook (EP-03-S11, S10 rule)', () => {
  let h: Harness;
  let limiter: RateLimiter = allowAllRateLimiter;
  const seen: RateLimitInfo[] = [];
  beforeAll(async () => {
    h = await startHarness({
      rateLimiter: (info) => {
        seen.push(info);
        return limiter(info);
      },
    });
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(() => {
    h.captured.length = 0;
    seen.length = 0;
    limiter = allowAllRateLimiter;
  });

  it('AC1: the default hook allows every request and the input reaches validation unchanged', async () => {
    await addPiece(h.pool, h.shop, 'TAG-R-1');
    const res = await h.call('updatePieceNote', { pieceId: 'TAG-R-1', version: 1, note: 'kept' }, { session: h.session });
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(h.captured[0].input).toEqual({ pieceId: 'TAG-R-1', version: 1, note: 'kept' });
    expect(allowAllRateLimiter({ operation: 'x', userId: null, clientAddress: '' })).toEqual({ allowed: true });
  });

  it('AC2, AC4: a 2-per-minute limiter refuses the third call with rate_limited; the service function does not run', async () => {
    limiter = perMinute('stockOutPiece', 2);
    for (const tag of ['TAG-R-2a', 'TAG-R-2b', 'TAG-R-2c']) await addPiece(h.pool, h.shop, tag);
    const first = await h.call('stockOutPiece', { pieceId: 'TAG-R-2a' }, { session: h.session });
    const second = await h.call('stockOutPiece', { pieceId: 'TAG-R-2b' }, { session: h.session });
    const third = await h.call('stockOutPiece', { pieceId: 'TAG-R-2c' }, { session: h.session });
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(third).toEqual({ status: 429, body: RATE_LIMITED });
    expect(Object.keys(third.body).sort()).toEqual(['code', 'message']);
    expect(h.captured.map((c) => c.input)).toEqual([{ pieceId: 'TAG-R-2a' }, { pieceId: 'TAG-R-2b' }]);
    const status = await h.pool.query('select status from pieces where shop_id = $1 and tag_no = $2', [h.shop.shopId, 'TAG-R-2c']);
    expect(status.rows[0].status).toBe('in_stock');
  });

  it('AC3: the hook gets the operation, the caller user id and the client address, nothing from the body', async () => {
    await h.call('readParcel', { parcelId: 'BODY-MARKER-123' }, { session: h.session });
    await h.call('readParcel', { parcelId: 'BODY-MARKER-456' });
    expect(seen).toHaveLength(2);
    for (const info of seen) {
      expect(Object.keys(info).sort()).toEqual(['clientAddress', 'operation', 'userId']);
      expect(info.operation).toBe('readParcel');
      expect(info.clientAddress).toMatch(/127\.0\.0\.1|::1/);
      expect(JSON.stringify(info)).not.toContain('BODY-MARKER');
    }
    expect(seen.map((i) => i.userId)).toEqual([h.userId, null]);
  });

  it('runs before validation: a refused caller gets rate_limited even for an invalid body', async () => {
    limiter = () => ({ allowed: false });
    const res = await h.call('createLead', { nonsense: true }, { session: h.session });
    expect(res).toEqual({ status: 429, body: RATE_LIMITED });
    expect(h.captured).toEqual([]);
  });

  it('S10 rule: the hook applies to Read Health too', async () => {
    const ok = await fetch(`${h.base}/health`);
    expect(ok.status).toBe(200);
    expect(seen.at(-1)).toMatchObject({ operation: 'readHealth', userId: null });
    limiter = (info) => ({ allowed: info.operation !== 'readHealth' });
    const refused = await fetch(`${h.base}/health`);
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual(RATE_LIMITED);
  });
});
