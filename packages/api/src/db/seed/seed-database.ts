/**
 * Fills an empty database with the web prototype's data (EP-02-S13), in one transaction.
 * Prototype ids (TAG-8841, BATCH-2026-044, KG-02) go into tag_no / code; every row gets a new
 * uuid. Demo times are moved so the demo "now" (DEMO_BASE) is the seeding moment. Weights are
 * converted from the gram text to integer units of 0.0001 g. Not carried over: heldForLeadId,
 * edit tokens, the id counter and the last-used scale.
 */
import { randomUUID } from 'node:crypto';
import { DEMO_BASE, gramsToUnits } from '@goldsmith/shared';
import type pg from 'pg';
import type { AppEnv } from '../../config.js';
import { insertScoped, loadShopContext } from '../shop-context.js';
import { withTransaction } from '../transaction.js';
import { loadPrototypeState } from './prototype-loader.js';

export const SHOP_NAME = 'Jai Gulab Dev Jewellers';

/** Every table the seed fills, in the order it fills them (the count table follows it). */
export const SEEDED_TABLES = [
  'shops',
  'locations',
  'settings',
  'scales',
  'karigars',
  'karigar_gap_history',
  'staff_members',
  'users',
  'customers',
  'customer_history',
  'stock_outs',
  'pieces',
  'piece_photos',
  'piece_edits',
  'parcels',
  'parcel_weighings',
  'parcel_manifest_rows',
  'parcel_qc_ticks',
  'leads',
  'lead_items',
  'lead_fields',
  'karigar_jobs',
  'order_copies',
  'order_copy_images',
  'metal_pools',
  'pool_entries',
  'problems',
  'scrap_requests',
  'stock_out_pieces',
  'audit_entries',
  'broadcasts',
  'broadcast_recipients',
  'broadcast_pieces',
  'wishes',
] as const;

export class SeedRefusedError extends Error {
  override readonly name = 'SeedRefusedError';
}

type Queryable = pg.Pool | pg.PoolClient;

/** Row count of every seeded table. */
export async function countRows(client: Queryable): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of SEEDED_TABLES) {
    counts[table] = (await client.query<{ n: number }>(`select count(*) as n from ${table}`)).rows[0].n;
  }
  return counts;
}

function units(g: number, what: string): number {
  const r = gramsToUnits(String(g));
  if (!r.ok) throw new Error(`${what}: ${r.error}`);
  return r.units;
}

const unitsOrNull = (g: number | null, what: string): number | null => (g === null ? null : units(g, what));

export interface SeedOptions {
  appEnv: AppEnv;
  now?: Date;
}

/** Seed an empty database; returns the row count of every seeded table. */
export async function seedPrototype(pool: pg.Pool, options: SeedOptions): Promise<Record<string, number>> {
  if (options.appEnv === 'production') throw new SeedRefusedError('db:seed is refused when APP_ENV=production');
  const state = await loadPrototypeState();
  const offset = (options.now ?? new Date()).getTime() - DEMO_BASE;
  const time = (ms: number | null): Date | null => (ms === null ? null : new Date(ms + offset));

  return withTransaction(pool, async (client) => {
    await client.query('lock table shops in exclusive mode');
    const existing = (await client.query<{ n: number }>('select count(*) as n from shops')).rows[0].n;
    if (existing > 0) {
      throw new SeedRefusedError(
        'The database already has a shop; db:seed only fills an empty database (run npm run db:reset first).',
      );
    }
    await client.query('set constraints all deferred');

    // One new uuid per prototype id, assigned up front so rows can point at rows written later.
    const ids = new Map<string, string>();
    const assign = (kind: string, protoId: string) => ids.set(`${kind}:${protoId}`, randomUUID());
    const ref = (kind: string, protoId: string): string => {
      const id = ids.get(`${kind}:${protoId}`);
      if (!id) throw new Error(`Seed refers to unknown ${kind} ${protoId}`);
      return id;
    };
    const refOrNull = (kind: string, protoId: string | null) => (protoId === null ? null : ref(kind, protoId));
    for (const s of state.scales) assign('scale', s.id);
    for (const k of state.karigars) assign('karigar', k.id);
    for (const s of state.staff) assign('staff', s.id);
    for (const c of state.customers) assign('customer', c.id);
    for (const s of state.stockOuts) assign('stockOut', s.id);
    for (const p of state.pieces) assign('piece', p.id);
    for (const p of state.parcels) assign('parcel', p.id);
    for (const l of state.leads) {
      assign('lead', l.id);
      for (const item of l.items) assign('leadItem', item.id);
    }
    for (const j of state.jobs) assign('job', j.id);
    for (const o of state.orderCopies) assign('orderCopy', o.id);

    const shopId = randomUUID();
    await client.query('insert into shops (id, name) values ($1, $2)', [shopId, SHOP_NAME]);
    const ctx = await loadShopContext(client, shopId);
    const ins = (table: string, values: Record<string, unknown>) => insertScoped(client, ctx, table, values);

    const s = state.settings;
    await client.query(
      `update settings set pricing_enabled = $2, lead_sla_hours = $3, require_edit_token = $4,
         notify_whatsapp = $5, notify_app = $6, notify_email = $7, late_lead_audience = $8, auto_send_wishes = $9
       where shop_id = $1`,
      [
        shopId,
        s.pricingEnabled,
        s.leadSlaHours,
        s.requireEditToken,
        s.notifyChannels.whatsapp,
        s.notifyChannels.app,
        s.notifyChannels.email,
        s.lateLeadAudience,
        s.autoSendWishes,
      ],
    );

    for (const sc of state.scales) {
      await ins('scales', {
        id: ref('scale', sc.id),
        code: sc.id,
        name: sc.name,
        readability_units: units(sc.readabilityG, `scale ${sc.id} readability`),
        capacity_units: units(sc.capacityG, `scale ${sc.id} capacity`),
      });
    }

    for (const k of state.karigars) {
      const karigarId = ref('karigar', k.id);
      await ins('karigars', {
        id: karigarId,
        code: k.id,
        name: k.name,
        phone: k.phone,
        specialty: k.specialty,
        language: k.language,
        wastage_pct: k.wastagePct,
        metal_loss_pct: k.metalLossPct,
        late_days: k.lateDays,
        rating: k.rating,
        finished_jobs: k.finishedJobs,
        open_since: k.openSince,
      });
      for (const [position, mg] of k.gapsMg.entries()) {
        await ins('karigar_gap_history', {
          karigar_id: karigarId,
          position,
          gap_units: units(mg / 1000, `karigar ${k.id} gap ${position}`),
        });
      }
    }

    for (const st of state.staff) {
      await ins('staff_members', {
        id: ref('staff', st.id),
        code: st.id,
        name: st.name,
        role: st.role,
        login: st.login,
        phone: st.phone,
        sales_count: st.salesCount,
      });
    }

    // One sign-in account per staff member and karigar; EP-04 activates them.
    const userByName = new Map<string, string>();
    const addUser = async (values: Record<string, unknown>) => {
      const row = await ins('users', { ...values, status: 'pending_activation' });
      userByName.set(values.name as string, row.id as string);
    };
    for (const st of state.staff) {
      await addUser({
        name: st.name,
        phone: st.phone,
        email: `${(st.login || st.id).toLowerCase()}@example.com`,
        role: st.role,
      });
    }
    for (const k of state.karigars) {
      await addUser({
        name: k.name,
        phone: k.phone,
        email: `${k.id.toLowerCase()}@example.com`,
        role: 'karigar',
        karigar_id: ref('karigar', k.id),
      });
    }

    for (const c of state.customers) {
      const customerId = ref('customer', c.id);
      await ins('customers', {
        id: customerId,
        code: c.id,
        name: c.name,
        phone: c.phone,
        city: c.city,
        customer_group: c.group,
        dob: c.dob,
        anniversary: c.anniversary,
        opted_in: c.optedIn,
        notes: c.notes,
        budget_inr: c.budgetINR,
        spent_inr: c.spentINR,
      });
      for (const [position, h] of c.history.entries()) {
        await ins('customer_history', {
          customer_id: customerId,
          position,
          code: h.id,
          name: h.name,
          tag_no: h.tag,
          pure_units: units(h.pureG, `customer ${c.id} history ${h.id}`),
          on_at: time(h.on),
        });
      }
    }

    for (const so of state.stockOuts) {
      await ins('stock_outs', {
        id: ref('stockOut', so.id),
        code: so.id,
        seller_id: ref('staff', so.sellerId),
        seller_name: so.sellerName,
        billing_ref: so.ref,
        invoice_no: so.invoiceNo,
        at: time(so.at),
        amount_inr: so.amountINR,
      });
    }

    for (const p of state.pieces) {
      const pieceId = ref('piece', p.id);
      await ins('pieces', {
        id: pieceId,
        tag_no: p.id,
        name: p.name,
        kind: p.kind,
        collection: p.collection,
        style: p.style,
        purity: p.purity,
        huid: p.huid === '' ? null : p.huid,
        gross_units: units(p.grossG, `piece ${p.id} gross`),
        stone_units: units(p.stoneG, `piece ${p.id} stone`),
        stone_count: p.stoneCount,
        size: p.size,
        scale_id: ref('scale', p.scaleId),
        status: p.status,
        prev_status: p.prevStatus,
        parcel_id: refOrNull('parcel', p.parcelId),
        job_id: refOrNull('job', p.jobId),
        stock_out_id: refOrNull('stockOut', p.stockOutId),
        made_by_id: refOrNull('karigar', p.madeById),
        tagged_by_name: p.taggedBy,
        tagged_at: time(p.taggedAt),
        in_stock_at: time(p.inStockAt),
        sold_at: time(p.soldAt),
        note: p.note,
        value_inr: p.valueINR,
      });
      for (const [position, photo] of p.photos.entries()) {
        await ins('piece_photos', { piece_id: pieceId, position, storage_key: photo });
      }
    }

    for (const e of state.edits) {
      const weight = e.field === 'grossG' || e.field === 'stoneG';
      await ins('piece_edits', {
        code: e.id,
        piece_id: ref('piece', e.pieceId),
        field: e.field,
        before_units: weight ? units(Number(e.from), `edit ${e.id} from`) : null,
        after_units: weight ? units(Number(e.to), `edit ${e.id} to`) : null,
        before_text: weight ? null : String(e.from),
        after_text: weight ? null : String(e.to),
        reason: e.reason,
        status: e.status,
        token_issued_at: time(e.tokenIssuedAt),
        proposed_by_name: e.proposedBy,
        proposed_at: time(e.proposedAt),
        decided_at: time(e.decidedAt),
      });
    }

    for (const pc of state.parcels) {
      const parcelId = ref('parcel', pc.id);
      await ins('parcels', {
        id: parcelId,
        code: pc.id,
        karigar_id: ref('karigar', pc.karigarId),
        job_id: refOrNull('job', pc.jobId),
        po_ref: pc.poRef,
        arrived_at: time(pc.arrivedAt),
        stage: pc.stage,
        status: pc.status,
        resolution: pc.resolution,
        recheck_piece_id: refOrNull('piece', pc.recheckPieceId),
        verdict: pc.verdict,
        gap_net_units: unitsOrNull(pc.gapNetG, `parcel ${pc.id} gap`),
        loss_units: unitsOrNull(pc.lossG, `parcel ${pc.id} loss`),
        loss_reason: pc.lossReason,
        released_at: time(pc.releasedAt),
        released_by_name: pc.releasedBy,
        stopped_at: time(pc.stoppedAt),
      });
      for (const [position, w] of pc.weighings.entries()) {
        await ins('parcel_weighings', {
          parcel_id: parcelId,
          position,
          code: w.id,
          label: w.label,
          scale_id: ref('scale', w.scaleId),
          gross_units: units(w.grossG, `weighing ${w.id} gross`),
          stone_units: units(w.stoneG, `weighing ${w.id} stone`),
        });
      }
      for (const [position, m] of pc.manifest.entries()) {
        await ins('parcel_manifest_rows', { parcel_id: parcelId, position, code: m.id, kind: m.kind, item_count: m.count });
      }
      for (const [position, pieceTag] of pc.qcDone.entries()) {
        await ins('parcel_qc_ticks', { parcel_id: parcelId, piece_id: ref('piece', pieceTag), position });
      }
    }

    for (const l of state.leads) {
      const leadId = ref('lead', l.id);
      await ins('leads', {
        id: leadId,
        code: l.id,
        title: l.title,
        source: l.source,
        state: l.state,
        confidence: l.confidence,
        arrived_at: time(l.arrivedAt),
        customer_name: l.customerName,
        phone: l.phone,
        message: l.message,
        needed_by: time(l.neededBy),
        taken_by_name: l.takenBy,
        note: l.note,
      });
      for (const [position, item] of l.items.entries()) {
        await ins('lead_items', {
          id: ref('leadItem', item.id),
          lead_id: leadId,
          position,
          code: item.id,
          name: item.name,
          style: item.style,
          qty: item.qty,
          approx_weight_units: unitsOrNull(item.approxWeightG, `lead item ${item.id} weight`),
          route_kind: item.route?.kind ?? null,
          route_piece_id: item.route?.kind === 'stock' ? ref('piece', item.route.pieceId) : null,
          route_job_id: item.route?.kind === 'make' ? ref('job', item.route.jobId) : null,
        });
      }
      for (const [position, f] of l.fields.entries()) {
        await ins('lead_fields', {
          lead_id: leadId,
          position,
          field_key: f.key,
          label: f.label,
          value: f.value,
          flagged: f.flagged,
        });
      }
    }

    for (const j of state.jobs) {
      await ins('karigar_jobs', {
        id: ref('job', j.id),
        code: j.id,
        order_copy_id: refOrNull('orderCopy', j.orderCopyId),
        title: j.title,
        style: j.style,
        qty: j.qty,
        purity: j.purity,
        karigar_id: ref('karigar', j.karigarId),
        status: j.status,
        sent_at: time(j.sentAt),
        due_date: time(j.dueDate),
        confirmed_date: time(j.confirmedDate),
        target_gross_units: units(j.targetGrossG, `job ${j.id} target gross`),
        target_net_units: units(j.targetNetG, `job ${j.id} target net`),
        tolerance_units: units(j.toleranceG, `job ${j.id} tolerance`),
        gold_issued_units: units(j.goldIssuedG, `job ${j.id} gold issued`),
        note: j.note,
        ref_image_key: j.refImage,
        stopped: j.stopped,
        parcel_id: refOrNull('parcel', j.parcelId),
        bench_note: j.benchNote,
        settled_at: time(j.settledAt),
      });
    }

    for (const o of state.orderCopies) {
      const orderCopyId = ref('orderCopy', o.id);
      await ins('order_copies', {
        id: orderCopyId,
        code: o.id,
        lead_id: refOrNull('lead', o.leadId),
        lead_item_id: refOrNull('leadItem', o.leadItemId),
        job_id: ref('job', o.jobId),
        brief: o.brief,
        qty: o.qty,
        purity: o.purity,
        target_gross_units: units(o.targetGrossG, `order copy ${o.id} target gross`),
        target_net_units: units(o.targetNetG, `order copy ${o.id} target net`),
        tolerance_units: units(o.toleranceG, `order copy ${o.id} tolerance`),
        gold_issued_units: units(o.goldIssuedG, `order copy ${o.id} gold issued`),
        karigar_id: ref('karigar', o.karigarId),
        due_date: time(o.dueDate),
        created_by_name: o.createdBy,
        created_at: time(o.createdAt),
      });
      for (const [position, image] of o.refImages.entries()) {
        await ins('order_copy_images', { order_copy_id: orderCopyId, position, storage_key: image });
      }
    }

    // The balance is the integer sum of the ledger, so the two always agree.
    const entries = state.pool.ledger.map((e) => ({ e, deltaUnits: units(e.deltaG, `pool entry ${e.id}`) }));
    const metalPool = await ins('metal_pools', { balance_units: entries.reduce((sum, x) => sum + x.deltaUnits, 0) });
    for (const { e, deltaUnits } of entries) {
      await ins('pool_entries', {
        metal_pool_id: metalPool.id,
        code: e.id,
        at: time(e.at),
        kind: e.kind,
        delta_units: deltaUnits,
        note: e.note,
        reference: e.ref,
      });
    }

    for (const pr of state.problems) {
      const kind = pr.target.kind;
      await ins('problems', {
        code: pr.id,
        target_kind: kind,
        piece_id: kind === 'piece' ? ref('piece', pr.target.id) : null,
        parcel_id: kind === 'parcel' ? ref('parcel', pr.target.id) : null,
        job_id: kind === 'job' ? ref('job', pr.target.id) : null,
        text: pr.text,
        raised_by_name: pr.raisedBy,
        raised_by_role: pr.raisedByRole,
        raised_at: time(pr.raisedAt),
        status: pr.status,
        cleared_by_name: pr.clearedBy,
        cleared_at: time(pr.clearedAt),
      });
    }

    for (const sr of state.scrapRequests) {
      await ins('scrap_requests', {
        code: sr.id,
        piece_id: ref('piece', sr.pieceId),
        reason: sr.reason,
        requested_by_name: sr.requestedBy,
        requested_at: time(sr.requestedAt),
        status: sr.status,
        decided_at: time(sr.decidedAt),
      });
    }

    for (const so of state.stockOuts) {
      for (const [position, pieceTag] of so.pieceIds.entries()) {
        await ins('stock_out_pieces', {
          stock_out_id: ref('stockOut', so.id),
          piece_id: ref('piece', pieceTag),
          position,
        });
      }
    }

    for (const a of state.audit) {
      const actorId = userByName.get(a.actorName);
      if (!actorId) throw new Error(`Audit entry ${a.id}: no user named ${a.actorName}`);
      await ins('audit_entries', {
        code: a.id,
        at: time(a.at),
        actor_id: actorId,
        actor_name: a.actorName,
        actor_role: a.actorRole,
        kind: a.kind,
        summary: a.summary,
        detail: a.detail,
        reference: a.ref,
      });
    }

    for (const b of state.broadcasts) {
      const broadcast = await ins('broadcasts', {
        code: b.id,
        at: time(b.at),
        audience: b.audience,
        message: b.message,
        sent_by_name: b.sentBy,
      });
      for (const customerCode of b.recipientIds) {
        await ins('broadcast_recipients', { broadcast_id: broadcast.id, customer_id: ref('customer', customerCode) });
      }
      for (const [position, pieceTag] of b.pieceIds.entries()) {
        await ins('broadcast_pieces', { broadcast_id: broadcast.id, piece_id: ref('piece', pieceTag), position });
      }
    }

    for (const w of state.wishes) {
      await ins('wishes', {
        code: w.id,
        at: time(w.at),
        customer_id: ref('customer', w.customerId),
        kind: w.kind,
        sender_name: w.sender,
      });
    }

    // Check the deferred foreign keys now, so a broken link names itself before the count.
    await client.query('set constraints all immediate');
    return countRows(client);
  });
}
