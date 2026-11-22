/**
 * The karigar's view of one job (EP-05-S3 AC5): only the bench fields, no customer, price or
 * weight. Shared by listMyJobs and readMyJob.
 *
 * `referenceImageKey` is the file id (FILE-…) of the job's first reference image attachment
 * (EP-09), or null; the karigar gets its link from readFileLinks. EP-09 replaced the
 * karigar_jobs.ref_image_key column with attachments.
 */
import type { OperationResult } from '@goldsmith/shared';

export type MyJob = OperationResult<'readMyJob'>['job'];

/** The karigar_jobs columns a karigar may see. */
export const MY_JOB_COLUMNS = `id, code, title, style, qty, purity, status, due_date, confirmed_date, stopped,
  (select f.code from attachments a
     join stored_files f on f.shop_id = a.shop_id and f.id = a.file_id
    where a.shop_id = karigar_jobs.shop_id and a.job_id = karigar_jobs.id and a.role = 'reference'
      and f.removed_at is null
    order by a.position limit 1) as reference_file_id`;

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
  reference_file_id: string | null;
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
    referenceImageKey: row.reference_file_id,
  };
}
