/**
 * List Karigar Picker (EP-16-S8): the active karigars a job or parcel can be given to, by code.
 * Only what a picker needs: no phone, workshop location or scorecard figure. Staff and owner;
 * a karigar is refused by the permission check. Keyset paging by (code, id).
 */
import type { contract } from '@goldsmith/shared';
import { clampPageSize } from '../pipeline/paging.js';
import type { Handler } from '../pipeline/registry.js';
import { decodeTextCursor, encodeTextCursor } from '../users/text-cursor.js';
interface PickerRow {
  id: string;
  code: string;
  name: string;
  wastage_bp: number;
  specialties: string[];
}
export const listKarigarPicker: Handler<typeof contract.listKarigarPicker> = async (tx, ctx, input) => {
  const pageSize = clampPageSize(input.pageSize);
  const after = input.cursor === undefined ? undefined : decodeTextCursor(input.cursor);
  const params: unknown[] = [ctx.shop.shopId];
  let afterSql = '';
  if (after) {
    params.push(after[0], after[1]);
    afterSql = ' and (k.code, k.id) > ($2, $3::uuid)';
  }
  params.push(pageSize + 1);
  const { rows } = await tx.client.query<PickerRow>(
    `select k.id, k.code, k.name, k.wastage_bp,
            coalesce((select array_agg(s.specialty order by s.position) from karigar_specialties s
                       where s.karigar_id = k.id), '{}') as specialties
       from karigars k
      where k.shop_id = $1 and k.status = 'active'${afterSql}
      order by k.code, k.id
      limit $${params.length}`,
    params,
  );
  const page = rows.slice(0, pageSize);
  const last = page.at(-1);
  const nextCursor = rows.length > pageSize && last ? encodeTextCursor([last.code, last.id]) : null;
  const items = page.map((r) => ({ id: r.code, name: r.name, specialties: r.specialties, wastageBp: r.wastage_bp }));
  return { ok: true, items, nextCursor, pageSize };
};
