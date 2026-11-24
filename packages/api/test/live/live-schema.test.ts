import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { columnsOf, describeDb, expectPgError, type TestShop, testPool } from '../db/db-test-helpers.js';
import { newLiveShop } from './live-test-helpers.js';

/** The EP-07 migration: live columns on EP-10's outbox and the per-shop stream counter. */
describeDb('EP-07 live channel schema', () => {
  let pool: pg.Pool;
  let shop: TestShop;
  const now = new Date('2026-11-21T10:00:00Z');
  const audience = JSON.stringify({ channels: ['role:owner'] });

  beforeAll(async () => {
    pool = testPool(2);
    shop = await newLiveShop(pool, 'Live schema shop');
  });
  afterAll(async () => {
    await pool.end();
  });

  const addRow = (values: {
    entityType?: string | null;
    entityId?: string | null;
    entityVersion?: number | null;
    audience?: string | null;
    liveSeq?: number | null;
    topic?: string;
  }) =>
    pool.query(
      `insert into outbox_events (shop_id, topic, payload, created_at, entity_type, entity_id, entity_version, audience, live_seq)
       values ($1, $2, '{}', $3, $4, $5, $6, $7, $8)`,
      [
        shop.shopId,
        values.topic ?? 'parcel.stopped',
        now,
        values.entityType === undefined ? 'parcel' : values.entityType,
        values.entityId === undefined ? 'BATCH-2026-044' : values.entityId,
        values.entityVersion === undefined ? 3 : values.entityVersion,
        values.audience === undefined ? audience : values.audience,
        values.liveSeq ?? null,
      ],
    );

  it('adds the live columns to outbox_events and the live_streams table', async () => {
    expect(await columnsOf(pool, 'outbox_events')).toMatchObject({
      insert_order: { type: 'bigint', nullable: false },
      entity_type: { type: 'text', nullable: true },
      entity_id: { type: 'text', nullable: true },
      entity_version: { type: 'integer', nullable: true },
      audience: { type: 'jsonb', nullable: true },
      live_seq: { type: 'bigint', nullable: true },
      published_at: { type: 'timestamp with time zone', nullable: true },
    });
    expect(await columnsOf(pool, 'live_streams')).toMatchObject({
      shop_id: { type: 'uuid', nullable: false },
      last_seq: { type: 'bigint', nullable: false, default: '0' },
      pruned_through: { type: 'bigint', nullable: false, default: '0' },
    });
  });

  it('keeps EP-10 rows valid: a notification row has no live columns', async () => {
    await addRow({ topic: 'notify.karigar_job_overdue_reminder', entityType: null, entityId: null, entityVersion: null, audience: null });
  });

  it('numbers rows in insert order', async () => {
    await addRow({ entityId: 'BATCH-ORDER-1' });
    await addRow({ entityId: 'BATCH-ORDER-2' });
    const { rows } = await pool.query<{ entity_id: string; insert_order: string }>(
      `select entity_id, insert_order from outbox_events where shop_id = $1 and entity_id like 'BATCH-ORDER-%' order by entity_id`,
      [shop.shopId],
    );
    expect(BigInt(rows[1].insert_order)).toBeGreaterThan(BigInt(rows[0].insert_order));
  });

  it('refuses partial live columns, and a sequence number on a row that is not live', async () => {
    await expectPgError(addRow({ entityId: null }), '23514');
    await expectPgError(addRow({ entityVersion: null }), '23514');
    await expectPgError(addRow({ audience: null }), '23514');
    await expectPgError(
      addRow({ entityType: null, entityId: null, entityVersion: null, audience: null, liveSeq: 5 }),
      '23514',
    );
    await expectPgError(addRow({ entityVersion: 0 }), '23514');
    await expectPgError(addRow({ liveSeq: 0 }), '23514');
  });

  it('gives a sequence number once per shop stream', async () => {
    await addRow({ liveSeq: 900_001 });
    await expectPgError(addRow({ liveSeq: 900_001 }), '23505');
  });

  it('refuses a negative stream counter and a stream for no shop', async () => {
    await expectPgError(pool.query('insert into live_streams (shop_id, last_seq) values ($1, -1)', [shop.shopId]), '23514');
    await expectPgError(
      pool.query(`insert into live_streams (shop_id) values ('00000000-0000-4000-8000-000000000000')`),
      '23503',
    );
  });
});
