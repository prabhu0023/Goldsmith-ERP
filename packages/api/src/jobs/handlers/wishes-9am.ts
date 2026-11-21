/**
 * The 9 am wishes run (EP-10-S9). Daily at 09:00 Asia/Kolkata with the key 'wishes:<date>', so
 * the day's queue is handed over once. auto_send_wishes is read at run time. The queue goes to
 * EP-33 through the outbox; consent, sender and message text are EP-33's, so nobody is filtered
 * out here.
 */
import { shopDate } from '@goldsmith/shared';
import type { JobDefinition } from '../job-definition.js';
import { emitOutboxEvent } from '../outbox.js';

interface WishRow {
  code: string;
  birthday: boolean;
  anniversary: boolean;
}

export const wishesJob: JobDefinition = {
  name: 'wishes-9am',
  label: 'wishes job',
  schedule: { kind: 'daily', hour: 9, minute: 0 },
  maxAttempts: 3,
  runIdempotencyKey: (date) => `wishes:${date}`,
  async handler(tx, ctx) {
    const settings = await tx.client.query<{ auto_send_wishes: boolean }>(
      'select auto_send_wishes from settings where shop_id = $1',
      [ctx.shop.shopId],
    );
    if (settings.rows[0]?.auto_send_wishes !== true) return;
    // The occurrence's own day, also when it runs late (catch-up) or is retried.
    const date = shopDate(ctx.dueAt.getTime());
    const monthDay = date.slice(5);
    const { rows } = await tx.client.query<WishRow>(
      `select code,
              coalesce(to_char(dob, 'MM-DD') = $2, false) as birthday,
              coalesce(to_char(anniversary, 'MM-DD') = $2, false) as anniversary
         from customers
        where shop_id = $1 and (to_char(dob, 'MM-DD') = $2 or to_char(anniversary, 'MM-DD') = $2)
        order by code`,
      [ctx.shop.shopId, monthDay],
    );
    const items: Array<{ customerId: string; kind: 'birthday' | 'anniversary' }> = [];
    for (const row of rows) {
      if (row.birthday) items.push({ customerId: row.code, kind: 'birthday' });
      if (row.anniversary) items.push({ customerId: row.code, kind: 'anniversary' });
    }
    await emitOutboxEvent(tx.client, ctx.shop, 'wishes.run_requested', { date, items }, ctx.now);
  },
};
