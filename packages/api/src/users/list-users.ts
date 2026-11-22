/**
 * List Users (EP-05-S11): every user of the owner's shop, sorted by name, with role, status,
 * the linked karigar code and, while a lock lasts, when it ends (UTC and Kolkata "HH:MM").
 * Keyset paging by (name, id).
 */
import type { contract } from '@goldsmith/shared';
import { kolkataTime } from '../auth/lockout.js';
import { clampPageSize } from '../pipeline/paging.js';
import type { Handler } from '../pipeline/registry.js';
import { decodeTextCursor, encodeTextCursor } from './text-cursor.js';
import type { UserRow } from './user-store.js';

type ListRow = Pick<UserRow, 'id' | 'name' | 'phone' | 'email' | 'role' | 'status' | 'karigar_code' | 'version'> & {
  locked_until: Date | null;
};

export const listUsers: Handler<typeof contract.listUsers> = async (tx, ctx, input) => {
  const pageSize = clampPageSize(input.pageSize);
  const after = input.cursor === undefined ? undefined : decodeTextCursor(input.cursor);
  const params: unknown[] = [ctx.shop.shopId];
  let afterSql = '';
  if (after) {
    params.push(after[0], after[1]);
    afterSql = ' and (u.name, u.id) > ($2, $3::uuid)';
  }
  params.push(pageSize + 1);
  const { rows } = await tx.client.query<ListRow>(
    `select u.id, u.name, u.phone, u.email, u.role, u.status, k.code as karigar_code, u.version, l.locked_until
       from users u
       left join karigars k on k.shop_id = u.shop_id and k.id = u.karigar_id
       left join sign_in_lockouts l on l.shop_id = u.shop_id and l.user_id = u.id
      where u.shop_id = $1${afterSql}
      order by u.name, u.id
      limit $${params.length}`,
    params,
  );
  const page = rows.slice(0, pageSize);
  const last = page.at(-1);
  const nextCursor = rows.length > pageSize && last ? encodeTextCursor([last.name, last.id]) : null;
  const items = page.map((row) => {
    const locked = row.locked_until !== null && row.locked_until.getTime() > ctx.at.getTime() ? row.locked_until : null;
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      role: row.role,
      status: row.status,
      karigarId: row.karigar_code,
      lockedUntil: locked ? locked.toISOString() : null,
      lockedUntilLocal: locked ? kolkataTime(locked) : null,
      version: row.version,
    };
  });
  return { ok: true, items, nextCursor, pageSize };
};
