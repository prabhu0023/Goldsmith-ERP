/**
 * The karigar's view of one job (EP-05-S3 AC5): only the bench fields, no customer, price or
 * weight. Shared by listMyJobs and readMyJob.
 */
import type { OperationResult } from '@goldsmith/shared';

export type MyJob = OperationResult<'readMyJob'>['job'];

/** The karigar_jobs columns a karigar may see. */
export const MY_JOB_COLUMNS =
  'id, code, title, style, qty, purity, status, due_date, confirmed_date, stopped, ref_image_key';

export interface MyJobRow {
  id: string;
  code: string;
  title: string | null;
  style: string | null;
  qty: number | null;
  purity: string | null;
  status: MyJob['status'];
  due_date: Date | null;
  confirmed_date: Date | null;
  stopped: boolean;
  ref_image_key: string | null;
}

export function toMyJob(row: MyJobRow): MyJob {
  return {
    code: row.code,
    title: row.title,
    style: row.style,
    qty: row.qty,
    purity: row.purity,
    status: row.status,
    dueDate: row.due_date?.toISOString() ?? null,
    confirmedDate: row.confirmed_date?.toISOString() ?? null,
    stopped: row.stopped,
    referenceImageKey: row.ref_image_key,
  };
}
