/**
 * Karigar jobs past their agreed date (EP-10-S7). Daily at 00:05 Asia/Kolkata (the hour is an
 * open item: the sources do not name one). Each job not handed over that is past its agreed date
 * (confirmed date, else due date) gets one reminder per shop day, guarded by the key
 * '<job code>:overdue:<date>' (S4 AC3). The first day also records when it became overdue and
 * publishes "Job passed its agreed date".
 */
import { addShopDays, type JobStatus, jobOverdueDays, shopDate, shopDateTime } from '@goldsmith/shared';
import { writeJobAudit } from '../job-audit.js';
import { karigarUserIdOf } from '../../live/audience-lookup.js';
import { emitLiveEvent } from '../../live/emit-live-event.js';
import type { JobDefinition } from '../job-definition.js';
import { emitOutboxEvent } from '../outbox.js';

const LABEL = 'overdue job';

interface OverdueCandidate {
  id: string;
  code: string;
  status: JobStatus;
  due_date: Date | null;
  confirmed_date: Date | null;
  overdue_since: Date | null;
  last_reminder_at: Date | null;
  karigar_code: string;
  karigar_id: string;
}

const iso = (d: Date | null): string | null => (d === null ? null : d.toISOString());

export const karigarOverdueJob: JobDefinition = {
  name: 'karigar-overdue',
  label: LABEL,
  schedule: { kind: 'daily', hour: 0, minute: 5 },
  maxAttempts: 3,
  async handler(tx, ctx) {
    const now = ctx.now.getTime();
    const today = shopDate(now);
    const { rows } = await tx.client.query<OverdueCandidate>(
      `select j.id, j.code, j.status, j.due_date, j.confirmed_date, j.overdue_since, j.last_reminder_at,
              k.code as karigar_code, j.karigar_id
         from karigar_jobs j
         join karigars k on k.shop_id = j.shop_id and k.id = j.karigar_id
        where j.shop_id = $1 and j.status <> 'handed_over' and coalesce(j.confirmed_date, j.due_date) is not null
        order by j.code
        for update of j`,
      [ctx.shop.shopId],
    );
    for (const job of rows) {
      const confirmedDate = job.confirmed_date?.getTime() ?? null;
      const dueDate = job.due_date?.getTime() ?? (confirmedDate as number);
      const dates = { status: job.status, dueDate, confirmedDate };
      const overdueDays = jobOverdueDays(dates, now);
      if (overdueDays <= 0) continue;
      if (!(await ctx.claimKey(`${job.code}:overdue:${today}`))) continue;
      const agreed = confirmedDate ?? dueDate;
      const firstDay = job.overdue_since === null;
      const overdueSince = job.overdue_since ?? new Date(shopDateTime(addShopDays(shopDate(agreed), 1), 0, 0));
      const updated = await tx.client.query<{ version: number }>(
        'update karigar_jobs set overdue_since = $3, last_reminder_at = $4 where shop_id = $1 and id = $2 returning version',
        [ctx.shop.shopId, job.id, overdueSince, ctx.now],
      );
      await emitOutboxEvent(
        tx.client,
        ctx.shop,
        'notify.karigar_job_overdue_reminder',
        { jobId: job.code, karigarId: job.karigar_code, overdueDays, date: today },
        ctx.now,
      );
      if (firstDay) {
        await emitOutboxEvent(
          tx.client,
          ctx.shop,
          'karigar_job.overdue',
          { jobId: job.code, overdueSince: overdueSince.toISOString() },
          ctx.now,
        );
        // "Karigar job status changed" to staff, owner and the owning karigar (EP-07-S11).
        await emitLiveEvent(tx, ctx.shop, 'karigar_job.status_changed', {
          entityId: job.code,
          entityVersion: updated.rows[0].version,
          at: ctx.now,
          karigarUserId: await karigarUserIdOf(tx.client, ctx.shop, job.karigar_id),
        });
      }
      await writeJobAudit(tx.client, ctx.shop, LABEL, {
        kind: firstDay ? 'job_marked_overdue' : 'job_reminder_sent',
        at: ctx.now,
        summary: firstDay
          ? `Job ${job.code} passed its agreed date`
          : `Overdue reminder for job ${job.code} (${overdueDays} days late)`,
        reference: job.code,
        before: { overdueSince: iso(job.overdue_since), lastReminderAt: iso(job.last_reminder_at) },
        after: { overdueSince: overdueSince.toISOString(), lastReminderAt: ctx.now.toISOString() },
      });
    }
  },
};
