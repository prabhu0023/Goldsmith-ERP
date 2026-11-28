/**
 * Read My Karigar Profile (EP-16-S12): the signed-in karigar's own record, found through the
 * karigar record on their user row, never through anything they send (the input is empty). A
 * karigar user not linked to a record gets `profile: null`. No language, rating or other karigar.
 */
import type { contract } from '@goldsmith/shared';
import { callerKarigarId } from '../auth/karigar-scope.js';
import type { Handler } from '../pipeline/registry.js';
import { readSpecialties } from './karigar-store.js';
import { loadScorecards } from './scorecard.js';
export const readMyKarigarProfile: Handler<typeof contract.readMyKarigarProfile> = async (tx, ctx) => {
  const karigarId = await callerKarigarId(tx, ctx);
  if (karigarId === null) return { ok: true, profile: null };
  const { rows } = await tx.client.query<{
    code: string;
    name: string;
    phone: string | null;
    workshop_location: string | null;
    wastage_bp: number;
  }>('select code, name, phone, workshop_location, wastage_bp from karigars where shop_id = $1 and id = $2', [
    ctx.shop.shopId,
    karigarId,
  ]);
  const row = rows[0];
  if (!row) return { ok: true, profile: null };
  const cards = await loadScorecards(tx.client, ctx.shop, [karigarId]);
  return {
    ok: true,
    profile: {
      id: row.code,
      name: row.name,
      phone: row.phone,
      workshopLocation: row.workshop_location,
      specialties: await readSpecialties(tx.client, karigarId),
      wastageBp: row.wastage_bp,
      finishedJobs: cards.get(karigarId)?.finishedJobs ?? 0,
    },
  };
};
