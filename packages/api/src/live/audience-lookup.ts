/**
 * Facts an emitter needs for a catalogue audience (EP-07-S6): the user linked to a karigar, whose
 * user channel gets that karigar's job events.
 */
import type pg from 'pg';
import type { ShopContext } from '../db/shop-context.js';

type Queryable = pg.Pool | pg.PoolClient;

/** The live (not deactivated) karigar user linked to the karigar record, or null when there is none. */
export async function karigarUserIdOf(client: Queryable, shop: ShopContext, karigarId: string): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `select id from users
      where shop_id = $1 and karigar_id = $2 and role = 'karigar' and status <> 'deactivated'
      order by id limit 1`,
    [shop.shopId, karigarId],
  );
  return rows[0]?.id ?? null;
}
