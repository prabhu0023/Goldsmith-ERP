/**
 * Record a live event (EP-07-S1, S2, S11). The only way a service function or job causes a live
 * event: one outbox_events row with the entity columns and the catalogue's audience, written in
 * the operation's transaction, so it exists only if the change commits. Nothing is sent from
 * here: after the commit the publisher stamps the row with its sequence number and the hub
 * delivers it. The emitter names the topic and its audience facts; the catalogue fixes the name,
 * entity type and channels. A topic outside the catalogue is refused.
 */
import {
  type LiveAudienceParams,
  type LiveTopic,
  liveAudienceFor,
  liveEntryFor,
  liveEnvelopeDraftSchema,
} from '@goldsmith/shared';
import type { ShopContext } from '../db/shop-context.js';
import type { Tx } from '../pipeline/operation-transaction.js';
import { notifyLiveCommit } from './live-wakeup.js';

export type LiveEmit<T extends LiveTopic> = {
  /** The record's human code (TAG-8841), or the user id for account events. */
  entityId: string;
  /** The row's version after this change. */
  entityVersion: number;
  /** The operation's server time. */
  at: Date;
  /** Internal outbox payload for other consumers (EP-11); never sent to a client. */
  payload?: Record<string, unknown>;
} & LiveAudienceParams<T>;

export async function emitLiveEvent<T extends LiveTopic>(
  tx: Tx,
  shop: ShopContext,
  topic: T,
  event: LiveEmit<T>,
): Promise<void> {
  const entry = liveEntryFor(topic);
  if (!entry) throw new Error(`Unknown live event "${String(topic)}": add it to the live-event catalogue first`);
  const { entityId, entityVersion, at, payload = {}, ...params } = event;
  const audience = liveAudienceFor(topic, params);
  // The same shape the publisher will send, less the sequence number it assigns.
  const draft = liveEnvelopeDraftSchema.parse({
    name: entry.name,
    entityType: entry.entityType,
    entityId,
    entityVersion,
    emittedAt: at.toISOString(),
    audience,
  });
  await tx.client.query(
    `insert into outbox_events (shop_id, topic, payload, created_at, entity_type, entity_id, entity_version, audience)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      shop.shopId,
      topic,
      JSON.stringify(payload),
      at,
      draft.entityType,
      draft.entityId,
      draft.entityVersion,
      JSON.stringify(draft.audience),
    ],
  );
  tx.afterCommit(notifyLiveCommit);
}
