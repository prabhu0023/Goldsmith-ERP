/**
 * Events and hand-overs a job emits (EP-10-S5, S7, S9). Rows go to outbox_events in the job's
 * transaction, so they exist only if its change commits. Live events (EP-07) and notifications
 * (EP-11, EP-33) read them later; nothing is sent from here. Payloads hold human codes only:
 * no phone, name or token.
 */
import type pg from 'pg';
import type { ShopContext } from '../db/shop-context.js';

export type OutboxTopic =
  | 'lead.sla_passed'
  | 'karigar_job.overdue'
  | 'notify.karigar_job_overdue_reminder'
  | 'wishes.run_requested'
  | 'user.access_changed';

export async function emitOutboxEvent(
  client: pg.PoolClient,
  shop: ShopContext,
  topic: OutboxTopic,
  payload: Record<string, unknown>,
  at: Date,
): Promise<void> {
  await client.query(`insert into outbox_events (shop_id, topic, payload, created_at) values ($1, $2, $3, $4)`, [
    shop.shopId,
    topic,
    JSON.stringify(payload),
    at,
  ]);
}
