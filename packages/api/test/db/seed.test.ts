import { type AppState, gramsToUnits, unitsToGrams } from '@goldsmith/shared';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPool } from '../../src/db/connection.js';
import { migrate } from '../../src/db/migrator.js';
import { loadPrototypeState } from '../../src/db/seed/prototype-loader.js';
import { countRows, SeedRefusedError, seedPrototype } from '../../src/db/seed/seed-database.js';
import { createTempDatabase, describeDb } from './db-test-helpers.js';

const display = (g: number): string => {
  const r = gramsToUnits(String(g));
  if (!r.ok) throw new Error(r.error);
  return unitsToGrams(r.units);
};

describeDb('prototype seed (EP-02-S13)', () => {
  let temp: Awaited<ReturnType<typeof createTempDatabase>>;
  let pool: pg.Pool;
  let state: AppState;
  let counts: Record<string, number>;

  beforeAll(async () => {
    temp = await createTempDatabase();
    pool = createPool(temp.url, 2);
    await migrate(pool, new URL('../../migrations/', import.meta.url));
    state = await loadPrototypeState();
    counts = await seedPrototype(pool, { appEnv: 'development' });
  }, 60_000);
  afterAll(async () => {
    await pool?.end();
    await temp?.drop();
  });

  const codes = async (sql: string) => (await pool.query(sql)).rows;

  it('loads the parcels, karigars, staff and scales of the prototype', async () => {
    expect((await codes('select code from parcels order by code')).map((r) => r.code)).toEqual([
      'BATCH-2026-041',
      'BATCH-2026-043',
      'BATCH-2026-044',
      'BATCH-2026-045',
      'BATCH-2026-046',
    ]);
    expect(await codes('select code, name from karigars order by code')).toEqual([
      { code: 'KG-01', name: 'Lakshmi Devi' },
      { code: 'KG-02', name: 'Mahesh Soni' },
      { code: 'KG-04', name: 'Vijay Kumar' },
    ]);
    expect((await codes('select code from staff_members order by code')).map((r) => r.code)).toEqual([
      'ST-01',
      'ST-02',
      'ST-03',
    ]);
    expect(await codes('select code, readability_units, capacity_units from scales order by code')).toEqual([
      { code: 'SC-BENCH', readability_units: 1, capacity_units: 6000000 },
      { code: 'SC-PLAT', readability_units: 100, capacity_units: 300000000 },
    ]);
  });

  it('counts one row per prototype record', () => {
    const childCount = <T>(list: T[], of: (x: T) => unknown[]) => list.reduce((n, x) => n + of(x).length, 0);
    expect(counts).toMatchObject({
      shops: 1,
      locations: 1,
      settings: 1,
      scales: state.scales.length,
      karigars: 3,
      karigar_gap_history: childCount(state.karigars, (k) => k.gapsMg),
      staff_members: 3,
      users: 6,
      customers: 8,
      customer_history: childCount(state.customers, (c) => c.history),
      pieces: 92,
      piece_photos: childCount(state.pieces, (p) => p.photos),
      piece_edits: state.edits.length,
      parcels: 5,
      parcel_weighings: childCount(state.parcels, (p) => p.weighings),
      parcel_manifest_rows: childCount(state.parcels, (p) => p.manifest),
      parcel_qc_ticks: childCount(state.parcels, (p) => p.qcDone),
      leads: 11,
      lead_items: childCount(state.leads, (l) => l.items),
      lead_fields: childCount(state.leads, (l) => l.fields),
      karigar_jobs: 9,
      order_copies: state.orderCopies.length,
      order_copy_images: childCount(state.orderCopies, (o) => o.refImages),
      metal_pools: 1,
      pool_entries: state.pool.ledger.length,
      problems: state.problems.length,
      scrap_requests: state.scrapRequests.length,
      stock_outs: 8,
      stock_out_pieces: 23,
      audit_entries: 3,
      broadcasts: 0,
      wishes: 4,
    });
    expect(counts.pieces).toBe(state.pieces.length);
    expect(counts.leads).toBe(state.leads.length);
    expect(counts.karigar_jobs).toBe(state.jobs.length);
  });

  it('reads every piece weight back as its four-decimal source value', async () => {
    const rows = await codes('select tag_no, gross_units, stone_units from pieces');
    const byTag = new Map(rows.map((r) => [r.tag_no, r]));
    for (const p of state.pieces) {
      const row = byTag.get(p.id);
      expect(unitsToGrams(row.gross_units), `${p.id} gross`).toBe(display(p.grossG));
      expect(unitsToGrams(row.stone_units), `${p.id} stone`).toBe(display(p.stoneG));
      expect(Number(unitsToGrams(row.gross_units))).toBe(p.grossG);
    }
    expect(unitsToGrams(byTag.get('TAG-8701').gross_units)).toBe('30.5582');
    expect(unitsToGrams(byTag.get('TAG-8701').stone_units)).toBe('3.8469');
    expect(byTag.get('TAG-8841')).toMatchObject({ gross_units: 486500, stone_units: 70600 });
  });

  it('keeps every money socket empty and the prototype settings', async () => {
    const [money] = await codes(`select
      (select count(*) from pieces where value_inr is not null) as pieces,
      (select count(*) from customers where budget_inr is not null or spent_inr is not null) as customers,
      (select count(*) from stock_outs where amount_inr is not null) as stock_outs`);
    expect(money).toEqual({ pieces: 0, customers: 0, stock_outs: 0 });
    const [settings] = await codes('select pricing_enabled, lead_sla_hours, require_edit_token from settings');
    expect(settings).toEqual({ pricing_enabled: false, lead_sla_hours: 8, require_edit_token: true });
  });

  it('keeps the pool ledger equal to the balance', async () => {
    const [row] = await codes(
      'select p.balance_units, sum(e.delta_units)::bigint as ledger from metal_pools p join pool_entries e on e.metal_pool_id = p.id group by p.id',
    );
    expect(row.ledger).toBe(row.balance_units);
    expect(unitsToGrams(row.balance_units)).toBe(display(state.pool.balanceG));
  });

  it('keeps weighings, manifest rows and karigar gaps in prototype order', async () => {
    for (const pc of state.parcels) {
      const weighings = await pool.query(
        `select w.code, w.gross_units from parcel_weighings w join parcels p on p.id = w.parcel_id
          where p.code = $1 order by w.position`,
        [pc.id],
      );
      expect(weighings.rows.map((r) => [r.code, unitsToGrams(r.gross_units)])).toEqual(
        pc.weighings.map((w) => [w.id, display(w.grossG)]),
      );
      const manifest = await pool.query(
        `select m.code, m.kind, m.item_count from parcel_manifest_rows m join parcels p on p.id = m.parcel_id
          where p.code = $1 order by m.position`,
        [pc.id],
      );
      expect(manifest.rows).toEqual(pc.manifest.map((m) => ({ code: m.id, kind: m.kind, item_count: m.count })));
    }
    for (const k of state.karigars) {
      const gaps = await pool.query(
        `select g.gap_units from karigar_gap_history g join karigars k on k.id = g.karigar_id
          where k.code = $1 order by g.position`,
        [k.id],
      );
      expect(gaps.rows.map((r) => r.gap_units)).toEqual(k.gapsMg.map((mg) => mg * 10));
    }
  });

  it('gives every audit entry an actor that is a user of the shop', async () => {
    const rows = await codes(
      `select a.code, u.name as user_name, a.actor_name from audit_entries a
         left join users u on u.id = a.actor_id and u.shop_id = a.shop_id`,
    );
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r.user_name).toBe(r.actor_name);
  });

  it('stores HUIDs, holds and tokens the way the schema expects', async () => {
    const [row] = await codes(`select
      (select count(*) from pieces where huid = '') as empty_huids,
      (select count(*) from piece_edits where token_ref is not null) as tokens`);
    expect(row).toEqual({ empty_huids: 0, tokens: 0 });
    const users = await codes('select role, status, email from users order by email');
    expect(users.every((u) => u.status === 'pending_activation')).toBe(true);
    expect(users.filter((u) => u.role === 'karigar')).toHaveLength(3);
  });

  it('refuses a second run and changes nothing', async () => {
    await expect(seedPrototype(pool, { appEnv: 'development' })).rejects.toBeInstanceOf(SeedRefusedError);
    expect(await countRows(pool)).toEqual(counts);
  });

  it('refuses to run in production', async () => {
    await expect(seedPrototype(pool, { appEnv: 'production' })).rejects.toThrow(/APP_ENV=production/);
    expect(await countRows(pool)).toEqual(counts);
  });
});
