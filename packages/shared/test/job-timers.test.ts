import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  agreedDate,
  HOUR,
  type JobStatus,
  jobOverdueDays,
  LEAD_SLA_COUNTINGS,
  leadSlaDueAt,
  shopDateTime,
  slaRunning,
} from '../src/index.js';

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const originalTz = env.TZ;
const restoreTz = (): void => {
  if (originalTz === undefined) delete env.TZ;
  else env.TZ = originalTz;
};

const at = (iso: string): number => Date.parse(iso);
/** Midnight Asia/Kolkata on 1 November 2026: how an agreed date of "1 Nov" is stored. */
const NOV_1 = shopDateTime('2026-11-01', 0, 0);
const NOV_2 = shopDateTime('2026-11-02', 0, 0);
const job = (status: JobStatus, dueDate: number, confirmedDate: number | null = null) => ({
  status,
  dueDate,
  confirmedDate,
});

function jobTimerChecks(): void {
  it('S10 AC3: a job agreed for 1 November is 1 day overdue at 2026-11-01T18:45Z', () => {
    expect(jobOverdueDays(job('on_bench', NOV_1), at('2026-11-01T18:45:00Z'))).toBe(1);
    expect(jobOverdueDays(job('on_bench', NOV_1), at('2026-11-01T18:00:00Z'))).toBe(0);
  });
  it('uses the confirmed date over the due date', () => {
    expect(agreedDate(job('accepted', NOV_1, NOV_2))).toBe(NOV_2);
    expect(agreedDate(job('sent', NOV_1))).toBe(NOV_1);
    expect(jobOverdueDays(job('accepted', NOV_1, NOV_2), at('2026-11-01T18:45:00Z'))).toBe(0);
  });
  it('never counts a handed-over job as overdue', () => {
    expect(jobOverdueDays(job('handed_over', NOV_1), at('2026-11-05T10:00:00Z'))).toBe(0);
  });
  it('counts 0 for a job not yet due', () => {
    expect(jobOverdueDays(job('sent', NOV_2), at('2026-11-01T10:00:00Z'))).toBe(0);
  });
  it('S5: a lead in at 09:00 with an 8-hour clock-hour SLA is due at 17:00', () => {
    const arrived = shopDateTime('2026-11-01', 9, 0);
    const due = leadSlaDueAt(arrived, { leadSlaHours: 8, leadSlaCounting: 'clock_hours' });
    expect(due).toBe(shopDateTime('2026-11-01', 17, 0));
    expect(due - arrived).toBe(8 * HOUR);
  });
}

describe('job timers (EP-10-S5, S7, S10)', () => {
  it('counts only clock hours until A2 is decided', () => {
    expect(LEAD_SLA_COUNTINGS).toEqual(['clock_hours']);
  });
  it('runs the SLA clock for needs_glance and opened leads only', () => {
    expect(slaRunning({ state: 'needs_glance' })).toBe(true);
    expect(slaRunning({ state: 'opened' })).toBe(true);
    expect(slaRunning({ state: 'being_worked' })).toBe(false);
    expect(slaRunning({ state: 'lost' })).toBe(false);
  });
  describe('in the machine zone', jobTimerChecks);
});

describe.each(['UTC', 'America/New_York'])('job timers with the machine zone TZ=%s (EP-10-S10 AC4)', (tz) => {
  beforeEach(() => {
    env.TZ = tz;
  });
  afterEach(restoreTz);
  jobTimerChecks();
});
