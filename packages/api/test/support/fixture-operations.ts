/**
 * Test-only operations named by the EP-03 acceptance criteria (createLead, recordParcelArrival,
 * readParcel, ...). They are declared with the shared defineOperation in a contract that extends
 * the shared one, and registered only in test apps; production registers its own handlers.
 * Record ids in inputs and results are human codes (TAG-8841, BATCH-2026-045), never uuids.
 */
import {
  contract,
  createdResult,
  DomainError,
  defineOperation,
  ERROR_CODES,
  okResult,
  pageInput,
  pageResult,
  weightG,
} from '@goldsmith/shared';
import { z } from 'zod';
import { nextCode } from '../../src/db/codes.js';
import { insertScoped } from '../../src/db/shop-context.js';
import { updateVersioned } from '../../src/db/versioned.js';
import { ApiError, NotFoundError } from '../../src/pipeline/api-errors.js';
import type { Tx } from '../../src/pipeline/operation-transaction.js';
import { clampPageSize, pageQuery } from '../../src/pipeline/paging.js';
import type { Handlers, OperationCtx } from '../../src/pipeline/registry.js';

const pieceRef = { pieceId: z.string().trim().min(1) };

export const testContract = {
  ...contract,
  createLead: defineOperation({
    name: 'createLead',
    kind: 'create',
    input: z.object({
      customerName: z.string().trim().min(1),
      phone: z.string().optional(),
      items: z.array(
        z.object({
          name: z.string().trim().min(1),
          qty: z.number().int().min(1),
          approxWeightG: weightG.nullable().optional(),
        }),
      ),
      note: z.string().optional(),
    }),
    result: createdResult,
    errors: ERROR_CODES,
  }),
  recordParcelArrival: defineOperation({
    name: 'recordParcelArrival',
    kind: 'create',
    input: z.object({ karigarCode: z.string().trim().min(1), poRef: z.string().optional() }),
    result: createdResult,
    errors: ERROR_CODES,
  }),
  readParcel: defineOperation({
    name: 'readParcel',
    kind: 'read',
    input: z.object({ parcelId: z.string().trim().min(1) }),
    result: z.object({
      ok: z.literal(true),
      parcel: z.object({ id: z.string(), poRef: z.string().nullable(), arrivedAt: z.string().nullable() }),
    }),
    errors: ERROR_CODES,
  }),
  setPieceGross: defineOperation({
    name: 'setPieceGross',
    kind: 'command',
    input: z.object({ ...pieceRef, grossG: weightG, version: z.number().int().min(1) }),
    result: okResult,
    errors: ERROR_CODES,
  }),
  updatePieceNote: defineOperation({
    name: 'updatePieceNote',
    kind: 'command',
    input: z.object({ ...pieceRef, version: z.number().int().min(1), note: z.string() }),
    result: okResult,
    errors: ERROR_CODES,
  }),
  stockOutPiece: defineOperation({
    name: 'stockOutPiece',
    kind: 'command',
    input: z.object(pieceRef),
    result: okResult,
    errors: ERROR_CODES,
  }),
  writeThenRefuse: defineOperation({
    name: 'writeThenRefuse',
    kind: 'command',
    input: z.object(pieceRef),
    result: okResult,
    errors: ERROR_CODES,
  }),
  refuseWithCode: defineOperation({
    name: 'refuseWithCode',
    kind: 'command',
    input: z.object({ code: z.enum(['pool_insufficient', 'opening_exists']) }),
    result: okResult,
    errors: ERROR_CODES,
  }),
  writeThenCrash: defineOperation({
    name: 'writeThenCrash',
    kind: 'command',
    input: z.object(pieceRef),
    result: okResult,
    errors: ERROR_CODES,
  }),
  dropConnection: defineOperation({
    name: 'dropConnection',
    kind: 'command',
    input: z.object(pieceRef),
    result: okResult,
    errors: ERROR_CODES,
  }),
  parcelWithPoolEntry: defineOperation({
    name: 'parcelWithPoolEntry',
    kind: 'command',
    input: z.object({ parcelId: z.string().trim().min(1) }),
    result: okResult,
    errors: ERROR_CODES,
  }),
  listAuditEntries: defineOperation({
    name: 'listAuditEntries',
    kind: 'list',
    input: z.object(pageInput),
    result: pageResult(z.object({ at: z.string(), summary: z.string().nullable() })),
    errors: ERROR_CODES,
  }),
} as const;

export type TestContract = typeof testContract;

export const REFUSAL_SENTENCE = 'This piece cannot be changed right now.';

export interface FixtureOptions {
  /** Awaited by parcelWithPoolEntry between its two writes. */
  gate?: () => Promise<void>;
  /** Called from the after-commit hook that parcelWithPoolEntry and writeThenRefuse register. */
  onCommit?: (operation: string) => void;
}

async function pieceByTag(tx: Tx, ctx: OperationCtx, tag: string) {
  const { rows } = await tx.client.query<{ id: string; status: string; version: number }>(
    'select id, status, version from pieces where shop_id = $1 and tag_no = $2',
    [ctx.shop.shopId, tag],
  );
  if (!rows[0]) throw new NotFoundError('Piece', tag);
  return rows[0];
}

async function parcelByCode(tx: Tx, ctx: OperationCtx, code: string) {
  const { rows } = await tx.client.query<{ id: string; po_ref: string | null; arrived_at: Date | null; version: number }>(
    'select id, po_ref, arrived_at, version from parcels where shop_id = $1 and code = $2',
    [ctx.shop.shopId, code],
  );
  if (!rows[0]) throw new NotFoundError('Parcel', code);
  return rows[0];
}

/** Write a note on the piece (the first write of the failing fixtures). */
async function touchNote(tx: Tx, ctx: OperationCtx, tag: string, note: string): Promise<void> {
  const piece = await pieceByTag(tx, ctx, tag);
  await updateVersioned(tx.client, ctx.shop, { table: 'pieces', id: piece.id, expectedVersion: piece.version, set: { note } });
}

export function createFixtureHandlers(options: FixtureOptions = {}): Handlers<TestContract> {
  const onCommit = options.onCommit ?? (() => {});
  return {
    async createLead(tx, ctx, input) {
      if (input.items.length === 0) throw new DomainError('Add at least one item.');
      const code = await nextCode(tx.client, ctx.shop, { table: 'leads', prefix: `LD-${ctx.at.getUTCFullYear()}` });
      const lead = await insertScoped<{ id: string }>(tx.client, ctx.shop, 'leads', {
        code,
        source: 'counter',
        state: 'opened',
        customer_name: input.customerName,
        phone: input.phone ?? null,
        note: input.note ?? null,
        taken_by_name: ctx.by.name,
        arrived_at: ctx.at,
      });
      for (const [position, item] of input.items.entries()) {
        await insertScoped(tx.client, ctx.shop, 'lead_items', {
          lead_id: lead.id,
          position,
          name: item.name,
          qty: item.qty,
          approx_weight_units: item.approxWeightG ?? null,
        });
      }
      return { ok: true, id: code };
    },

    async recordParcelArrival(tx, ctx, input) {
      const karigar = await tx.client.query<{ id: string }>('select id from karigars where shop_id = $1 and code = $2', [
        ctx.shop.shopId,
        input.karigarCode,
      ]);
      if (!karigar.rows[0]) throw new NotFoundError('Karigar', input.karigarCode);
      const code = await nextCode(tx.client, ctx.shop, { table: 'parcels', prefix: `BATCH-${ctx.at.getUTCFullYear()}` });
      await insertScoped(tx.client, ctx.shop, 'parcels', {
        code,
        karigar_id: karigar.rows[0].id,
        po_ref: input.poRef ?? null,
        arrived_at: ctx.at,
      });
      return { ok: true, id: code };
    },

    async readParcel(tx, ctx, input) {
      const parcel = await parcelByCode(tx, ctx, input.parcelId);
      return {
        ok: true,
        parcel: { id: input.parcelId, poRef: parcel.po_ref, arrivedAt: parcel.arrived_at?.toISOString() ?? null },
      };
    },

    async setPieceGross(tx, ctx, input) {
      const piece = await pieceByTag(tx, ctx, input.pieceId);
      await updateVersioned(tx.client, ctx.shop, {
        table: 'pieces',
        id: piece.id,
        expectedVersion: input.version,
        set: { gross_units: input.grossG },
      });
      return { ok: true };
    },

    async updatePieceNote(tx, ctx, input) {
      const piece = await pieceByTag(tx, ctx, input.pieceId);
      await updateVersioned(tx.client, ctx.shop, {
        table: 'pieces',
        id: piece.id,
        expectedVersion: input.version,
        set: { note: input.note },
      });
      return { ok: true };
    },

    async stockOutPiece(tx, ctx, input) {
      const piece = await pieceByTag(tx, ctx, input.pieceId);
      if (piece.status !== 'in_stock') throw new DomainError(`${input.pieceId} is already taken.`);
      await updateVersioned(tx.client, ctx.shop, {
        table: 'pieces',
        id: piece.id,
        expectedVersion: piece.version,
        set: { status: 'billed', prev_status: piece.status },
      });
      return { ok: true };
    },

    async writeThenRefuse(tx, ctx, input) {
      await touchNote(tx, ctx, input.pieceId, 'written before the refusal');
      tx.afterCommit(() => onCommit('writeThenRefuse'));
      throw new DomainError(REFUSAL_SENTENCE);
    },

    async refuseWithCode(_tx, _ctx, input) {
      throw new ApiError(input.code, `Refused with ${input.code}.`);
    },

    async writeThenCrash(tx, ctx, input) {
      await touchNote(tx, ctx, input.pieceId, 'written before the crash');
      throw new Error('boom at /secret/path.ts');
    },

    async dropConnection(tx, ctx, input) {
      await touchNote(tx, ctx, input.pieceId, 'written before the connection dropped');
      await tx.client.query('select pg_terminate_backend(pg_backend_pid())');
      return { ok: true };
    },

    async parcelWithPoolEntry(tx, ctx, input) {
      const parcel = await parcelByCode(tx, ctx, input.parcelId);
      await updateVersioned(tx.client, ctx.shop, {
        table: 'parcels',
        id: parcel.id,
        expectedVersion: parcel.version,
        set: { po_ref: 'PO-WITH-POOL' },
      });
      await options.gate?.();
      const pool = await tx.client.query<{ id: string }>('select id from metal_pools where shop_id = $1', [ctx.shop.shopId]);
      await insertScoped(tx.client, ctx.shop, 'pool_entries', {
        metal_pool_id: pool.rows[0].id,
        code: `PE-${input.parcelId}`,
        at: ctx.at,
        kind: 'recovered',
        delta_units: 1000,
        ref_type: 'piece',
        ref_id: input.parcelId,
      });
      tx.afterCommit(() => onCommit('parcelWithPoolEntry'));
      return { ok: true };
    },
    async listAuditEntries(tx, ctx, input) {
      const pageSize = clampPageSize(input.pageSize);
      const page = await pageQuery<{ at: Date; summary: string | null }>(tx.client, {
        table: 'audit_entries',
        shopId: ctx.shop.shopId,
        columns: ['at', 'summary'],
        sortColumn: 'at',
        cursor: input.cursor,
        pageSize,
      });
      return {
        ok: true,
        items: page.rows.map((row) => ({ at: row.at.toISOString(), summary: row.summary })),
        nextCursor: page.nextCursor,
        pageSize,
      };
    },
  };
}
