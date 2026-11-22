/**
 * The test-event stub (EP-07-S12 rule): `POST /api/dev/live/emit { event, entityId }` records a
 * catalogue event for an existing record through the outbox, exactly as a service function
 * would, for the two-browser test and the demo. Mounted only outside production. It is not a
 * contract operation and bypasses nothing: it needs a real session, the caller must be allowed
 * to read the entity (the same ENTITY_READ_PERMISSIONS check as delivery), and the event is
 * published after the commit like any other.
 */
import { ENTITY_READ_PERMISSIONS, METAL_POOL_ENTITY_ID, roleMay } from '@goldsmith/shared';
import express, { type Router } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { loadShopContext, type ShopContext } from '../db/shop-context.js';
import { ApiError, type ErrorLog, ForbiddenError, UnauthenticatedError, ValidationError } from '../pipeline/api-errors.js';
import { runInTransaction, type Tx } from '../pipeline/operation-transaction.js';
import type { Clock } from '../pipeline/server-clock.js';
import type { SessionResolver } from '../pipeline/session-resolver.js';
import { karigarUserIdOf } from './audience-lookup.js';
import { emitLiveEvent } from './emit-live-event.js';

export const DEV_EMIT_PATH = '/api/dev/live/emit';

/** The catalogue events a test may trigger; edit.applied and user.access_changed come only from real operations. */
const DEV_EVENTS = [
  'piece.billed',
  'parcel.stopped',
  'edit.proposed',
  'lead.alert',
  'karigar_job.status_changed',
  'parcel.handed_over',
  'tag.saved',
  'metal_pool.changed',
] as const;
type DevEvent = (typeof DEV_EVENTS)[number];

const ENTITY_OF = {
  'piece.billed': 'piece',
  'parcel.stopped': 'parcel',
  'edit.proposed': 'piece_edit',
  'lead.alert': 'lead',
  'karigar_job.status_changed': 'karigar_job',
  'parcel.handed_over': 'parcel',
  'tag.saved': 'piece',
  'metal_pool.changed': 'metal_pool',
} as const satisfies Record<DevEvent, keyof typeof ENTITY_READ_PERMISSIONS>;

const bodySchema = z.object({
  event: z.enum(DEV_EVENTS),
  entityId: z.string().trim().min(1).max(100),
});

export interface DevEmitDeps {
  pool?: pg.Pool;
  sessions: SessionResolver;
  clock: Clock;
  log: ErrorLog;
  maxBodyBytes: number;
}

const missing = (what: string, id: string) => new ApiError('not_found', `${what} ${id} was not found.`);

async function versionOf(tx: Tx, sql: string, params: unknown[], what: string, id: string) {
  const { rows } = await tx.client.query<{ version: number; extra: string | null }>(sql, params);
  if (!rows[0]) throw missing(what, id);
  return rows[0];
}

async function emitDev(tx: Tx, shop: ShopContext, actorUserId: string, event: DevEvent, id: string, at: Date) {
  const s = shop.shopId;
  switch (event) {
    case 'piece.billed': {
      const p = await versionOf(tx, 'select version from pieces where shop_id = $1 and tag_no = $2', [s, id], 'Piece', id);
      return emitLiveEvent(tx, shop, event, { entityId: id, entityVersion: p.version, at, actorUserId });
    }
    case 'tag.saved': {
      const p = await versionOf(
        tx,
        `select p.version, pa.code as extra from pieces p left join parcels pa on pa.shop_id = p.shop_id and pa.id = p.parcel_id
          where p.shop_id = $1 and p.tag_no = $2`,
        [s, id],
        'Piece',
        id,
      );
      if (p.extra === null) throw new ApiError('not_found', `Piece ${id} is not on a parcel.`);
      return emitLiveEvent(tx, shop, event, { entityId: id, entityVersion: p.version, at, actorUserId, parcelId: p.extra });
    }
    case 'parcel.stopped':
    case 'parcel.handed_over': {
      const p = await versionOf(tx, 'select version from parcels where shop_id = $1 and code = $2', [s, id], 'Parcel', id);
      return emitLiveEvent(tx, shop, event, { entityId: id, entityVersion: p.version, at });
    }
    case 'edit.proposed': {
      const e = await versionOf(tx, 'select version from piece_edits where shop_id = $1 and code = $2', [s, id], 'Edit', id);
      return emitLiveEvent(tx, shop, event, { entityId: id, entityVersion: e.version, at });
    }
    case 'lead.alert': {
      const l = await versionOf(tx, 'select version from leads where shop_id = $1 and code = $2', [s, id], 'Lead', id);
      return emitLiveEvent(tx, shop, event, { entityId: id, entityVersion: l.version, at });
    }
    case 'karigar_job.status_changed': {
      const j = await versionOf(
        tx,
        'select version, karigar_id as extra from karigar_jobs where shop_id = $1 and code = $2',
        [s, id],
        'Karigar job',
        id,
      );
      const karigarUserId = await karigarUserIdOf(tx.client, shop, j.extra as string);
      return emitLiveEvent(tx, shop, event, { entityId: id, entityVersion: j.version, at, karigarUserId });
    }
    case 'metal_pool.changed': {
      if (id !== METAL_POOL_ENTITY_ID) throw missing('Metal pool', id);
      const m = await versionOf(tx, 'select version from metal_pools where shop_id = $1', [s], 'Metal pool', id);
      return emitLiveEvent(tx, shop, event, { entityId: METAL_POOL_ENTITY_ID, entityVersion: m.version, at });
    }
  }
}

export function createDevEmitRouter({ pool, sessions, clock, log, maxBodyBytes }: DevEmitDeps): Router {
  const router = express.Router();
  router.post(DEV_EMIT_PATH, express.json({ limit: maxBodyBytes }), async (req, res, next) => {
    try {
      const session = await sessions.resolve(req);
      if (!session) throw new UnauthenticatedError();
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        const field = String(parsed.error.issues[0]?.path[0] ?? 'body');
        throw new ValidationError(field, 'Send { event, entityId } with a known test event.');
      }
      const { event, entityId } = parsed.data;
      const reads: readonly string[] = ENTITY_READ_PERMISSIONS[ENTITY_OF[event]];
      // A karigar's job reads are their own jobs only; the stub is for shop-floor test events.
      if (session.role === 'karigar' || !reads.some((op) => roleMay(session.role, op))) throw new ForbiddenError();
      if (!pool) throw new Error('No database is configured (DATABASE_URL is not set)');
      await runInTransaction(
        pool,
        async (tx) => {
          const shop = await loadShopContext(tx.client, session.shopId);
          await emitDev(tx, shop, session.userId, event, entityId, clock.now());
        },
        log,
      );
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });
  return router;
}
