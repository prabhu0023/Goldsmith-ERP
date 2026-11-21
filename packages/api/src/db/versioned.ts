/**
 * Versioned updates (EP-02-S14). A write names the version it read; if the row has moved on
 * (someone else saved first), nothing is written and StaleWriteError is thrown. The bump_version
 * trigger raises the version, so callers never set it.
 */
import type pg from 'pg';
import { assertIdentifier, type ShopContext } from './shop-context.js';

/** The seven versioned tables and the entity name used in conflict messages. */
export const VERSIONED_ENTITIES = {
  pieces: 'Piece',
  parcels: 'Parcel',
  leads: 'Lead',
  lead_items: 'LeadItem',
  karigar_jobs: 'KarigarJob',
  piece_edits: 'PieceEdit',
  metal_pools: 'MetalPool',
} as const;

export type VersionedTable = keyof typeof VERSIONED_ENTITIES;

export class StaleWriteError extends Error {
  override readonly name = 'StaleWriteError';
  readonly code = 'STALE_WRITE';
  constructor(
    public readonly entity: string,
    public readonly id: string,
    public readonly expectedVersion: number,
  ) {
    super(`${entity} ${id} was changed by someone else (expected version ${expectedVersion}); reload and try again.`);
  }
}

const NOT_SETTABLE = new Set(['id', 'shop_id', 'location_id', 'version']);

type Queryable = pg.Pool | pg.PoolClient;

export interface VersionedUpdate {
  table: VersionedTable;
  id: string;
  expectedVersion: number;
  set: Record<string, unknown>;
}

/** Update one row of the context's shop if it is still at `expectedVersion`; returns the new row. */
export async function updateVersioned<T extends pg.QueryResultRow = Record<string, unknown>>(
  client: Queryable,
  ctx: ShopContext,
  { table, id, expectedVersion, set }: VersionedUpdate,
): Promise<T> {
  const entity = VERSIONED_ENTITIES[table];
  if (!entity) throw new Error(`${String(table)} is not a versioned table`);
  const columns = Object.keys(set);
  if (columns.length === 0) throw new Error('updateVersioned needs at least one column to set');
  for (const column of columns) {
    assertIdentifier(column);
    if (NOT_SETTABLE.has(column)) throw new Error(`${column} cannot be set by updateVersioned`);
  }
  const assignments = columns.map((c, i) => `${c} = $${i + 4}`);
  const res = await client.query<T>(
    `update ${table} set ${assignments.join(', ')} where id = $1 and shop_id = $2 and version = $3 returning *`,
    [id, ctx.shopId, expectedVersion, ...columns.map((c) => set[c])],
  );
  if (res.rows.length === 0) throw new StaleWriteError(entity, id, expectedVersion);
  return res.rows[0];
}
