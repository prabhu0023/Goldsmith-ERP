/**
 * The registry's audit wrapper (EP-06-S2 AC4): a state-changing operation that returns without an
 * audit entry of a declared kind is rolled back and answers `internal`, and the server log names
 * the operation. Runs the fixture operations with a test audit-kind map.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { auditChange } from '../../src/audit/audit-writer.js';
import { auditNoChange } from '../../src/audit/audited-operation.js';
import { updateVersioned } from '../../src/db/versioned.js';
import { INTERNAL_MESSAGE } from '../../src/pipeline/api-errors.js';
import type { Tx } from '../../src/pipeline/operation-transaction.js';
import type { OperationCtx } from '../../src/pipeline/registry.js';
import { addPiece, describeDb } from '../db/db-test-helpers.js';
import { type Harness, startHarness } from '../support/api-harness.js';
import { createFixtureHandlers } from '../support/fixture-operations.js';

const INTERNAL = { status: 500, body: { code: 'internal', message: INTERNAL_MESSAGE } };

describeDb('audited operations (EP-06-S2 AC4)', () => {
  let h: Harness;
  const fixtures = createFixtureHandlers();

  const piece = async (tag: string) =>
    (
      await h.pool.query<{ note: string | null; gross_units: string; status: string; version: number }>(
        'select note, gross_units, status, version from pieces where shop_id = $1 and tag_no = $2',
        [h.shop.shopId, tag],
      )
    ).rows[0];
  const entries = async (where: string, params: unknown[] = []) =>
    (
      await h.pool.query<{ kind: string; entity_id: string }>(
        `select kind, entity_id from audit_entries where shop_id = $1 and ${where}`,
        [h.shop.shopId, ...params],
      )
    ).rows;
  const loggedMessages = () => h.logged.map((l) => (l.err instanceof Error ? l.err.message : String(l.err)));

  beforeAll(async () => {
    h = await startHarness({
      auditKinds: {
        updatePieceNote: ['edit_applied'],
        stockOutPiece: ['stock_out'],
        setPieceGross: ['edit_applied'],
        createLead: ['lead_created'],
      },
      handlers: {
        // Finds nothing to change and says so.
        stockOutPiece: async (tx: Tx) => {
          auditNoChange(tx.client);
          return { ok: true };
        },
        // Writes, then audits a kind it does not declare.
        setPieceGross: async (tx: Tx, ctx: OperationCtx, input: { pieceId: string; grossG: number; version: number }) => {
          const { rows } = await tx.client.query<{ id: string }>('select id from pieces where shop_id = $1 and tag_no = $2', [
            ctx.shop.shopId,
            input.pieceId,
          ]);
          await updateVersioned(tx.client, ctx.shop, {
            table: 'pieces',
            id: rows[0].id,
            expectedVersion: input.version,
            set: { gross_units: input.grossG },
          });
          await auditChange(tx, ctx, {
            kind: 'stock_out',
            entityType: 'stock_out',
            entityId: input.pieceId,
            summary: `${input.pieceId} stocked out`,
            before: null,
            after: { grossG: input.grossG },
          });
          return { ok: true };
        },
        // The fixture create, audited.
        createLead: async (tx: Tx, ctx: OperationCtx, input: never) => {
          const created = (await fixtures.createLead?.(tx, ctx, input)) as { ok: true; id: string };
          await auditChange(tx, ctx, {
            kind: 'lead_created',
            entityId: created.id,
            ref: created.id,
            summary: `Lead ${created.id} created`,
            before: null,
            after: { state: 'opened' },
          });
          return created;
        },
      },
    });
  });

  afterAll(async () => {
    await h?.close();
  });

  it('a write without an entry answers 500 internal, leaves the row unchanged and logs the operation', async () => {
    await addPiece(h.pool, h.shop, 'TAG-AO-1');
    const before = await piece('TAG-AO-1');
    const res = await h.call('updatePieceNote', { pieceId: 'TAG-AO-1', version: 1, note: 'Polished' }, { session: h.session });
    expect(res).toEqual(INTERNAL);
    expect(await piece('TAG-AO-1')).toEqual(before);
    expect(loggedMessages()).toContain('Operation updatePieceNote changed state without an audit entry');
  });

  it('an entry of an undeclared kind is refused the same way and names the kind', async () => {
    await addPiece(h.pool, h.shop, 'TAG-AO-2');
    const before = await piece('TAG-AO-2');
    const res = await h.call('setPieceGross', { pieceId: 'TAG-AO-2', version: 1, grossG: '48.6100' }, { session: h.session });
    expect(res).toEqual(INTERNAL);
    expect(await piece('TAG-AO-2')).toEqual(before);
    expect(await entries('entity_id = $2', ['TAG-AO-2'])).toEqual([]);
    expect(loggedMessages()).toContain('Operation setPieceGross wrote audit kind stock_out, which it does not declare');
  });

  it('an operation that calls auditNoChange may return without an entry', async () => {
    await addPiece(h.pool, h.shop, 'TAG-AO-3');
    const res = await h.call('stockOutPiece', { pieceId: 'TAG-AO-3' }, { session: h.session });
    expect(res).toEqual({ status: 200, body: { ok: true } });
  });

  it('an idempotent replay of an audited create answers the stored id and is not re-checked', async () => {
    const body = { customerName: 'Priya Sharma', items: [{ name: 'Ring', qty: 1 }] };
    const first = await h.call('createLead', body, { session: h.session, idempotencyKey: 'audited-create-1' });
    expect(first.status).toBe(200);
    const replay = await h.call('createLead', body, { session: h.session, idempotencyKey: 'audited-create-1' });
    expect(replay).toEqual(first);
    const id = String(first.body.id);
    expect(await entries('kind = $2 and entity_id = $3', ['lead_created', id])).toEqual([
      { kind: 'lead_created', entity_id: id },
    ]);
  });
});
