import type { Actor, ErrorCode } from '@goldsmith/shared';
import { ERROR_CODES } from '@goldsmith/shared';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { ForbiddenError, INTERNAL_MESSAGE } from '../../src/pipeline/api-errors.js';
import { addPiece, describeDb } from '../db/db-test-helpers.js';
import { type Harness, leaksIn, startHarness } from '../support/api-harness.js';
import { REFUSAL_SENTENCE } from '../support/fixture-operations.js';

describeDb('one error format (EP-03-S4, S5)', () => {
  let h: Harness;
  let deny = false;
  let limit = false;
  const permissionCalls: Array<{ operation: string; actor: Actor }> = [];
  beforeAll(async () => {
    h = await startHarness({
      permissions: (operation, actor) => {
        permissionCalls.push({ operation, actor });
        if (deny) throw new ForbiddenError();
      },
      rateLimiter: () => ({ allowed: !limit }),
    });
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(() => {
    h.captured.length = 0;
    h.logged.length = 0;
    permissionCalls.length = 0;
    deny = false;
    limit = false;
  });

  const pieceRow = async (tag: string) =>
    (await h.pool.query('select status, note, version from pieces where shop_id = $1 and tag_no = $2', [h.shop.shopId, tag]))
      .rows[0];

  it('S4 AC3: a second stock-out of a sold piece is refused as already taken', async () => {
    await addPiece(h.pool, h.shop, 'TAG-E-1');
    expect(await h.call('stockOutPiece', { pieceId: 'TAG-E-1' }, { session: h.session })).toEqual({
      status: 200,
      body: { ok: true },
    });
    const second = await h.call('stockOutPiece', { pieceId: 'TAG-E-1' }, { session: h.session });
    expect(second).toEqual({ status: 422, body: { code: 'rule_refused', message: 'TAG-E-1 is already taken.' } });
    expect(await pieceRow('TAG-E-1')).toMatchObject({ status: 'billed', version: 2 });
  });

  it('S4 AC2: every rule refusal has the same status, exactly {code, message}, nothing internal', async () => {
    await addPiece(h.pool, h.shop, 'TAG-E-2');
    await h.call('stockOutPiece', { pieceId: 'TAG-E-2' }, { session: h.session });
    const refusals = [
      await h.call('stockOutPiece', { pieceId: 'TAG-E-2' }, { session: h.session }),
      await h.call('writeThenRefuse', { pieceId: 'TAG-E-2' }, { session: h.session }),
    ];
    expect(refusals.map((r) => r.body.message)).toEqual(['TAG-E-2 is already taken.', REFUSAL_SENTENCE]);
    for (const r of refusals) {
      expect(r.status).toBe(422);
      expect(Object.keys(r.body).sort()).toEqual(['code', 'message']);
      expect(leaksIn(r.body)).toEqual([]);
    }
  });

  it('S4 AC5: an unexpected error answers internal with a generic sentence; details only in the server log', async () => {
    await addPiece(h.pool, h.shop, 'TAG-E-3');
    const res = await h.call('writeThenCrash', { pieceId: 'TAG-E-3' }, { session: h.session });
    expect(res).toEqual({ status: 500, body: { code: 'internal', message: INTERNAL_MESSAGE } });
    expect(JSON.stringify(res.body)).not.toContain('/secret/path.ts');
    expect(leaksIn(res.body)).toEqual([]);
    expect(h.logged).toHaveLength(1);
    expect((h.logged[0].err as Error).message).toBe('boom at /secret/path.ts');
    expect(await pieceRow('TAG-E-3')).toMatchObject({ note: null, version: 1 });
  });

  it('S5 AC1: a missing parcel answers not_found with the prototype sentence', async () => {
    const res = await h.call('readParcel', { parcelId: 'BATCH-2026-099' }, { session: h.session });
    expect(res).toEqual({ status: 404, body: { code: 'not_found', message: 'Parcel BATCH-2026-099 was not found.' } });
  });

  it('S5 AC2: an update carrying version 3 when the piece is at 4 answers conflict', async () => {
    const id = await addPiece(h.pool, h.shop, 'TAG-8841');
    for (const note of ['a', 'b', 'c']) await h.pool.query('update pieces set note = $2 where id = $1', [id, note]);
    expect((await pieceRow('TAG-8841')).version).toBe(4);
    const res = await h.call('updatePieceNote', { pieceId: 'TAG-8841', version: 3, note: 'mine' }, { session: h.session });
    expect(res).toEqual({
      status: 409,
      body: { code: 'conflict', message: 'Someone else changed this piece. Reload and try again.' },
    });
    expect(await pieceRow('TAG-8841')).toMatchObject({ note: 'c', version: 4 });
  });

  it('S3 rule: the permission hook runs after the actor is set; a refusal answers forbidden and nothing runs', async () => {
    await addPiece(h.pool, h.shop, 'TAG-E-4');
    const allowed = await h.call('updatePieceNote', { pieceId: 'TAG-E-4', version: 1, note: 'ok' }, { session: h.session });
    expect(allowed.status).toBe(200);
    expect(permissionCalls).toEqual([
      { operation: 'updatePieceNote', actor: { id: h.userId, name: 'Rajesh Verma', role: 'staff' } },
    ]);
    h.captured.length = 0;
    deny = true;
    const refused = await h.call('updatePieceNote', { pieceId: 'TAG-E-4', version: 2, note: 'no' }, { session: h.session });
    expect(refused).toEqual({ status: 403, body: { code: 'forbidden', message: 'You are not allowed to do this.' } });
    expect(h.captured).toEqual([]);
    expect(await pieceRow('TAG-E-4')).toMatchObject({ note: 'ok', version: 2 });
  });

  it('S5 AC4: every error code answers with a code, a sentence and a field only for validation', async () => {
    await addPiece(h.pool, h.shop, 'TAG-E-5');
    await h.pool.query(`update pieces set note = 'moved' where shop_id = $1 and tag_no = 'TAG-E-5'`, [h.shop.shopId]);
    await addPiece(h.pool, h.shop, 'TAG-E-6');
    await addPiece(h.pool, h.shop, 'TAG-E-7');
    await h.call('stockOutPiece', { pieceId: 'TAG-E-6' }, { session: h.session });
    const s = { session: h.session };
    const trigger: Record<ErrorCode, () => ReturnType<Harness['call']>> = {
      validation: () => h.call('createLead', { items: [] }, s),
      unauthenticated: () => h.call('createLead', { customerName: 'A', items: [] }),
      forbidden: () => {
        deny = true;
        return h.call('stockOutPiece', { pieceId: 'TAG-E-6' }, s).finally(() => {
          deny = false;
        });
      },
      not_found: () => h.call('readParcel', { parcelId: 'BATCH-2026-099' }, s),
      conflict: () => h.call('updatePieceNote', { pieceId: 'TAG-E-5', version: 1, note: 'x' }, s),
      rule_refused: () => h.call('stockOutPiece', { pieceId: 'TAG-E-6' }, s),
      pool_insufficient: () => h.call('refuseWithCode', { code: 'pool_insufficient' }, s),
      opening_exists: () => h.call('refuseWithCode', { code: 'opening_exists' }, s),
      rate_limited: () => {
        limit = true;
        return h.call('stockOutPiece', { pieceId: 'TAG-E-6' }, s).finally(() => {
          limit = false;
        });
      },
      internal: () => h.call('writeThenCrash', { pieceId: 'TAG-E-7' }, s),
    };
    for (const code of ERROR_CODES) {
      const res = await trigger[code]();
      expect(res.body.code, code).toBe(code);
      expect(typeof res.body.message, code).toBe('string');
      expect(String(res.body.message).length, code).toBeGreaterThan(0);
      if (code === 'validation') expect(Object.keys(res.body).sort()).toEqual(['code', 'field', 'message']);
      else expect(Object.keys(res.body).sort(), code).toEqual(['code', 'message']);
      expect(leaksIn(res.body), code).toEqual([]);
    }
  });
});
