/**
 * The live operations (EP-07-S4 AC3-5, S8): the browser's side of the channel, as ordinary
 * contract operations through the pipeline (session, permission list, one transaction). The
 * stream must be the caller's own and open on this server. A subscription or presence change
 * takes effect only after the transaction commits.
 */
import {
  type contract,
  ENTITY_READ_PERMISSIONS,
  entityChannel,
  type LiveEntityType,
  parseChannel,
  roleMay,
} from '@goldsmith/shared';
import { callerKarigarId } from '../auth/karigar-scope.js';
import { ApiError, ForbiddenError, NotFoundError, ValidationError } from '../pipeline/api-errors.js';
import type { Tx } from '../pipeline/operation-transaction.js';
import type { Handler, Handlers, OperationCtx } from '../pipeline/registry.js';
import { MAX_CHANNELS } from './hub.js';
import { findLiveConnection, type LiveConnectionHandle } from './live-registry.js';

function ownConnection(connectionId: string, ctx: OperationCtx): LiveConnectionHandle {
  const conn = findLiveConnection(connectionId);
  if (!conn || conn.userId !== ctx.by.id || conn.shopId !== ctx.shop.shopId) {
    throw new ApiError('not_found', 'This live connection is not open. Reconnect and try again.');
  }
  return conn;
}

/** The entity channel after the read check (S4 AC3) and the record's existence in the shop. */
async function checkedEntityChannel(tx: Tx, ctx: OperationCtx, channel: string): Promise<string> {
  const parsed = parseChannel(channel);
  if (!parsed) throw new ValidationError('channel', `There is no live channel named ${channel}.`);
  if (parsed.kind !== 'entity') {
    throw new ForbiddenError('A live connection gets its user and role channels from its session.');
  }
  const type: LiveEntityType = parsed.entity;
  if (!ENTITY_READ_PERMISSIONS[type].some((op) => roleMay(ctx.by.role, op))) throw new ForbiddenError();
  const ownKarigar = ctx.by.role === 'karigar' ? await callerKarigarId(tx, ctx) : null;
  const found =
    type === 'parcel'
      ? await tx.client.query('select 1 from parcels where shop_id = $1 and code = $2', [ctx.shop.shopId, parsed.code])
      : await tx.client.query(
          `select 1 from karigar_jobs where shop_id = $1 and code = $2
              and ($3::boolean is false or karigar_id = $4::uuid)`,
          [ctx.shop.shopId, parsed.code, ctx.by.role === 'karigar', ownKarigar],
        );
  if (found.rowCount === 0) throw new NotFoundError(type === 'parcel' ? 'Parcel' : 'Karigar job', parsed.code);
  return entityChannel(parsed.entity, parsed.code);
}

function assertRoom(conn: LiveConnectionHandle, channel: string): void {
  if (!conn.channels().has(channel) && conn.channels().size >= MAX_CHANNELS) {
    throw new ValidationError('channel', `A live connection can join at most ${MAX_CHANNELS} channels.`);
  }
}

export const subscribeLiveChannel: Handler<typeof contract.subscribeLiveChannel> = async (tx, ctx, input) => {
  const conn = ownConnection(input.connectionId, ctx);
  const channel = await checkedEntityChannel(tx, ctx, input.channel);
  assertRoom(conn, channel);
  tx.afterCommit(() => conn.subscribe(channel));
  return { ok: true };
};

export const unsubscribeLiveChannel: Handler<typeof contract.unsubscribeLiveChannel> = async (tx, ctx, input) => {
  const conn = ownConnection(input.connectionId, ctx);
  const parsed = parseChannel(input.channel);
  if (!parsed) throw new ValidationError('channel', `There is no live channel named ${input.channel}.`);
  if (parsed.kind !== 'entity') {
    throw new ForbiddenError('A live connection keeps the user and role channels of its session.');
  }
  tx.afterCommit(() => conn.unsubscribe(input.channel));
  return { ok: true };
};

export const joinParcelPresence: Handler<typeof contract.joinParcelPresence> = async (tx, ctx, input) => {
  const conn = ownConnection(input.connectionId, ctx);
  const channel = await checkedEntityChannel(tx, ctx, entityChannel('parcel', input.parcelId));
  assertRoom(conn, channel);
  tx.afterCommit(() => conn.joinPresence(input.parcelId));
  return { ok: true, others: conn.presenceOthers(input.parcelId) };
};

export const leaveParcelPresence: Handler<typeof contract.leaveParcelPresence> = async (tx, ctx, input) => {
  const conn = ownConnection(input.connectionId, ctx);
  tx.afterCommit(() => conn.leavePresence(input.parcelId));
  return { ok: true };
};

export const liveHandlers: Handlers<typeof contract> = {
  subscribeLiveChannel,
  unsubscribeLiveChannel,
  joinParcelPresence,
  leaveParcelPresence,
};
