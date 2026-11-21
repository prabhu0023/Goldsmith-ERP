/**
 * Due times and overdue days the background jobs act on (EP-10-S5, S7, S10). Day counts use the
 * shop's Asia/Kolkata calendar (shop-time.ts), never the machine's zone.
 */
import type { KarigarJob } from '../types/jewellery.js';
import { HOUR } from './clock.js';
import { shopDaysBetween } from './shop-time.js';

/**
 * How the lead SLA counts its hours. Open decision A2 (shop hours or clock hours) is not taken:
 * only clock hours exist. EP-13 adds 'shop_hours' with its shop calendar.
 */
export const LEAD_SLA_COUNTINGS = ['clock_hours'] as const;
export type LeadSlaCounting = (typeof LEAD_SLA_COUNTINGS)[number];

export interface LeadSlaSettings {
  leadSlaHours: number;
  leadSlaCounting: LeadSlaCounting;
}

/**
 * The moment a lead that arrived at `arrivedAt` passes its SLA. The one place the due time is
 * computed: when A2 is decided, EP-13 replaces or extends this function (a 'shop_hours' case).
 */
export function leadSlaDueAt(arrivedAt: number, settings: LeadSlaSettings): number {
  switch (settings.leadSlaCounting) {
    case 'clock_hours':
      return arrivedAt + settings.leadSlaHours * HOUR;
    default: {
      const unknown: never = settings.leadSlaCounting;
      throw new Error(`Unknown lead SLA counting: ${String(unknown)}`);
    }
  }
}

type JobDates = Pick<KarigarJob, 'dueDate' | 'confirmedDate'>;

/** The date the job is agreed for: the karigar's confirmed date, else the due date it was sent with. */
export const agreedDate = (job: JobDates): number => job.confirmedDate ?? job.dueDate;

/** Whole Asia/Kolkata days the job is past its agreed date at `now`; 0 when not overdue or handed over. */
export function jobOverdueDays(job: JobDates & Pick<KarigarJob, 'status'>, now: number): number {
  if (job.status === 'handed_over') return 0;
  return Math.max(0, shopDaysBetween(now, agreedDate(job)));
}
