/**
 * Gold with a karigar, per open job (EP-18 decision 5). A job is open while its status is not
 * handed_over and it is not settled. The gold with the karigar on a job is the gold issued for
 * it less the sum of its `returned` entries, never below zero. Weights are integer units.
 */
import type pg from 'pg';
import type { ShopContext } from '../db/shop-context.js';
export interface OpenJobGold {
  jobCode: string;
  karigarCode: string;
  karigarName: string;
  issuedUnits: number;
  returnedUnits: number;
  withKarigarUnits: number;
}
/** The shop's open jobs with their gold, by karigar code then job code; `karigarId` (karigars.id) narrows to one karigar. */
export async function openJobGold(
  client: pg.Pool | pg.PoolClient,
  shop: ShopContext,
  karigarId?: string,
): Promise<OpenJobGold[]> {
  const params: unknown[] = [shop.shopId];
  let karigarSql = '';
  if (karigarId !== undefined) {
    params.push(karigarId);
    karigarSql = ' and j.karigar_id = $2';
  }
  const { rows } = await client.query<{
    job_code: string;
    karigar_code: string;
    karigar_name: string;
    issued_units: number;
    returned_units: number;
  }>(
    `select j.code as job_code, k.code as karigar_code, k.name as karigar_name,
            j.gold_issued_units as issued_units,
            coalesce(r.returned_units, 0)::bigint as returned_units
       from karigar_jobs j
       join karigars k on k.id = j.karigar_id and k.shop_id = j.shop_id
       left join (select ref_id, sum(delta_units) as returned_units
                    from pool_entries
                   where shop_id = $1 and kind = 'returned' and ref_type = 'job'
                   group by ref_id) r on r.ref_id = j.code
      where j.shop_id = $1 and j.status <> 'handed_over' and j.settled_at is null${karigarSql}
      order by k.code, j.code`,
    params,
  );
  return rows.map((row) => ({
    jobCode: row.job_code,
    karigarCode: row.karigar_code,
    karigarName: row.karigar_name,
    issuedUnits: row.issued_units,
    returnedUnits: row.returned_units,
    withKarigarUnits: Math.max(0, row.issued_units - row.returned_units),
  }));
}
