/** Read-side helpers over AppState: queues, badges, per-person lists. Pure; no React. */
import { isMonthDayToday, sameDay, startOfDay } from '../domain/clock';
import { slaState } from '../domain/leads';
import { evaluateParcel } from '../domain/match';
import type { ParcelEvaluation } from '../domain/match';
import { netOf, sumG } from '../domain/weights';
import type {
  AppState,
  Actor,
  Customer,
  Identity,
  KarigarJob,
  Lead,
  Parcel,
  Piece,
  PieceEdit,
  Problem,
  RoleId,
  ScrapRequest,
} from '../types/jewellery';

export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

/** Everyone who can sign in: staff and owner, then every karigar. */
export function identities(s: AppState): Identity[] {
  const people: Identity[] = s.staff.map((m) => ({
    id: m.id,
    name: m.name,
    role: m.role,
    initials: initialsOf(m.name),
    subtitle: m.role === 'owner' ? 'Owner' : 'Showroom staff',
  }));
  const karigars: Identity[] = s.karigars.map((k) => ({
    id: k.id,
    name: k.name,
    role: 'karigar' as const,
    initials: initialsOf(k.name),
    subtitle: `Karigar · ${k.id}`,
    karigarId: k.id,
  }));
  return [...people, ...karigars];
}

export const actorOf = (i: Identity): Actor => ({ id: i.id, name: i.name, role: i.role });

// ---------- stock ----------
export const inStockPieces = (s: AppState): Piece[] =>
  s.pieces.filter((p) => p.status === 'in_stock').sort((a, b) => (b.inStockAt ?? 0) - (a.inStockAt ?? 0));

export const pureGoldOnFloor = (s: AppState): number => sumG(inStockPieces(s).map((p) => netOf(p)));

/** Pieces that exist but are not on the floor: draft, with the owner, or stopped. */
export const heldBackPieces = (s: AppState): Piece[] =>
  s.pieces.filter((p) => p.status === 'draft' || p.status === 'with_owner' || p.status === 'stopped');

export function piecesOutToday(s: AppState, now: number): Piece[] {
  const ids = new Set(s.stockOuts.filter((o) => sameDay(o.at, now)).flatMap((o) => o.pieceIds));
  return s.pieces.filter((p) => ids.has(p.id));
}
export const goldOutToday = (s: AppState, now: number): number => sumG(piecesOutToday(s, now).map((p) => netOf(p)));

export const daysInStock = (p: Piece, now: number): number =>
  p.inStockAt === null ? 0 : Math.max(0, Math.floor((startOfDay(now) - startOfDay(p.inStockAt)) / 86400000));

export const openEditFor = (s: AppState, pieceId: string): PieceEdit | undefined =>
  s.edits.find((e) => e.pieceId === pieceId && (e.status === 'proposed' || e.status === 'token_sent'));

// ---------- parcels ----------
export const parcelPieces = (s: AppState, parcelId: string): Piece[] => s.pieces.filter((p) => p.parcelId === parcelId);
export const openParcels = (s: AppState): Parcel[] => s.parcels.filter((p) => p.status !== 'released');
export const evaluate = (s: AppState, parcel: Parcel): ParcelEvaluation => evaluateParcel(parcel, s.pieces, s.scales);

export const openProblems = (s: AppState): Problem[] => s.problems.filter((p) => p.status === 'open');
export const problemsOn = (s: AppState, kind: Problem['target']['kind'], id: string): Problem[] =>
  openProblems(s).filter((p) => p.target.kind === kind && p.target.id === id);

// ---------- jobs ----------
export const jobsForKarigar = (s: AppState, karigarId: string): KarigarJob[] =>
  s.jobs.filter((j) => j.karigarId === karigarId).sort((a, b) => a.dueDate - b.dueDate);
export const openJobsForKarigar = (s: AppState, karigarId: string): KarigarJob[] =>
  jobsForKarigar(s, karigarId).filter((j) => j.status !== 'handed_over');

/** The date the karigar is held to: the one he confirmed, else the one on the order copy. */
export const agreedDate = (j: KarigarJob): number => j.confirmedDate ?? j.dueDate;
export const jobOverdueDays = (j: KarigarJob, now: number): number =>
  j.status === 'handed_over' ? 0 : Math.max(0, Math.round((startOfDay(now) - startOfDay(agreedDate(j))) / 86400000));
export const overdueJobs = (s: AppState, now: number): KarigarJob[] => s.jobs.filter((j) => jobOverdueDays(j, now) > 0);

/** Gold issued on jobs that are still with the karigar (not yet handed over). */
export const goldWithKarigar = (s: AppState, karigarId: string): number =>
  sumG(openJobsForKarigar(s, karigarId).map((j) => j.goldIssuedG));

// ---------- leads ----------
export const lateLeads = (s: AppState, now: number): Lead[] =>
  s.leads.filter((l) => slaState(l, now, s.settings.leadSlaHours).phase === 'late');
export const leadsNeedingGlance = (s: AppState): Lead[] => s.leads.filter((l) => l.state === 'needs_glance');

// ---------- owner ----------
export interface OwnerQueues {
  mismatchedParcels: Parcel[];
  raisedProblems: Problem[];
  pendingEdits: PieceEdit[];
  pendingScrap: ScrapRequest[];
  lateLeads: Lead[];
  overdueJobs: KarigarJob[];
  /** Cards under "Nothing moves until you answer". Edits and scrap each count as one card. */
  blocking: number;
  /** Cards under "Running late". */
  late: number;
  total: number;
}

export function ownerQueues(s: AppState, now: number): OwnerQueues {
  const problems = openProblems(s);
  const parcelHasProblem = (id: string) => problems.some((p) => p.target.kind === 'parcel' && p.target.id === id);
  const mismatchedParcels = s.parcels.filter(
    (p) => p.status === 'stopped' && p.resolution === null && p.verdict === 'mismatch' && !parcelHasProblem(p.id),
  );
  const pendingEdits = s.edits.filter((e) => e.status === 'proposed' || e.status === 'token_sent');
  const pendingScrap = s.scrapRequests.filter((r) => r.status === 'pending');
  const late = lateLeads(s, now);
  const overdue = overdueJobs(s, now);
  const blocking = mismatchedParcels.length + problems.length + (pendingEdits.length ? 1 : 0) + (pendingScrap.length ? 1 : 0);
  const lateCards = (late.length ? 1 : 0) + (overdue.length ? 1 : 0);
  return {
    mismatchedParcels,
    raisedProblems: problems,
    pendingEdits,
    pendingScrap,
    lateLeads: late,
    overdueJobs: overdue,
    blocking,
    late: lateCards,
    total: blocking + lateCards,
  };
}

// ---------- rail badges ----------
export type BadgeKey = 'decisions' | 'leads' | 'parcels' | 'stock';

export function railBadges(s: AppState, role: RoleId, now: number): Partial<Record<BadgeKey, number>> {
  const out: Partial<Record<BadgeKey, number>> = {};
  const parcels = openParcels(s).length;
  const stock = inStockPieces(s).length;
  if (role === 'owner') {
    out.decisions = ownerQueues(s, now).total;
    out.leads = lateLeads(s, now).length;
    out.parcels = parcels;
    out.stock = stock;
  } else if (role === 'staff') {
    out.leads = leadsNeedingGlance(s).length;
    out.parcels = parcels;
    out.stock = stock;
  }
  return out;
}

// ---------- customers ----------
export function wishesDueToday(s: AppState, now: number): { customer: Customer; kind: 'birthday' | 'anniversary' }[] {
  const out: { customer: Customer; kind: 'birthday' | 'anniversary' }[] = [];
  for (const c of s.customers) {
    if (isMonthDayToday(c.dob, now)) out.push({ customer: c, kind: 'birthday' });
    if (isMonthDayToday(c.anniversary, now)) out.push({ customer: c, kind: 'anniversary' });
  }
  return out;
}
