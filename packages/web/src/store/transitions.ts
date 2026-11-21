/**
 * Pure state transitions. Each takes the state and an argument object and returns new state
 * (or `[state, newId]` when it creates something). Business rules live here so a plain script
 * can assert them. Nothing here imports React, assets or the seed.
 *
 * Every argument object carries `by` (who is acting) and `at` (demo-clock time).
 * A broken rule throws a DomainError with a message that is fit to show a person.
 */
import { checkToken, makeToken } from '@goldsmith/shared';
import { assertCanMarkLost, DomainError, isFullyRouted } from '@goldsmith/shared';
import { isMonthDayToday } from '@goldsmith/shared';
import { evaluateParcel } from '@goldsmith/shared';
import { fmtG, netOf, round4, toU, fromU } from '@goldsmith/shared';
import type { OperationArgs } from '@goldsmith/shared';
import type {
  Actor,
  AppState,
  AuditEntry,
  AuditKind,
  Broadcast,
  Customer,
  CustomerGroup,
  EditableField,
  Karigar,
  KarigarJob,
  Lead,
  LeadItem,
  LeadSource,
  ManifestRow,
  OrderCopy,
  Parcel,
  ParcelWeighing,
  Piece,
  PieceEdit,
  PieceStatus,
  Problem,
  ProblemTarget,
  Scale,
  ScrapRequest,
  Settings,
  StaffMember,
  StockOutRecord,
  Verdict,
} from '@goldsmith/shared';

export { DomainError };

export interface Ctx {
  by: Actor;
  at: number;
}
export type Made = readonly [AppState, string];

// ---------- helpers ----------
function nextId(s: AppState, prefix: string, pad = 3): [AppState, string] {
  const n = s.seq + 1;
  return [{ ...s, seq: n }, `${prefix}-${String(n).padStart(pad, '0')}`];
}

function requireOwner(by: Actor, what: string): void {
  if (by.role !== 'owner') throw new DomainError(`Only the owner can ${what}.`);
}

function need<T>(item: T | undefined, what: string): T {
  if (!item) throw new DomainError(`${what} was not found.`);
  return item;
}

const replace = <T extends { id: string }>(list: T[], id: string, patch: Partial<T> | ((t: T) => T)): T[] =>
  list.map((t) => (t.id === id ? (typeof patch === 'function' ? patch(t) : { ...t, ...patch }) : t));

function audit(s: AppState, e: { at: number; by: Actor; kind: AuditKind; summary: string; detail?: string; ref: string }): AppState {
  const [s2, id] = nextId(s, 'AU');
  const entry: AuditEntry = {
    id,
    at: e.at,
    actorName: e.by.name,
    actorRole: e.by.role,
    kind: e.kind,
    summary: e.summary,
    detail: e.detail ?? '',
    ref: e.ref,
  };
  return { ...s2, audit: [entry, ...s2.audit] };
}

const pieceOf = (s: AppState, id: string): Piece => need(s.pieces.find((p) => p.id === id), `Piece ${id}`);
const parcelOf = (s: AppState, id: string): Parcel => need(s.parcels.find((p) => p.id === id), `Parcel ${id}`);
const jobOf = (s: AppState, id: string): KarigarJob => need(s.jobs.find((j) => j.id === id), `Job ${id}`);
const leadOf = (s: AppState, id: string): Lead => need(s.leads.find((l) => l.id === id), `Lead ${id}`);

const openProblemOn = (s: AppState, kind: ProblemTarget['kind'], id: string): boolean =>
  s.problems.some((p) => p.status === 'open' && p.target.kind === kind && p.target.id === id);

// ---------- leads ----------
export interface CreateLeadArgs extends Ctx {
  customerName: string;
  phone: string;
  items: { name: string; style?: string; qty: number; approxWeightG?: number | null }[];
  neededBy?: number | null;
  note?: string;
  source?: LeadSource;
}

/** A hand-typed lead (walk-in or phone call). There is no message to read, so it enters at Opened. */
export function createLead(s: AppState, a: CreateLeadArgs): Made {
  if (!a.customerName.trim()) throw new DomainError('Add the customer name.');
  if (a.items.length === 0) throw new DomainError('Add at least one item.');
  let st = s;
  let leadId: string;
  [st, leadId] = nextId(st, 'LD-2026', 3);
  const items: LeadItem[] = [];
  for (const it of a.items) {
    let itemId: string;
    [st, itemId] = nextId(st, 'LI');
    items.push({ id: itemId, name: it.name, style: it.style ?? '', qty: it.qty, approxWeightG: it.approxWeightG ?? null, route: null });
  }
  const summary = items.map((i) => `${i.qty} × ${i.name}`).join(', ');
  const lead: Lead = {
    id: leadId,
    title: `${a.customerName.trim()} · ${summary}`,
    source: a.source ?? 'counter',
    state: 'opened',
    confidence: 'clean',
    arrivedAt: a.at,
    customerName: a.customerName.trim(),
    phone: a.phone.trim(),
    message: '',
    fields: [],
    items,
    neededBy: a.neededBy ?? null,
    takenBy: a.by.name,
    note: a.note ?? '',
  };
  return [{ ...st, leads: [lead, ...st.leads] }, leadId];
}

export interface ConfirmLeadArgs extends Ctx {
  leadId: string;
  patch?: { customerName?: string; phone?: string; neededBy?: number | null; items?: LeadItem[] };
}

/** Confirm (or fix) a read-in lead. Needs a glance -> Opened. An unreadable message stays flagged until fixed. */
export function confirmLead(s: AppState, a: ConfirmLeadArgs): AppState {
  const lead = leadOf(s, a.leadId);
  if (lead.state !== 'needs_glance') throw new DomainError('This lead has already been opened.');
  const p = a.patch ?? {};
  const next: Lead = {
    ...lead,
    state: 'opened',
    confidence: 'clean',
    customerName: p.customerName ?? lead.customerName,
    phone: p.phone ?? lead.phone,
    neededBy: p.neededBy === undefined ? lead.neededBy : p.neededBy,
    items: p.items ?? lead.items,
    fields: lead.fields.map((f) => ({ ...f, flagged: false })),
    takenBy: a.by.name,
  };
  return { ...s, leads: replace(s.leads, lead.id, next) };
}

export function startWorkingLead(s: AppState, a: Ctx & { leadId: string }): AppState {
  const lead = leadOf(s, a.leadId);
  if (lead.state === 'needs_glance') throw new DomainError('Check and keep this lead first.');
  if (lead.state !== 'opened') return s;
  return { ...s, leads: replace(s.leads, lead.id, { state: 'being_worked', takenBy: lead.takenBy ?? a.by.name }) };
}

export function markLeadLost(s: AppState, a: Ctx & OperationArgs<'markLeadLost'>): AppState {
  const lead = leadOf(s, a.leadId);
  assertCanMarkLost(lead.state);
  // Pieces held for this lead go back to the showcase.
  const pieces = s.pieces.map((p) => (p.heldForLeadId === lead.id ? { ...p, heldForLeadId: null } : p));
  return { ...s, pieces, leads: replace(s.leads, lead.id, { state: 'lost', note: a.reason ? a.reason : lead.note }) };
}

/** Recompute converted / being worked after a line is routed or a hold is released. */
function settleLeadState(lead: Lead): Lead {
  if (lead.state === 'lost') return lead;
  if (isFullyRouted(lead)) return { ...lead, state: 'converted' };
  if (lead.state === 'converted') return { ...lead, state: 'being_worked' };
  if (lead.state === 'opened' && lead.items.some((i) => i.route)) return { ...lead, state: 'being_worked' };
  return lead;
}

export function routeLeadItemToStock(s: AppState, a: Ctx & { leadId: string; itemId: string; pieceId: string }): AppState {
  const lead = leadOf(s, a.leadId);
  if (lead.state === 'needs_glance') throw new DomainError('Check and keep this lead before converting it.');
  const item = need(lead.items.find((i) => i.id === a.itemId), 'That line');
  if (item.route) throw new DomainError('That line has already been routed.');
  const piece = pieceOf(s, a.pieceId);
  if (piece.status !== 'in_stock') throw new DomainError(`${piece.id} is not in stock.`);
  if (piece.heldForLeadId) throw new DomainError(`${piece.id} is already held for another customer.`);
  const nextLead = settleLeadState({
    ...lead,
    items: lead.items.map((i) => (i.id === a.itemId ? { ...i, route: { kind: 'stock' as const, pieceId: piece.id } } : i)),
  });
  return {
    ...s,
    leads: replace(s.leads, lead.id, nextLead),
    pieces: replace(s.pieces, piece.id, { heldForLeadId: lead.id }),
  };
}

/** The customer walked away: release the hold and put the line back to unrouted. */
export function releaseHold(s: AppState, a: Ctx & { leadId: string; itemId: string }): AppState {
  const lead = leadOf(s, a.leadId);
  const item = need(lead.items.find((i) => i.id === a.itemId), 'That line');
  if (!item.route || item.route.kind !== 'stock') throw new DomainError('That line is not held from stock.');
  const pieceId = item.route.pieceId;
  const nextLead = settleLeadState({
    ...lead,
    items: lead.items.map((i) => (i.id === a.itemId ? { ...i, route: null } : i)),
  });
  return {
    ...s,
    leads: replace(s.leads, lead.id, nextLead),
    pieces: replace(s.pieces, pieceId, { heldForLeadId: null }),
  };
}

export interface CreateOrderCopyArgs extends Ctx {
  leadId?: string | null;
  leadItemId?: string | null;
  title: string;
  style?: string;
  refImages: string[];
  brief: string;
  qty: number;
  purity: string;
  targetGrossG: number;
  targetNetG: number;
  toleranceG: number;
  karigarId: string;
  dueDate: number;
  goldIssuedG: number;
}

/** Send the order copy: it becomes a karigar job (Sent), the gold is drawn from the pool, the lead line is routed. */
export function createOrderCopyAndJob(s: AppState, a: CreateOrderCopyArgs): Made {
  if (!s.karigars.some((k) => k.id === a.karigarId)) throw new DomainError('Pick who makes it.');
  if (!(a.targetGrossG > 0)) throw new DomainError('Enter the weight the finished piece should have.');
  if (a.goldIssuedG < 0) throw new DomainError('Gold issued cannot be negative.');
  if (toU(a.goldIssuedG) > toU(s.pool.balanceG)) {
    throw new DomainError('The metal pool does not have that much gold to issue.');
  }
  let st = s;
  let jobId: string;
  let ocId: string;
  [st, jobId] = nextId(st, 'MO-2026', 3);
  [st, ocId] = nextId(st, 'OC-2026', 3);
  const job: KarigarJob = {
    id: jobId,
    orderCopyId: ocId,
    title: a.title,
    style: a.style ?? '',
    qty: a.qty,
    purity: a.purity,
    karigarId: a.karigarId,
    status: 'sent',
    sentAt: a.at,
    dueDate: a.dueDate,
    confirmedDate: null,
    targetGrossG: a.targetGrossG,
    targetNetG: a.targetNetG,
    toleranceG: a.toleranceG,
    goldIssuedG: a.goldIssuedG,
    note: a.brief,
    refImage: a.refImages[0] ?? null,
    stopped: false,
    parcelId: null,
    benchNote: '',
    settledAt: null,
  };
  const copy: OrderCopy = {
    id: ocId,
    leadId: a.leadId ?? null,
    leadItemId: a.leadItemId ?? null,
    jobId,
    refImages: a.refImages,
    brief: a.brief,
    qty: a.qty,
    purity: a.purity,
    targetGrossG: a.targetGrossG,
    targetNetG: a.targetNetG,
    toleranceG: a.toleranceG,
    karigarId: a.karigarId,
    dueDate: a.dueDate,
    goldIssuedG: a.goldIssuedG,
    createdBy: a.by.name,
    createdAt: a.at,
  };
  let poolEntryId: string;
  [st, poolEntryId] = nextId(st, 'PL');
  st = {
    ...st,
    jobs: [job, ...st.jobs],
    orderCopies: [copy, ...st.orderCopies],
    pool: {
      balanceG: round4(fromU(toU(st.pool.balanceG) - toU(a.goldIssuedG))),
      ledger: [
        { id: poolEntryId, at: a.at, kind: 'issued', deltaG: -a.goldIssuedG, note: `Issued for ${a.title}`, ref: jobId },
        ...st.pool.ledger,
      ],
    },
  };
  if (a.leadId && a.leadItemId) {
    const lead = leadOf(st, a.leadId);
    const item = need(lead.items.find((i) => i.id === a.leadItemId), 'That line');
    if (item.route) throw new DomainError('That line has already been routed.');
    const nextLead = settleLeadState({
      ...lead,
      items: lead.items.map((i) => (i.id === a.leadItemId ? { ...i, route: { kind: 'make' as const, jobId } } : i)),
    });
    st = { ...st, leads: replace(st.leads, lead.id, nextLead) };
  }
  return [st, jobId];
}

// ---------- karigar jobs ----------
const stoppedGuard = (j: KarigarJob): void => {
  if (j.stopped) throw new DomainError('This job is stopped. Only the owner can start it again.');
};

export function acceptJob(s: AppState, a: Ctx & { jobId: string; confirmedDate: number }): AppState {
  const job = jobOf(s, a.jobId);
  if (job.status !== 'sent') throw new DomainError('This job has already been accepted.');
  return { ...s, jobs: replace(s.jobs, job.id, { status: 'accepted', confirmedDate: a.confirmedDate }) };
}

export function startJob(s: AppState, a: Ctx & { jobId: string; benchNote?: string }): AppState {
  const job = jobOf(s, a.jobId);
  stoppedGuard(job);
  if (job.status !== 'accepted') throw new DomainError('Accept the job first.');
  return { ...s, jobs: replace(s.jobs, job.id, { status: 'on_bench', benchNote: a.benchNote ?? job.benchNote }) };
}

export function markJobReady(s: AppState, a: Ctx & { jobId: string; benchNote?: string }): AppState {
  const job = jobOf(s, a.jobId);
  stoppedGuard(job);
  if (job.status !== 'on_bench') throw new DomainError('Mark it as being worked on first.');
  return { ...s, jobs: replace(s.jobs, job.id, { status: 'ready', benchNote: a.benchNote ?? job.benchNote }) };
}

/**
 * Hand-over creates the arriving parcel. If the job's earlier parcel was sent back by the owner,
 * the same parcel goes back to the weigh step with its tags cleared.
 */
export function handOver(s: AppState, a: Ctx & { jobId: string }): Made {
  const job = jobOf(s, a.jobId);
  stoppedGuard(job);
  if (job.status !== 'ready' && !(job.status === 'on_bench' && job.parcelId)) {
    throw new DomainError('Mark the job ready before handing it over.');
  }
  const existing = job.parcelId ? s.parcels.find((p) => p.id === job.parcelId) : undefined;
  if (existing && existing.resolution === 'sent_back') {
    const fresh: Parcel = {
      ...existing,
      arrivedAt: a.at,
      weighings: [],
      stage: 1,
      status: 'open',
      resolution: null,
      recheckPieceId: null,
      qcDone: [],
      verdict: 'incomplete',
      gapNetG: null,
      stoppedAt: null,
    };
    return [
      {
        ...s,
        parcels: replace(s.parcels, existing.id, fresh),
        pieces: s.pieces.filter((p) => p.parcelId !== existing.id),
        jobs: replace(s.jobs, job.id, { status: 'handed_over' }),
      },
      existing.id,
    ];
  }
  let st = s;
  let parcelId: string;
  [st, parcelId] = nextId(st, 'BATCH-2026', 3);
  const parcel: Parcel = {
    id: parcelId,
    karigarId: job.karigarId,
    jobId: job.id,
    poRef: null,
    arrivedAt: a.at,
    weighings: [],
    manifest: [],
    stage: 1,
    status: 'open',
    resolution: null,
    recheckPieceId: null,
    qcDone: [],
    verdict: 'incomplete',
    gapNetG: null,
    lossG: null,
    lossReason: null,
    releasedAt: null,
    releasedBy: null,
    stoppedAt: null,
  };
  return [
    { ...st, parcels: [parcel, ...st.parcels], jobs: replace(st.jobs, job.id, { status: 'handed_over', parcelId }) },
    parcelId,
  ];
}

// ---------- parcels ----------
export interface RecordArrivalArgs extends Ctx {
  /** An arriving parcel created by a hand-over; omit to receive a parcel with no job. */
  parcelId?: string;
  karigarId?: string;
  poRef?: string | null;
  weighings: { label: string; scaleId: string; grossG: number; stoneG: number }[];
  manifest: { kind: string; count: number }[];
}

export function recordParcelArrival(s: AppState, a: RecordArrivalArgs): Made {
  if (a.weighings.length === 0) throw new DomainError('Weigh the parcel first.');
  for (const w of a.weighings) {
    if (!s.scales.some((x) => x.id === w.scaleId)) throw new DomainError('Pick the scale this was weighed on.');
    if (!(w.grossG > 0)) throw new DomainError('Enter what the parcel weighs on the scale.');
    if (w.stoneG < 0 || toU(w.stoneG) > toU(w.grossG)) throw new DomainError('Stones cannot weigh more than the whole parcel.');
  }
  const manifestRows = a.manifest.filter((m) => m.count > 0 && m.kind.trim());
  if (manifestRows.length === 0) throw new DomainError('List what is inside the parcel.');
  let st = s;
  const manifest: ManifestRow[] = [];
  for (const m of manifestRows) {
    let id: string;
    [st, id] = nextId(st, 'MF');
    manifest.push({ id, kind: m.kind.trim(), count: m.count });
  }
  const weighings: ParcelWeighing[] = [];
  for (const w of a.weighings) {
    let id: string;
    [st, id] = nextId(st, 'WG');
    weighings.push({ id, label: w.label, scaleId: w.scaleId, grossG: w.grossG, stoneG: w.stoneG });
  }
  if (a.parcelId) {
    const parcel = parcelOf(st, a.parcelId);
    if (parcel.status !== 'open') throw new DomainError('This parcel is closed.');
    if (parcel.weighings.length > 0) throw new DomainError('This parcel has already been weighed.');
    return [
      {
        ...st,
        lastScaleId: weighings[0].scaleId,
        parcels: replace(st.parcels, parcel.id, { weighings, manifest, stage: 2, poRef: a.poRef ?? parcel.poRef, arrivedAt: parcel.arrivedAt }),
      },
      parcel.id,
    ];
  }
  if (!a.karigarId || !st.karigars.some((k) => k.id === a.karigarId)) throw new DomainError('Say which karigar it came from.');
  let parcelId: string;
  [st, parcelId] = nextId(st, 'BATCH-2026', 3);
  const parcel: Parcel = {
    id: parcelId,
    karigarId: a.karigarId,
    jobId: null,
    poRef: a.poRef ?? null,
    arrivedAt: a.at,
    weighings,
    manifest,
    stage: 2,
    status: 'open',
    resolution: null,
    recheckPieceId: null,
    qcDone: [],
    verdict: 'incomplete',
    gapNetG: null,
    lossG: null,
    lossReason: null,
    releasedAt: null,
    releasedBy: null,
    stoppedAt: null,
  };
  return [{ ...st, lastScaleId: weighings[0].scaleId, parcels: [parcel, ...st.parcels] }, parcelId];
}

/**
 * Bring the parcel's status, stage, verdict snapshot and its pieces' states into line with the data.
 * A raised problem or an owner's send-back keeps it stopped; otherwise a full set of tags that does not
 * add up stops it, and data that closes the gap lets staff release it.
 */
function syncParcel(s: AppState, parcelId: string): AppState {
  const parcel = parcelOf(s, parcelId);
  if (parcel.status === 'released') return s;
  const ev = evaluateParcel(parcel, s.pieces, s.scales);
  const problem = openProblemOn(s, 'parcel', parcel.id);
  const mismatch = ev.verdict === 'mismatch';
  const stopped = problem || parcel.resolution === 'sent_back' || mismatch;
  const stage: Parcel['stage'] = parcel.weighings.length === 0 ? 1 : ev.tagged < ev.expected ? 2 : 3;
  const next: Parcel = {
    ...parcel,
    stage,
    verdict: ev.verdict,
    gapNetG: ev.verdict === 'incomplete' ? null : fromU(ev.gap.netU),
    status: stopped ? 'stopped' : 'open',
    stoppedAt: stopped ? parcel.stoppedAt : null,
    resolution: stopped || parcel.resolution !== 'rechecking' ? parcel.resolution : null,
    recheckPieceId: stopped ? parcel.recheckPieceId : null,
  };
  const wanted: PieceStatus = stopped ? 'with_owner' : 'draft';
  const pieces = s.pieces.map((p) => {
    if (p.parcelId !== parcel.id) return p;
    if (p.status !== 'draft' && p.status !== 'with_owner') return p;
    if (stopped && parcel.recheckPieceId === p.id) return { ...p, status: 'draft' as const };
    return p.status === wanted ? p : { ...p, status: wanted };
  });
  return { ...s, parcels: replace(s.parcels, parcel.id, next), pieces };
}

/** Stamp the time a parcel first stopped (syncParcel cannot know the clock). */
function stampStop(s: AppState, parcelId: string, at: number): AppState {
  const p = parcelOf(s, parcelId);
  if (p.status === 'stopped' && p.stoppedAt === null) return { ...s, parcels: replace(s.parcels, parcelId, { stoppedAt: at }) };
  return s;
}

export interface SaveTagArgs extends Ctx {
  parcelId: string;
  tag: {
    id: string;
    kind: string;
    name: string;
    huid: string;
    purity: string;
    size?: string;
    collection?: string;
    style?: string;
    stoneCount?: number;
    photos?: string[];
    note?: string;
    grossG: number;
    stoneG: number;
    scaleId: string;
  };
}

export function saveTag(s: AppState, a: SaveTagArgs): AppState {
  const parcel = parcelOf(s, a.parcelId);
  const t = a.tag;
  const existing = s.pieces.find((p) => p.id === t.id);
  const isRecheck = parcel.status === 'stopped' && parcel.resolution === 'rechecking' && parcel.recheckPieceId === t.id;
  if (parcel.status === 'released') throw new DomainError('This parcel has been released.');
  if (parcel.status === 'stopped' && !isRecheck) throw new DomainError('This parcel is stopped. Only the owner can start it again.');
  if (parcel.weighings.length === 0) throw new DomainError('Weigh the parcel before tagging.');
  if (!t.id.trim()) throw new DomainError('Give the piece a tag number.');
  if (existing && existing.parcelId !== parcel.id) throw new DomainError(`${t.id} is already used on another piece.`);
  if (!t.name.trim()) throw new DomainError('Name the piece.');
  if (!(t.grossG > 0)) throw new DomainError('Enter what the piece weighs on the scale.');
  if (t.stoneG < 0 || toU(t.stoneG) > toU(t.grossG)) throw new DomainError('Stones cannot weigh more than the piece.');
  if (!s.scales.some((x) => x.id === t.scaleId)) throw new DomainError('Pick the scale this piece was weighed on.');
  const row = parcel.manifest.find((m) => m.kind === t.kind);
  if (!row) throw new DomainError(`${t.kind} is not on this parcel's list.`);
  const used = s.pieces.filter((p) => p.parcelId === parcel.id && p.kind === t.kind && p.id !== t.id).length;
  if (used >= row.count) throw new DomainError(`All ${row.count} ${t.kind} on the list are already tagged.`);
  const piece: Piece = {
    id: t.id.trim(),
    name: t.name.trim(),
    kind: t.kind,
    collection: t.collection ?? existing?.collection ?? '',
    style: t.style ?? existing?.style ?? '',
    purity: t.purity,
    huid: t.huid.trim(),
    grossG: t.grossG,
    stoneG: t.stoneG,
    stoneCount: t.stoneCount ?? existing?.stoneCount ?? 0,
    size: t.size ?? existing?.size ?? '',
    scaleId: t.scaleId,
    status: 'draft',
    prevStatus: null,
    parcelId: parcel.id,
    jobId: parcel.jobId,
    madeById: parcel.karigarId,
    inStockAt: null,
    taggedBy: a.by.name,
    taggedAt: a.at,
    photos: t.photos ?? existing?.photos ?? [],
    note: t.note ?? existing?.note ?? '',
    heldForLeadId: null,
    valueINR: null,
    soldAt: null,
    stockOutId: null,
  };
  const pieces = existing ? s.pieces.map((p) => (p.id === piece.id ? piece : p)) : [...s.pieces, piece];
  // a re-tagged piece needs checking again
  const qcDone = parcel.qcDone.filter((id) => id !== piece.id);
  // the re-check the owner asked for is done; if the gap is still there the parcel goes back to the owner
  const reopened: Partial<Parcel> = isRecheck ? { qcDone, resolution: null, recheckPieceId: null } : { qcDone };
  let st: AppState = {
    ...s,
    lastScaleId: t.scaleId,
    pieces,
    parcels: replace(s.parcels, parcel.id, reopened),
  };
  st = syncParcel(st, parcel.id);
  return stampStop(st, parcel.id, a.at);
}

export function qcTick(s: AppState, a: Ctx & { parcelId: string; pieceId: string }): AppState {
  const parcel = parcelOf(s, a.parcelId);
  const piece = pieceOf(s, a.pieceId);
  if (piece.parcelId !== parcel.id) throw new DomainError(`${piece.id} is not in this parcel.`);
  if (parcel.qcDone.includes(piece.id)) return s;
  return { ...s, parcels: replace(s.parcels, parcel.id, { qcDone: [...parcel.qcDone, piece.id] }) };
}

/** Staff release a parcel that matches (exactly, or within the scales' last digit). */
export function releaseParcel(s: AppState, a: Ctx & { parcelId: string }): AppState {
  const parcel = parcelOf(s, a.parcelId);
  if (parcel.status === 'released') throw new DomainError('This parcel has already been released.');
  if (parcel.status === 'stopped') throw new DomainError('This parcel is stopped. Only the owner can start it again.');
  const ev = evaluateParcel(parcel, s.pieces, s.scales);
  if (ev.verdict === 'incomplete') throw new DomainError('Tag every item on the list first.');
  if (ev.verdict === 'mismatch') throw new DomainError('The weights do not agree. Only the owner can clear this.');
  const mine = s.pieces.filter((p) => p.parcelId === parcel.id);
  if (!mine.every((p) => parcel.qcDone.includes(p.id))) throw new DomainError('Check every piece before releasing the parcel.');
  return finishRelease(s, parcel.id, a, ev.verdict, fromU(ev.gap.netU));
}

function finishRelease(s: AppState, parcelId: string, a: Ctx, verdict: Verdict, gapNetG: number): AppState {
  const parcel = parcelOf(s, parcelId);
  let st: AppState = {
    ...s,
    pieces: s.pieces.map((p) =>
      p.parcelId === parcelId && (p.status === 'draft' || p.status === 'with_owner')
        ? { ...p, status: 'in_stock' as const, inStockAt: a.at }
        : p,
    ),
    parcels: replace(s.parcels, parcelId, {
      status: 'released',
      verdict,
      gapNetG,
      stage: 3,
      releasedAt: a.at,
      releasedBy: a.by.name,
    }),
    jobs: parcel.jobId ? replace(s.jobs, parcel.jobId, { settledAt: a.at }) : s.jobs,
    karigars: replace(s.karigars, parcel.karigarId, (k: Karigar) => ({
      ...k,
      gapsMg: [...k.gapsMg, Math.round(Math.abs(gapNetG) * 1000)].slice(-6),
    })),
  };
  if (verdict === 'last_digit') {
    st = audit(st, {
      at: a.at,
      by: a.by,
      kind: 'parcel_last_digit',
      summary: `${parcelId} released within the scales' last digit`,
      detail: `Net gold gap ${Math.round(Math.abs(gapNetG) * 1000 * 100) / 100} mg`,
      ref: parcelId,
    });
  }
  return st;
}

export function ownerSendBack(s: AppState, a: Ctx & { parcelId: string }): AppState {
  requireOwner(a.by, 'send a parcel back');
  const parcel = parcelOf(s, a.parcelId);
  if (parcel.status !== 'stopped') throw new DomainError('Only a stopped parcel can be sent back.');
  let st: AppState = {
    ...s,
    parcels: replace(s.parcels, parcel.id, { resolution: 'sent_back', recheckPieceId: null }),
    jobs: parcel.jobId ? replace(s.jobs, parcel.jobId, { status: 'on_bench' }) : s.jobs,
  };
  st = syncParcel(st, parcel.id);
  return audit(st, { at: a.at, by: a.by, kind: 'parcel_sent_back', summary: `${parcel.id} sent back to the karigar`, ref: parcel.id });
}

export function ownerRecheckTag(s: AppState, a: Ctx & { parcelId: string; pieceId: string }): AppState {
  requireOwner(a.by, 'send a tag back for re-checking');
  const parcel = parcelOf(s, a.parcelId);
  if (parcel.status !== 'stopped') throw new DomainError('Only a stopped parcel can have a tag re-checked.');
  if (openProblemOn(s, 'parcel', parcel.id)) throw new DomainError('Clear the raised problem first.');
  const piece = pieceOf(s, a.pieceId);
  if (piece.parcelId !== parcel.id) throw new DomainError(`${piece.id} is not in this parcel.`);
  let st: AppState = {
    ...s,
    parcels: replace(s.parcels, parcel.id, { resolution: 'rechecking', recheckPieceId: piece.id }),
  };
  st = syncParcel(st, parcel.id);
  return st;
}

export function ownerAcceptLoss(s: AppState, a: Ctx & { parcelId: string; reason: string }): AppState {
  requireOwner(a.by, 'accept a loss');
  const parcel = parcelOf(s, a.parcelId);
  if (parcel.status !== 'stopped') throw new DomainError('Only a stopped parcel needs this.');
  if (openProblemOn(s, 'parcel', parcel.id)) throw new DomainError('Clear the raised problem first.');
  if (a.reason.trim().length < 3) throw new DomainError('Say why this loss is acceptable. It is kept against your name.');
  const ev = evaluateParcel(parcel, s.pieces, s.scales);
  if (ev.verdict !== 'mismatch') throw new DomainError('This parcel does not have a loss to accept.');
  const gapNetG = fromU(ev.gap.netU);
  let st = finishRelease(s, parcel.id, a, 'mismatch', gapNetG);
  st = {
    ...st,
    parcels: replace(st.parcels, parcel.id, { resolution: 'loss_accepted', lossG: Math.abs(gapNetG), lossReason: a.reason.trim() }),
  };
  return audit(st, {
    at: a.at,
    by: a.by,
    kind: 'loss_accepted',
    summary: `${parcel.id}: loss of ${Math.round(Math.abs(gapNetG) * 1000)} mg accepted and released`,
    detail: a.reason.trim(),
    ref: parcel.id,
  });
}

// ---------- raised problems ----------
export function raiseProblem(s: AppState, a: Ctx & { target: ProblemTarget; text: string }): Made {
  if (a.text.trim().length < 3) throw new DomainError('Say what is wrong.');
  let st = s;
  let id: string;
  [st, id] = nextId(st, 'PR');
  const problem: Problem = {
    id,
    target: a.target,
    text: a.text.trim(),
    raisedBy: a.by.name,
    raisedByRole: a.by.role,
    raisedAt: a.at,
    status: 'open',
    clearedBy: null,
    clearedAt: null,
  };
  st = { ...st, problems: [problem, ...st.problems] };
  if (a.target.kind === 'parcel') {
    parcelOf(st, a.target.id);
    st = syncParcel(st, a.target.id);
    st = stampStop(st, a.target.id, a.at);
  } else if (a.target.kind === 'job') {
    jobOf(st, a.target.id);
    st = { ...st, jobs: replace(st.jobs, a.target.id, { stopped: true }) };
  } else {
    const piece = pieceOf(st, a.target.id);
    if (piece.status === 'billed' || piece.status === 'scrapped') throw new DomainError('A closed piece cannot be stopped.');
    if (piece.status !== 'stopped') {
      st = { ...st, pieces: replace(st.pieces, piece.id, { status: 'stopped', prevStatus: piece.status }) };
    }
  }
  return [st, id];
}

/** Only the owner can start the line again. */
export function clearProblem(s: AppState, a: Ctx & { problemId: string }): AppState {
  requireOwner(a.by, 'clear a problem');
  const problem = need(s.problems.find((p) => p.id === a.problemId), 'That problem');
  if (problem.status !== 'open') return s;
  let st: AppState = {
    ...s,
    problems: replace(s.problems, problem.id, { status: 'cleared', clearedBy: a.by.name, clearedAt: a.at }),
  };
  const t = problem.target;
  if (t.kind === 'parcel') {
    st = syncParcel(st, t.id);
  } else if (t.kind === 'job') {
    if (!openProblemOn(st, 'job', t.id)) st = { ...st, jobs: replace(st.jobs, t.id, { stopped: false }) };
  } else if (!openProblemOn(st, 'piece', t.id)) {
    const piece = pieceOf(st, t.id);
    if (piece.status === 'stopped') {
      st = { ...st, pieces: replace(st.pieces, t.id, { status: piece.prevStatus ?? 'in_stock', prevStatus: null }) };
    }
  }
  return audit(st, {
    at: a.at,
    by: a.by,
    kind: 'problem_cleared',
    summary: `Problem on ${t.id} cleared`,
    detail: `Raised by ${problem.raisedBy}: ${problem.text}`,
    ref: t.id,
  });
}

// ---------- edits to pieces in house ----------
const fieldLabel: Record<EditableField, string> = {
  grossG: 'weight',
  stoneG: 'stone weight',
  stoneCount: 'stone count',
  purity: 'purity',
  huid: 'HUID',
  name: 'name',
};

export function proposeEdit(
  s: AppState,
  a: Ctx & { pieceId: string; field: EditableField; to: string | number; reason: string },
): Made {
  const piece = pieceOf(s, a.pieceId);
  if (piece.status !== 'in_stock') throw new DomainError(`${piece.id} is not in stock, so it cannot be edited.`);
  if (a.reason.trim().length < 3) throw new DomainError('Say why. The owner will read this.');
  const from = piece[a.field];
  if (String(from) === String(a.to)) throw new DomainError(`That is already the ${fieldLabel[a.field]}.`);
  let st = s;
  let id: string;
  [st, id] = nextId(st, 'ED');
  const edit: PieceEdit = {
    id,
    pieceId: piece.id,
    field: a.field,
    from,
    to: a.to,
    reason: a.reason.trim(),
    proposedBy: a.by.name,
    proposedAt: a.at,
    status: 'proposed',
    token: null,
    tokenIssuedAt: null,
    decidedAt: null,
  };
  return [{ ...st, edits: [edit, ...st.edits] }, id];
}

/** Owner agrees: a token goes to the owner's WhatsApp. */
export function ownerAgreeEdit(s: AppState, a: Ctx & { editId: string }): AppState {
  requireOwner(a.by, 'agree to an edit');
  const edit = need(s.edits.find((e) => e.id === a.editId), 'That edit');
  if (edit.status !== 'proposed' && edit.status !== 'token_sent') throw new DomainError('This edit is already decided.');
  const st = { ...s, seq: s.seq + 1 };
  return { ...st, edits: replace(st.edits, edit.id, { status: 'token_sent', token: makeToken(st.seq), tokenIssuedAt: a.at }) };
}

/** Weights in the audit trail always show four decimals; other fields stay as typed. */
function editValue(field: EditableField, v: string | number): string {
  return (field === 'grossG' || field === 'stoneG') && !Number.isNaN(Number(v)) ? fmtG(Number(v)) : String(v);
}

export function applyEdit(s: AppState, a: Ctx & { editId: string; token: string }): AppState {
  requireOwner(a.by, 'apply an edit');
  const edit = need(s.edits.find((e) => e.id === a.editId), 'That edit');
  if (edit.status === 'applied' || edit.status === 'refused' || edit.status === 'void') {
    throw new DomainError('This edit is already decided.');
  }
  if (s.settings.requireEditToken) {
    if (edit.status !== 'token_sent') throw new DomainError('Ask for a token first.');
    const check = checkToken(edit, a.token, a.at);
    if (check === 'expired') throw new DomainError('That token has expired. Ask for a new one.');
    if (check !== 'ok') throw new DomainError('That token is not right. Check the code on your WhatsApp.');
  }
  const piece = pieceOf(s, edit.pieceId);
  if (piece.status === 'billed') throw new DomainError(`${piece.id} is billed. Its weights are frozen.`);
  if (piece.status !== 'in_stock') throw new DomainError(`${piece.id} is not in stock, so it cannot be edited.`);
  const value = typeof piece[edit.field] === 'number' ? Number(edit.to) : String(edit.to);
  const next: Piece = { ...piece, [edit.field]: value };
  if (toU(next.stoneG) > toU(next.grossG)) throw new DomainError('Stones cannot weigh more than the piece.');
  const before = netOf(piece);
  const after = netOf(next);
  const st: AppState = {
    ...s,
    pieces: replace(s.pieces, piece.id, next),
    edits: replace(s.edits, edit.id, { status: 'applied', decidedAt: a.at }),
  };
  return audit(st, {
    at: a.at,
    by: a.by,
    kind: 'edit_applied',
    summary: `${piece.id} ${fieldLabel[edit.field]}: ${editValue(edit.field, edit.from)} → ${editValue(edit.field, edit.to)}`,
    detail: `Asked by ${edit.proposedBy}: ${edit.reason}. Token ${edit.token ?? 'not required'}. Pure gold ${fmtG(before)} → ${fmtG(after)} g.`,
    ref: piece.id,
  });
}

export function refuseEdit(s: AppState, a: Ctx & { editId: string }): AppState {
  requireOwner(a.by, 'refuse an edit');
  const edit = need(s.edits.find((e) => e.id === a.editId), 'That edit');
  if (edit.status === 'applied' || edit.status === 'refused' || edit.status === 'void') {
    throw new DomainError('This edit is already decided.');
  }
  const st = { ...s, edits: replace(s.edits, edit.id, { status: 'refused' as const, decidedAt: a.at }) };
  return audit(st, {
    at: a.at,
    by: a.by,
    kind: 'edit_refused',
    summary: `${edit.pieceId} ${fieldLabel[edit.field]} edit refused`,
    detail: `Asked by ${edit.proposedBy}: ${edit.reason}`,
    ref: edit.pieceId,
  });
}

// ---------- stock out and scrap ----------
export function stockOut(s: AppState, a: Ctx & { pieceIds: string[]; ref: string; invoiceNo: string; sellerId?: string }): Made {
  if (a.pieceIds.length === 0) throw new DomainError('Add the pieces that are leaving.');
  if (!a.ref.trim()) throw new DomainError('Enter the reference number.');
  if (!a.invoiceNo.trim()) throw new DomainError('Enter the tax invoice number from your billing book.');
  const ids = [...new Set(a.pieceIds)];
  for (const id of ids) {
    const p = pieceOf(s, id);
    if (p.status !== 'in_stock') throw new DomainError(`${p.id} is not in stock.`);
  }
  let st = s;
  let recId: string;
  [st, recId] = nextId(st, 'SO');
  const seller = st.staff.find((m) => m.id === (a.sellerId ?? a.by.id));
  const sellerId = seller?.id ?? a.by.id;
  const record: StockOutRecord = {
    id: recId,
    pieceIds: ids,
    sellerId,
    sellerName: seller?.name ?? a.by.name,
    ref: a.ref.trim(),
    invoiceNo: a.invoiceNo.trim(),
    at: a.at,
    amountINR: null,
  };
  st = {
    ...st,
    stockOuts: [record, ...st.stockOuts],
    pieces: st.pieces.map((p) =>
      ids.includes(p.id) ? { ...p, status: 'billed' as const, soldAt: a.at, stockOutId: recId, heldForLeadId: null } : p,
    ),
    edits: st.edits.map((e) =>
      ids.includes(e.pieceId) && (e.status === 'proposed' || e.status === 'token_sent') ? { ...e, status: 'void' as const, decidedAt: a.at } : e,
    ),
    staff: st.staff.map((m) => (m.id === sellerId ? { ...m, salesCount: m.salesCount + ids.length } : m)),
  };
  return [audit(st, { at: a.at, by: a.by, kind: 'stock_out', summary: `${ids.length} piece${ids.length === 1 ? '' : 's'} out · ${record.invoiceNo}`, detail: ids.join(', '), ref: recId }), recId];
}

export function requestScrap(s: AppState, a: Ctx & { pieceId: string; reason: string }): Made {
  const piece = pieceOf(s, a.pieceId);
  if (piece.status !== 'in_stock') throw new DomainError(`${piece.id} is not in stock.`);
  if (piece.heldForLeadId) throw new DomainError(`${piece.id} is held for a customer.`);
  if (a.reason.trim().length < 3) throw new DomainError('Say why it should be scrapped.');
  let st = s;
  let id: string;
  [st, id] = nextId(st, 'SR');
  const req: ScrapRequest = {
    id,
    pieceId: piece.id,
    reason: a.reason.trim(),
    requestedBy: a.by.name,
    requestedAt: a.at,
    status: 'pending',
    decidedAt: null,
  };
  return [
    {
      ...st,
      scrapRequests: [req, ...st.scrapRequests],
      pieces: replace(st.pieces, piece.id, { status: 'with_owner', prevStatus: 'in_stock' }),
    },
    id,
  ];
}

/** Owner marks it scrap: the piece closes and its net gold goes back into the metal pool. */
export function ownerScrap(s: AppState, a: Ctx & { requestId: string }): AppState {
  requireOwner(a.by, 'mark a piece as scrap');
  const req = need(s.scrapRequests.find((r) => r.id === a.requestId), 'That request');
  if (req.status !== 'pending') throw new DomainError('This request is already decided.');
  const piece = pieceOf(s, req.pieceId);
  const net = netOf(piece);
  let st = s;
  let entryId: string;
  [st, entryId] = nextId(st, 'PL');
  st = {
    ...st,
    scrapRequests: replace(st.scrapRequests, req.id, { status: 'scrapped' as const, decidedAt: a.at }),
    pieces: replace(st.pieces, piece.id, { status: 'scrapped', prevStatus: null }),
    edits: st.edits.map((e) => (e.pieceId === piece.id && (e.status === 'proposed' || e.status === 'token_sent') ? { ...e, status: 'void' as const } : e)),
    pool: {
      balanceG: round4(fromU(toU(st.pool.balanceG) + toU(net))),
      ledger: [{ id: entryId, at: a.at, kind: 'recovered', deltaG: net, note: `Scrap ${piece.name}`, ref: piece.id }, ...st.pool.ledger],
    },
  };
  return audit(st, {
    at: a.at,
    by: a.by,
    kind: 'scrap_marked',
    summary: `${piece.id} marked as scrap · ${fmtG(net)} g back in the pool`,
    detail: `Asked by ${req.requestedBy}: ${req.reason}`,
    ref: piece.id,
  });
}

export function ownerDeclineScrap(s: AppState, a: Ctx & { requestId: string }): AppState {
  requireOwner(a.by, 'decline a scrap request');
  const req = need(s.scrapRequests.find((r) => r.id === a.requestId), 'That request');
  if (req.status !== 'pending') throw new DomainError('This request is already decided.');
  const st: AppState = {
    ...s,
    scrapRequests: replace(s.scrapRequests, req.id, { status: 'declined' as const, decidedAt: a.at }),
    pieces: replace(s.pieces, req.pieceId, { status: 'in_stock', prevStatus: null }),
  };
  return audit(st, { at: a.at, by: a.by, kind: 'scrap_declined', summary: `Scrap request for ${req.pieceId} declined`, detail: req.reason, ref: req.pieceId });
}

// ---------- onboarding ----------
export interface OnboardCustomerArgs extends Ctx {
  name: string;
  phone: string;
  city: string;
  group: CustomerGroup;
  dob?: string | null;
  anniversary?: string | null;
  optedIn: boolean;
  notes?: string;
}

export function onboardCustomer(s: AppState, a: OnboardCustomerArgs): Made {
  if (!a.name.trim()) throw new DomainError('Add the customer name.');
  if (!a.phone.trim()) throw new DomainError('Add a phone number.');
  const [st, id] = nextId(s, 'CU');
  const c: Customer = {
    id,
    name: a.name.trim(),
    phone: a.phone.trim(),
    city: a.city.trim(),
    group: a.group,
    dob: a.dob || null,
    anniversary: a.anniversary || null,
    optedIn: a.optedIn,
    history: [],
    notes: a.notes ?? '',
    budgetINR: null,
    spentINR: null,
  };
  return [{ ...st, customers: [c, ...st.customers] }, id];
}

export interface OnboardKarigarArgs extends Ctx {
  name: string;
  phone: string;
  specialty: string;
  language: string;
  wastagePct: number;
}

export function onboardKarigar(s: AppState, a: OnboardKarigarArgs): Made {
  requireOwner(a.by, 'add a karigar');
  if (!a.name.trim()) throw new DomainError('Add the karigar name.');
  if (a.wastagePct < 0.6 || a.wastagePct > 1.2) throw new DomainError('The wastage allowance is between 0.6% and 1.2%.');
  let n = s.karigars.length + 1;
  while (s.karigars.some((x) => x.id === `KG-${String(n).padStart(2, '0')}`)) n += 1;
  const st = s;
  const k: Karigar = {
    id: `KG-${String(n).padStart(2, '0')}`,
    name: a.name.trim(),
    phone: a.phone.trim(),
    specialty: a.specialty.trim(),
    language: a.language,
    wastagePct: a.wastagePct,
    gapsMg: [],
    metalLossPct: 0,
    lateDays: 0,
    rating: 0,
    finishedJobs: 0,
    openSince: new Date(a.at).toISOString().slice(0, 10),
  };
  return [{ ...st, karigars: [...st.karigars, k] }, k.id];
}

export interface OnboardStaffArgs extends Ctx {
  name: string;
  login: string;
  phone: string;
  role: StaffMember['role'];
}

export function onboardStaff(s: AppState, a: OnboardStaffArgs): Made {
  requireOwner(a.by, 'onboard staff');
  if (!a.name.trim()) throw new DomainError('Add the name.');
  if (!a.login.trim()) throw new DomainError('Add a login.');
  const [st, id] = nextId(s, 'ST');
  const m: StaffMember = { id, name: a.name.trim(), role: a.role, login: a.login.trim(), phone: a.phone.trim(), salesCount: 0 };
  return [{ ...st, staff: [...st.staff, m] }, id];
}

// ---------- marketing ----------
export function sendWishes(s: AppState, a: Ctx & { customerIds: string[]; sender: string }): AppState {
  let st = s;
  for (const cid of a.customerIds) {
    const c = st.customers.find((x) => x.id === cid);
    if (!c || !c.optedIn) continue;
    const kind = isMonthDayToday(c.dob, a.at) ? 'birthday' : isMonthDayToday(c.anniversary, a.at) ? 'anniversary' : null;
    if (!kind) continue;
    if (st.wishes.some((w) => w.customerId === cid && w.kind === kind && Math.abs(w.at - a.at) < 24 * 3600 * 1000)) continue;
    let id: string;
    [st, id] = nextId(st, 'WS');
    st = { ...st, wishes: [{ id, at: a.at, customerId: cid, kind, sender: a.sender }, ...st.wishes] };
  }
  return st;
}

export function sendBroadcast(
  s: AppState,
  a: Ctx & { audience: CustomerGroup | 'All'; message: string; pieceIds: string[] },
): Made {
  if (!a.message.trim()) throw new DomainError('Write the message.');
  for (const id of a.pieceIds) {
    if (pieceOf(s, id).status !== 'in_stock') throw new DomainError(`${id} is not in stock, so it cannot be shown.`);
  }
  const recipients = s.customers.filter((c) => c.optedIn && (a.audience === 'All' || c.group === a.audience)).map((c) => c.id);
  if (recipients.length === 0) throw new DomainError('Nobody opted-in is in that audience.');
  const [st, id] = nextId(s, 'BC');
  const b: Broadcast = {
    id,
    at: a.at,
    audience: a.audience,
    message: a.message.trim(),
    pieceIds: a.pieceIds,
    recipientIds: recipients,
    sentBy: a.by.name,
  };
  return [{ ...st, broadcasts: [b, ...st.broadcasts] }, id];
}

/** A customer replied to a broadcast: the reply becomes a lead that still needs a glance. */
export function simulateReply(s: AppState, a: Ctx & { broadcastId: string; customerId?: string; text: string }): Made {
  const b = need(s.broadcasts.find((x) => x.id === a.broadcastId), 'That broadcast');
  const cid = a.customerId ?? b.recipientIds[0];
  const c = need(s.customers.find((x) => x.id === cid), 'That customer');
  let st = s;
  let leadId: string;
  let itemId: string;
  [st, leadId] = nextId(st, 'LD-2026', 3);
  [st, itemId] = nextId(st, 'LI');
  const lead: Lead = {
    id: leadId,
    title: `${c.name} · replied to the broadcast`,
    source: 'whatsapp',
    state: 'needs_glance',
    confidence: 'unsure',
    arrivedAt: a.at,
    customerName: c.name,
    phone: c.phone,
    message: a.text,
    fields: [{ key: 'items', label: 'What they want', value: a.text, flagged: true }],
    items: [{ id: itemId, name: a.text.slice(0, 40), style: '', qty: 1, approxWeightG: null, route: null }],
    neededBy: null,
    takenBy: null,
    note: '',
  };
  return [{ ...st, leads: [lead, ...st.leads] }, leadId];
}

// ---------- scales and settings ----------
export function upsertScale(s: AppState, a: Ctx & { scale: Omit<Scale, 'id'> & { id?: string } }): Made {
  requireOwner(a.by, 'change the scales');
  if (!a.scale.name.trim()) throw new DomainError('Name the scale.');
  if (!(a.scale.readabilityG > 0)) throw new DomainError('Enter the smallest step the scale reads.');
  if (a.scale.id) {
    const id = a.scale.id;
    need(s.scales.find((x) => x.id === id), 'That scale');
    return [{ ...s, scales: replace(s.scales, id, { ...a.scale, id }) }, id];
  }
  const [st, id] = nextId(s, 'SC');
  return [{ ...st, scales: [...st.scales, { ...a.scale, id }] }, id];
}

export function rememberScale(s: AppState, a: { scaleId: string }): AppState {
  return s.lastScaleId === a.scaleId ? s : { ...s, lastScaleId: a.scaleId };
}

export function setSetting<K extends keyof Settings>(s: AppState, a: Ctx & { key: K; value: Settings[K] }): AppState {
  if (a.key === 'leadSlaHours' && !(Number(a.value) >= 1)) throw new DomainError('The lead timer must be at least 1 hour.');
  const st = { ...s, settings: { ...s.settings, [a.key]: a.value } };
  if (a.key === 'pricingEnabled') return st;
  return audit(st, {
    at: a.at,
    by: a.by,
    kind: 'setting_changed',
    summary: `Rule changed: ${String(a.key)} = ${JSON.stringify(a.value)}`,
    ref: String(a.key),
  });
}
