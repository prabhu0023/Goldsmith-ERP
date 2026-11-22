/**
 * Helpers for the EP-07 live channel tests: a shop of the test's own (test files share one
 * database), a transaction to emit events in, a publisher scoped to that shop, and the rows it
 * stamped.
 */
import type pg from 'pg';
import { type LivePublisher, type LivePublisherOptions, type LiveRow, createLivePublisher } from '../../src/live/publisher.js';
import { runInTransaction, type Tx } from '../../src/pipeline/operation-transaction.js';
import type { Clock } from '../../src/pipeline/server-clock.js';
import { addPiece, newShop, type TestShop } from '../db/db-test-helpers.js';
import { SERVER_NOW } from '../support/api-harness.js';

type Queryable = pg.Pool | pg.PoolClient;

/** A fresh shop for one live test. */
export const newLiveShop = (pool: Queryable, name = 'Live test shop'): Promise<TestShop> => newShop(pool, name);

/** Run `fn` in one operation transaction, as the pipeline does; after-commit hooks run after it. */
export function inTransaction<T>(pool: pg.Pool, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return runInTransaction(pool, fn, () => {});
}

/** A recording onRows sink: every row a publisher stamped, in the order it reported them. */
export function rowSink(): { rows: LiveRow[]; onRows: (rows: LiveRow[]) => void } {
  const rows: LiveRow[] = [];
  return { rows, onRows: (stamped) => rows.push(...stamped) };
}

/** A publisher that sees only `shop`'s rows, with the server clock at SERVER_NOW unless given. */
export function shopPublisher(
  pool: pg.Pool,
  shop: TestShop,
  opts: Partial<Omit<LivePublisherOptions, 'pool' | 'shopIds'>> & { clock?: Clock } = {},
): LivePublisher {
  return createLivePublisher({
    pool,
    clock: opts.clock ?? { now: () => new Date(SERVER_NOW.getTime()) },
    log: () => {},
    ...opts,
    shopIds: [shop.shopId],
  });
}

/** Stamp until nothing is left; returns every row stamped. */
export async function stampAll(publisher: LivePublisher): Promise<LiveRow[]> {
  const all: LiveRow[] = [];
  for (;;) {
    const rows = await publisher.stamp();
    if (rows.length === 0) return all;
    all.push(...rows);
  }
}

/** The shop's live outbox rows (stamped or not), in commit order. */
export async function liveOutboxRows(
  client: Queryable,
  shop: TestShop,
): Promise<Array<{ topic: string; entity_id: string; live_seq: string | null }>> {
  const { rows } = await client.query<{ topic: string; entity_id: string; live_seq: string | null }>(
    `select topic, entity_id, live_seq from outbox_events
      where shop_id = $1 and entity_type is not null order by insert_order`,
    [shop.shopId],
  );
  return rows;
}

/** Insert a lead in the shop; returns its id. */
export async function addLiveLead(client: Queryable, shop: TestShop, code: string, state = 'needs_glance'): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `insert into leads (shop_id, code, source, state, arrived_at) values ($1, $2, 'whatsapp', $3, $4) returning id`,
    [shop.shopId, code, state, SERVER_NOW],
  );
  return rows[0].id;
}

/** Insert a piece in stock and raise it to `version` (every update bumps it by one). */
export async function addPieceAtVersion(client: Queryable, shop: TestShop, tagNo: string, version: number): Promise<string> {
  const id = await addPiece(client, shop, tagNo);
  for (let v = 1; v < version; v += 1) {
    await client.query('update pieces set name = name where shop_id = $1 and id = $2', [shop.shopId, id]);
  }
  return id;
}
