/**
 * Shared set-up for the karigar master tests (EP-16): the production app with the owner Sanjay
 * Seth, the staff user Rajesh Verma (`h.session`) and a karigar user, three seeded-style karigars
 * (KG-01 Lakshmi Devi, KG-02 Mahesh Soni, KG-04 Vijay Kumar with the open job MO-2026-118), and
 * readers for what the operations write.
 */
import { KARIGAR_MESSAGES } from '@goldsmith/shared';
import { insertScoped } from '../../src/db/shop-context.js';
import { newSession, newUser } from '../support/api-harness.js';
import { startUsersHarness, type UsersHarness } from '../users/user-test-helpers.js';

export const OWNER_ONLY = { code: 'forbidden', message: KARIGAR_MESSAGES.ownerOnly };
export const FORBIDDEN = { status: 403, body: OWNER_ONLY };
export const validation = (field: string, message: string) => ({ status: 400, body: { code: 'validation', message, field } });
export const ruleRefused = (message: string) => ({ status: 422, body: { code: 'rule_refused', message } });

export interface KarigarHarness extends UsersHarness {
  /** Vijay Kumar's session (a karigar user linked to KG-04). */
  karigarSession: string;
  karigarUserId: string;
  /** Karigar record uuids by code. */
  ids: Record<string, string>;
}

export async function seedKarigar(
  h: UsersHarness,
  code: string,
  name: string,
  phone: string,
  wastageBp: number,
  specialties: string[],
  workshopLocation: string | null,
  status: 'active' | 'deactivated' = 'active',
): Promise<string> {
  const row = await insertScoped<{ id: string }>(h.pool, h.shop, 'karigars', {
    code,
    name,
    phone,
    email: `${code.toLowerCase()}@example.com`,
    wastage_bp: wastageBp,
    workshop_location: workshopLocation,
    status,
    ...(status === 'deactivated' ? { deactivated_at: new Date('2026-11-01T00:00:00Z') } : {}),
  });
  for (const [position, specialty] of specialties.entries()) {
    await insertScoped(h.pool, h.shop, 'karigar_specialties', { karigar_id: row.id, specialty, position });
  }
  return row.id;
}

export async function startKarigarHarness(): Promise<KarigarHarness> {
  const h = await startUsersHarness();
  const ids: Record<string, string> = {
    'KG-01': await seedKarigar(h, 'KG-01', 'Lakshmi Devi', '+919840010101', 70, ['Chettinad'], 'Kanchipuram'),
    'KG-02': await seedKarigar(h, 'KG-02', 'Mahesh Soni', '+919840020202', 80, ['Kundan', 'Polki'], null),
    'KG-04': await seedKarigar(h, 'KG-04', 'Vijay Kumar', '+919840040404', 80, ['Antique', 'Temple'], null),
  };
  await insertScoped(h.pool, h.shop, 'karigar_jobs', {
    code: 'MO-2026-118',
    karigar_id: ids['KG-04'],
    target_gross_units: 1,
    target_net_units: 1,
    tolerance_units: 1,
    gold_issued_units: 1,
  });
  const karigarUserId = await newUser(h.pool, h.shop, {
    name: 'Vijay Kumar',
    role: 'karigar',
    phone: '+919840040404',
    email: 'kg-04@example.com',
    karigarId: ids['KG-04'],
  });
  const karigarSession = await newSession(h.pool, h.shop, karigarUserId);
  return Object.assign(h, { karigarSession, karigarUserId, ids });
}

export interface KarigarView {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string;
  workshop_location: string | null;
  wastage_bp: number;
  status: string;
  language: string;
  deactivated_at: Date | null;
  open_since: string | null;
  version: number;
  specialties: string[];
}

export async function karigarRow(h: UsersHarness, code: string): Promise<KarigarView> {
  const { rows } = await h.pool.query<KarigarView>(
    `select k.id, k.code, k.name, k.phone, k.email, k.workshop_location, k.wastage_bp, k.status, k.language,
            k.deactivated_at, to_char(k.open_since, 'YYYY-MM-DD') as open_since, k.version,
            coalesce((select array_agg(s.specialty order by s.position) from karigar_specialties s where s.karigar_id = k.id),
                     '{}') as specialties
       from karigars k where k.shop_id = $1 and k.code = $2`,
    [h.shop.shopId, code],
  );
  return rows[0];
}

export async function karigarCount(h: UsersHarness): Promise<number> {
  const { rows } = await h.pool.query('select count(*)::int as n from karigars where shop_id = $1', [h.shop.shopId]);
  return rows[0].n;
}

export interface AuditView {
  id: string;
  kind: string;
  actor_id: string | null;
  actor_name: string;
  actor_role: string;
  entity_type: string;
  entity_id: string;
  reference: string | null;
  reason: string | null;
  at: Date;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
}

/** Every audit entry of the shop, oldest first, optionally of some kinds only. */
export async function auditEntries(h: UsersHarness, kinds?: string[]): Promise<AuditView[]> {
  const { rows } = await h.pool.query<AuditView>(
    `select id, kind, actor_id, actor_name, actor_role, entity_type, entity_id, reference, reason, at, before_value, after_value
       from audit_entries where shop_id = $1 and ($2::text[] is null or kind = any($2)) order by at, id`,
    [h.shop.shopId, kinds ?? null],
  );
  return rows;
}

export const KARIGAR_AUDIT_KINDS = [
  'karigar_onboarded',
  'karigar_edited',
  'karigar_wastage_changed',
  'karigar_deactivated',
  'karigar_reactivated',
];

/** Weights below are integer units of 0.0001 g (4_473_000 = 447.3000 g). */
export interface JobFixture {
  code: string;
  karigarId: string;
  issuedUnits: number;
  status?: 'sent' | 'accepted' | 'on_bench' | 'ready' | 'handed_over';
  /** A finished job has `settledAt`. */
  settledAt?: string | null;
  dueDate?: string | null;
  confirmedDate?: string | null;
  title?: string;
}
/** Insert a job; returns its id. */
export async function addJob(h: UsersHarness, job: JobFixture): Promise<string> {
  const row = await insertScoped<{ id: string }>(h.pool, h.shop, 'karigar_jobs', {
    code: job.code,
    title: job.title ?? null,
    karigar_id: job.karigarId,
    status: job.status ?? (job.settledAt ? 'handed_over' : 'on_bench'),
    due_date: job.dueDate ? new Date(job.dueDate) : null,
    confirmed_date: job.confirmedDate ? new Date(job.confirmedDate) : null,
    settled_at: job.settledAt ? new Date(job.settledAt) : null,
    target_gross_units: job.issuedUnits,
    target_net_units: job.issuedUnits,
    tolerance_units: 1,
    gold_issued_units: job.issuedUnits,
  });
  return row.id;
}
export interface ParcelFixture {
  code: string;
  karigarId: string;
  jobId?: string | null;
  status?: 'open' | 'stopped' | 'released';
  arrivedAt?: string | null;
  releasedAt?: string | null;
  gapUnits?: number | null;
  lossUnits?: number | null;
}
export async function addParcel(h: UsersHarness, parcel: ParcelFixture): Promise<string> {
  const row = await insertScoped<{ id: string }>(h.pool, h.shop, 'parcels', {
    code: parcel.code,
    karigar_id: parcel.karigarId,
    job_id: parcel.jobId ?? null,
    status: parcel.status ?? 'released',
    arrived_at: parcel.arrivedAt ? new Date(parcel.arrivedAt) : null,
    released_at: parcel.releasedAt ? new Date(parcel.releasedAt) : null,
    gap_net_units: parcel.gapUnits ?? null,
    loss_units: parcel.lossUnits ?? null,
  });
  return row.id;
}
/** A finished job with one released parcel carrying `lossUnits`. */
export async function addFinishedJob(
  h: UsersHarness,
  job: Omit<JobFixture, 'settledAt'> & { settledAt: string; lossUnits: number; arrivedAt?: string },
): Promise<string> {
  const jobId = await addJob(h, job);
  await addParcel(h, {
    code: `P-${job.code}`,
    karigarId: job.karigarId,
    jobId,
    arrivedAt: job.arrivedAt ?? job.settledAt,
    releasedAt: job.settledAt,
    lossUnits: job.lossUnits,
  });
  return jobId;
}
/** Every key of a JSON value, at any depth. */
export function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]);
  }
  return [];
}
/** Keys no karigar read may carry: a rating or any money figure. */
export const FORBIDDEN_KEY = /rating|price|rate|amount|inr|rupee|money|cost|language/i;
