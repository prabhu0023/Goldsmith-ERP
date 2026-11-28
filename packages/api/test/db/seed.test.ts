import { type AppState, DEMO_BASE, gramsToUnits, unitsToGrams } from '@goldsmith/shared';
import type pg from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPool } from '../../src/db/connection.js';
import { migrate } from '../../src/db/migrator.js';
import { loadPrototypeState } from '../../src/db/seed/prototype-loader.js';
import { countRows, SeedRefusedError, seedPrototype } from '../../src/db/seed/seed-database.js';
import { MemoryStorage } from '../../src/files/memory-storage.js';
import { createTempDatabase, describeDb } from './db-test-helpers.js';

const display = (g: number): string => {
  const r = gramsToUnits(String(g));
  if (!r.ok) throw new Error(r.error);
  return unitsToGrams(r.units);
};

/** Fixed load time, so the demo-time shift (S13 AC6) is checked exactly. */
const NOW = new Date('2030-03-04T05:06:07.000Z');
describeDb('prototype seed (EP-02-S13)', () => {
  let temp: Awaited<ReturnType<typeof createTempDatabase>>;
  let pool: pg.Pool;
  let state: AppState;
  let counts: Record<string, number>;
  const storage = new MemoryStorage();
  beforeAll(async () => {
    temp = await createTempDatabase();
    pool = createPool(temp.url, 2);
    await migrate(pool, new URL('../../migrations/', import.meta.url));
    state = await loadPrototypeState();
    counts = await seedPrototype(pool, { appEnv: 'development', now: NOW, storage });
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

  it('seeds customers with normalised phones, status active and no money (EP-17-S1, S2)', async () => {
    const rows = await codes(
      'select code, phone, status, version, budget_inr, spent_inr from customers order by code',
    );
    expect(rows).toHaveLength(state.customers.length);
    for (const row of rows) {
      expect(row.phone).toMatch(/^\+91[0-9]{10}$/);
      expect(row).toMatchObject({ status: 'active', version: 1, budget_inr: null, spent_inr: null });
    }
    const events = await codes(
      `select c.code, e.kind, e.source, e.recorded_by, e.at from consent_events e
         join customers c on c.id = e.customer_id order by c.code`,
    );
    const optedIn = state.customers.filter((c) => c.optedIn).map((c) => c.id);
    expect(events.map((e) => e.code)).toEqual(optedIn.sort());
    for (const e of events) expect(e).toMatchObject({ kind: 'opt_in', source: 'import', recorded_by: null, at: NOW });
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
      consent_events: state.customers.filter((c) => c.optedIn).length,
      customer_history: childCount(state.customers, (c) => c.history),
      pieces: 92,
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
      // EP-09-S13: the four bundled images, attached wherever the prototype used them.
      stored_files: 4,
      attachments:
        childCount(state.pieces, (p) => [...new Set(p.photos)]) +
        childCount(state.orderCopies, (o) => [...new Set(o.refImages)]) +
        state.jobs.filter((j) => j.refImage !== null).length,
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

  it('moves demo times so the demo now is the load time, stored in UTC (AC6)', async () => {
    const shift = NOW.getTime() - DEMO_BASE;
    const rows = await codes(
      `select tag_no, tagged_at, to_char(tagged_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as utc,
              tagged_at::text as text from pieces`,
    );
    const byTag = new Map(rows.map((r) => [r.tag_no, r]));
    for (const p of state.pieces) {
      const row = byTag.get(p.id);
      expect(row.tagged_at.getTime(), `${p.id} tagged_at`).toBe(p.taggedAt + shift);
      expect(row.utc, `${p.id} tagged_at in UTC`).toBe(new Date(p.taggedAt + shift).toISOString());
      expect(row.text).toMatch(/\+00$/);
    }
    const [latest] = await codes('select max(tagged_at) as at from pieces');
    expect(latest.at.getTime()).toBeLessThanOrEqual(NOW.getTime());
    expect(NOW.getTime() - latest.at.getTime()).toBeLessThan(366 * 24 * 3600 * 1000);
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

  it('refuses a second run and changes nothing (EP-09-S13 AC3: still 4 stored files)', async () => {
    await expect(seedPrototype(pool, { appEnv: 'development', storage })).rejects.toBeInstanceOf(SeedRefusedError);
    expect(await countRows(pool)).toEqual(counts);
    expect(storage.keys()).toHaveLength(12);
  });
  it('refuses to run in production (EP-09-S13 AC5: no object written)', async () => {
    const empty = new MemoryStorage();
    await expect(seedPrototype(pool, { appEnv: 'production', storage: empty })).rejects.toThrow(/APP_ENV=production/);
    expect(await countRows(pool)).toEqual(counts);
    expect(empty.keys()).toEqual([]);
  });
  it('EP-09-S13 AC1: stores the four bundled images with thumbnail and display copies under seed keys', async () => {
    const rows = await codes(
      `select code, original_name, content_type, storage_key, thumbnail_key, display_key, resize_failed,
              uploaded_by, uploaded_by_name, uploaded_at, retention_class
         from stored_files order by code`,
    );
    expect(rows.map((r) => [r.code, r.original_name])).toEqual([
      ['FILE-2030-00001', 'antique_kundan_choker_1793356203018.jpg'],
      ['FILE-2030-00002', 'chettinad_haram_necklace_1793356204785.jpg'],
      ['FILE-2030-00003', 'floral_polki_bangle_1793356203612.jpg'],
      ['FILE-2030-00004', 'peacock_ruby_pendant_1793356204370.jpg'],
    ]);
    for (const r of rows) {
      expect(r).toMatchObject({
        content_type: 'image/jpeg',
        storage_key: expect.stringMatching(/^seed\/[0-9a-f]{64}$/),
        resize_failed: false,
        uploaded_by: null,
        uploaded_by_name: 'Seed',
        uploaded_at: NOW,
        retention_class: 'standard',
      });
      expect(r.thumbnail_key).toBe(`${r.storage_key}-thumb.jpg`);
      expect(r.display_key).toBe(`${r.storage_key}-display.jpg`);
    }
    const keys = rows.flatMap((r) => [r.storage_key, r.thumbnail_key, r.display_key]).sort();
    expect(storage.keys()).toEqual(keys);
    expect(keys).toHaveLength(12);
  });
  it('EP-09-S13 AC2: attaches each piece photo, order copy reference and job reference the prototype used', async () => {
    const rows = await codes(
      `select a.owner_type, a.role, a.position, a.attached_by, a.attached_by_name, f.original_name,
              coalesce(p.tag_no, o.code, j.code) as owner
         from attachments a join stored_files f on f.id = a.file_id
         left join pieces p on p.id = a.piece_id
         left join order_copies o on o.id = a.order_copy_id
         left join karigar_jobs j on j.id = a.job_id
        order by a.owner_type, owner, a.position`,
    );
    const actual = (type: string) =>
      rows.filter((r) => r.owner_type === type).map((r) => [r.owner, r.role, r.position, r.original_name]);
    const expected = (role: string, list: Array<{ id: string; images: string[] }>) =>
      list
        .flatMap((x) => [...new Set(x.images)].map((name, i) => [x.id, role, i + 1, name]))
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || Number(a[2]) - Number(b[2]));
    expect(actual('piece')).toEqual(expected('photo', state.pieces.map((p) => ({ id: p.id, images: p.photos }))));
    expect(actual('order_copy')).toEqual(
      expected('reference', state.orderCopies.map((o) => ({ id: o.id, images: o.refImages }))),
    );
    expect(actual('job')).toEqual(
      expected('reference', state.jobs.map((j) => ({ id: j.id, images: j.refImage ? [j.refImage] : [] }))),
    );
    expect(actual('piece').length).toBeGreaterThan(0);
    expect(actual('order_copy').length).toBeGreaterThan(0);
    expect(actual('job').length).toBeGreaterThan(0);
    expect(rows.every((r) => r.attached_by === null && r.attached_by_name === 'Seed')).toBe(true);
  });
  it('EP-09-S13 AC3: seeding a fresh database with the same bucket still gives 4 files and 12 objects', async () => {
    const second = await createTempDatabase();
    const secondPool = createPool(second.url, 2);
    try {
      await migrate(secondPool, new URL('../../migrations/', import.meta.url));
      const again = await seedPrototype(secondPool, { appEnv: 'development', now: NOW, storage });
      expect(again.stored_files).toBe(4);
      expect(again.attachments).toBe(counts.attachments);
      expect(storage.keys()).toHaveLength(12);
    } finally {
      await secondPool.end();
      await second.drop();
    }
  }, 60_000);
  it('skips the seed images with a message when file storage is not configured', async () => {
    const third = await createTempDatabase();
    const thirdPool = createPool(third.url, 2);
    const lines: string[] = [];
    try {
      await migrate(thirdPool, new URL('../../migrations/', import.meta.url));
      const plain = await seedPrototype(thirdPool, { appEnv: 'development', now: NOW, log: (l) => lines.push(l) });
      expect(plain).toMatchObject({ stored_files: 0, attachments: 0, pieces: counts.pieces });
      expect(lines).toEqual(['File storage is not configured: seed images skipped.']);
    } finally {
      await thirdPool.end();
      await third.drop();
    }
  }, 60_000);
});
