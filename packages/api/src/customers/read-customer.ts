/**
 * Read Customer (EP-17-S9, S11): one active customer with their consent history and the pieces
 * they took home, newest first. Weights are summed on the server from integer units. Budget and
 * spend are always null while pricing is off. An unknown, erased or other shop's customer is
 * not_found.
 */
import { type contract, dateTextToDayMonth, formatShopTime, unitsToGrams } from '@goldsmith/shared';
import type { Handler } from '../pipeline/registry.js';
import { loadActiveCustomer } from './customer-store.js';

interface ConsentRow {
  kind: 'opt_in' | 'opt_out';
  source: 'counter' | 'whatsapp_reply' | 'form' | 'import';
  at: Date;
  recorded_by_name: string | null;
}

interface HistoryRow {
  tag_no: string | null;
  name: string | null;
  pure_units: number | null;
  on_at: Date | null;
}

export const readCustomer: Handler<typeof contract.readCustomer> = async (tx, ctx, input) => {
  const c = await loadActiveCustomer(tx.client, ctx.shop, input.customerId);
  const consent = await tx.client.query<ConsentRow>(
    `select e.kind, e.source, e.at, u.name as recorded_by_name
       from consent_events e
       left join users u on u.shop_id = e.shop_id and u.id = e.recorded_by
      where e.shop_id = $1 and e.customer_id = $2
      order by e.at desc, e.seq desc`,
    [ctx.shop.shopId, c.id],
  );
  const history = await tx.client.query<HistoryRow>(
    `select tag_no, name, pure_units, on_at from customer_history
      where shop_id = $1 and customer_id = $2
      order by on_at desc nulls last, tag_no`,
    [ctx.shop.shopId, c.id],
  );
  const totalUnits = history.rows.reduce((sum, row) => sum + Number(row.pure_units ?? 0), 0);
  return {
    ok: true,
    customer: {
      id: c.code,
      name: c.name,
      phone: c.phone ?? '',
      city: c.city,
      address: c.address,
      group: c.customer_group,
      dob: dateTextToDayMonth(c.dob),
      anniversary: dateTextToDayMonth(c.anniversary),
      notes: c.notes,
      optedIn: c.opted_in,
      consent: consent.rows.map((row) => ({
        kind: row.kind,
        source: row.source,
        at: row.at.toISOString(),
        atLocal: formatShopTime(row.at.getTime()),
        recordedBy: row.recorded_by_name,
      })),
      history: history.rows.map((row) => ({
        tag: row.tag_no,
        name: row.name,
        pureG: row.pure_units === null ? null : unitsToGrams(Number(row.pure_units)),
        on: row.on_at ? row.on_at.toISOString() : null,
      })),
      pieceCount: history.rows.length,
      takenHomeG: unitsToGrams(totalUnits),
      version: c.version,
      budgetINR: null,
      spentINR: null,
    },
  };
};
