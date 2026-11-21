/**
 * The shop of a public sign-in call (no session yet). v1 has one shop per installation (D7), so
 * it is the only row of `shops`; the client never sends a shop. Tests inject their own shop.
 */
import type pg from 'pg';

type Queryable = pg.Pool | pg.PoolClient;

export type InstallationShop = (client: Queryable) => Promise<string | null>;

export const SHOP_NOT_SET_UP = 'The shop has not been set up yet.';

/** The id of the only shop; null when there is none. More than one is not supported in v1. */
export const installationShop: InstallationShop = async (client) => {
  const { rows } = await client.query<{ id: string }>('select id from shops limit 2');
  if (rows.length > 1) throw new Error('More than one shop exists; v1 supports one shop per installation (D7)');
  return rows[0]?.id ?? null;
};
