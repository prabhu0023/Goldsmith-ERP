/**
 * Two sessions race to stock out the same piece (EP-40-S7 AC1, pipeline guarantee only): of 20
 * overlapping calls exactly one succeeds, no call answers 500, the piece is billed once and its
 * version moves once. The fixture reads the piece without a row lock, so a loser answers either
 * 409 conflict (it read before the winner committed) or 422 "already taken" (it read after);
 * the test asserts the set. The "already taken" sentence for every loser, lead-line routing and
 * two owners clearing a mismatch belong to EP-26, EP-30 and EP-23 (docs/followups.md).
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { addPiece, describeDb } from '../db/db-test-helpers.js';
import { type Harness, newSession, newUser, startHarness } from '../support/api-harness.js';
import { expectExactlyOne, releaseTogether } from '../support/concurrency.js';
const CALLERS = 20;
describeDb('concurrent stock-out of one piece (EP-40-S7)', () => {
  let h: Harness;
  let second: string;
  beforeAll(async () => {
    h = await startHarness({ poolSize: 30 });
    second = await newSession(h.pool, h.shop, await newUser(h.pool, h.shop, { name: 'Deepak Rao', role: 'staff' }));
  });
  afterAll(async () => {
    await h?.close();
  });
  const pieceRow = async (tag: string) =>
    (await h.pool.query('select status, version from pieces where shop_id = $1 and tag_no = $2', [h.shop.shopId, tag])).rows[0];
  it('lets exactly one of 20 parallel calls from two sessions win, with no 500', async () => {
    await addPiece(h.pool, h.shop, 'TAG-C-1');
    const before = await pieceRow('TAG-C-1');
    const calls = Array.from({ length: CALLERS }, (_, i) => () =>
      h.call('stockOutPiece', { pieceId: 'TAG-C-1' }, { session: i % 2 === 0 ? h.session : second }),
    );
    const { winner, losers } = expectExactlyOne(await releaseTogether(calls));
    expect(winner.body).toEqual({ ok: true });
    expect(losers).toHaveLength(CALLERS - 1);
    expect(losers.filter((l) => l.status === 500)).toEqual([]);
    for (const loser of losers) {
      expect([409, 422], JSON.stringify(loser.body)).toContain(loser.status);
      expect(loser.body.code).toBe(loser.status === 409 ? 'conflict' : 'rule_refused');
      if (loser.status === 422) expect(loser.body.message).toBe('TAG-C-1 is already taken.');
    }
    const after = await pieceRow('TAG-C-1');
    expect(after.status).toBe('billed');
    expect(after.version).toBe(before.version + 1);
    expect(h.logged).toEqual([]);
  });
  it('lets exactly one win on each of five pieces raced at the same time', async () => {
    const tags = ['TAG-C-2', 'TAG-C-3', 'TAG-C-4', 'TAG-C-5', 'TAG-C-6'];
    for (const tag of tags) await addPiece(h.pool, h.shop, tag);
    const calls = tags.flatMap((tag) =>
      Array.from({ length: 6 }, (_, i) => () =>
        h.call('stockOutPiece', { pieceId: tag }, { session: i % 2 === 0 ? h.session : second }),
      ),
    );
    const answers = await releaseTogether(calls);
    tags.forEach((tag, t) => {
      const { losers } = expectExactlyOne(answers.slice(t * 6, t * 6 + 6));
      expect(losers.filter((l) => l.status === 500), tag).toEqual([]);
    });
    for (const tag of tags) expect((await pieceRow(tag)).status).toBe('billed');
  });
  it('expectExactlyOne names the statuses when nobody or two callers win', () => {
    const ok = { status: 200, body: {} };
    const no = { status: 409, body: {} };
    expect(() => expectExactlyOne([no, no])).toThrow('expected exactly one success, got 0 (statuses: 409, 409)');
    expect(() => expectExactlyOne([ok, ok, no])).toThrow('got 2');
  });
});
