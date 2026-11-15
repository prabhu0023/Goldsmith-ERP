/**
 * JGD Enterprise Suite domain model.
 * Weights are grams (numbers). Money fields are nullable sockets: nothing reads them while
 * `settings.pricingEnabled` is false. Times are epoch milliseconds on the demo clock.
 */

export type RoleId = 'staff' | 'owner' | 'karigar';

/** Who is acting. Passed into every transition. */
export interface Actor {
  id: string;
  name: string;
  role: RoleId;
}

/** A person who can sign in (shown in the RoleChip menu). */
export interface Identity extends Actor {
  initials: string;
  subtitle: string;
  karigarId?: string;
}

// ---------- scales ----------
export interface Scale {
  id: string;
  name: string;
  /** Smallest step the scale reads, in grams (0.0001 = 4 decimals). */
  readabilityG: number;
  /** Heaviest load, grams. */
  capacityG: number;
}

// ---------- pieces ----------
/** The six states. The enum stays in the data; screens print a word (see StatusChip). */
export type PieceStatus = 'draft' | 'with_owner' | 'stopped' | 'in_stock' | 'billed' | 'scrapped';

export interface Piece {
  /** The tag number, e.g. TAG-8841. */
  id: string;
  name: string;
  /** What kind of item it is on the parcel manifest, e.g. "Temple Haram". */
  kind: string;
  collection: string;
  /** Short style line, e.g. "Kundan". */
  style: string;
  purity: string;
  huid: string;
  grossG: number;
  stoneG: number;
  stoneCount: number;
  size: string;
  /** The scale this piece was weighed on. */
  scaleId: string;
  status: PieceStatus;
  /** Status to go back to when a raised problem or scrap request is cleared. */
  prevStatus: PieceStatus | null;
  parcelId: string | null;
  jobId: string | null;
  madeById: string | null;
  inStockAt: number | null;
  taggedBy: string;
  taggedAt: number;
  photos: string[];
  note: string;
  heldForLeadId: string | null;
  /** Value socket. Unused while pricing is off. */
  valueINR: number | null;
  soldAt: number | null;
  stockOutId: string | null;
}

export type EditableField = 'grossG' | 'stoneG' | 'stoneCount' | 'purity' | 'huid' | 'name';

export type EditStatus = 'proposed' | 'token_sent' | 'applied' | 'refused' | 'void';

export interface PieceEdit {
  id: string;
  pieceId: string;
  field: EditableField;
  from: string | number;
  to: string | number;
  reason: string;
  proposedBy: string;
  proposedAt: number;
  status: EditStatus;
  token: string | null;
  tokenIssuedAt: number | null;
  decidedAt: number | null;
}

// ---------- parcels ----------
export type Verdict = 'incomplete' | 'exact' | 'last_digit' | 'mismatch';

export interface ParcelWeighing {
  id: string;
  /** "Whole parcel" or "Tray 3". */
  label: string;
  scaleId: string;
  grossG: number;
  stoneG: number;
}

export interface ManifestRow {
  id: string;
  kind: string;
  count: number;
}

export type ParcelStatus = 'open' | 'stopped' | 'released';
export type ParcelResolution = 'sent_back' | 'rechecking' | 'loss_accepted';

export interface Parcel {
  id: string;
  karigarId: string;
  jobId: string | null;
  poRef: string | null;
  arrivedAt: number;
  /** One reading, or one per tray. Empty until the parcel has been weighed. */
  weighings: ParcelWeighing[];
  manifest: ManifestRow[];
  /** 1 = weigh, 2 = tag, 3 = match. */
  stage: 1 | 2 | 3;
  status: ParcelStatus;
  resolution: ParcelResolution | null;
  recheckPieceId: string | null;
  /** Piece ids staff have checked (scale, hallmark, deductions). */
  qcDone: string[];
  verdict: Verdict;
  /** Net-gold gap in grams (tags minus parcel), set when all items are tagged. */
  gapNetG: number | null;
  lossG: number | null;
  lossReason: string | null;
  releasedAt: number | null;
  releasedBy: string | null;
  stoppedAt: number | null;
}

// ---------- leads and order copies ----------
export type LeadSource = 'whatsapp' | 'email' | 'counter';
export type LeadState = 'needs_glance' | 'opened' | 'being_worked' | 'converted' | 'lost';
export type LeadConfidence = 'clean' | 'unsure' | 'unreadable';

export type LeadRoute = { kind: 'stock'; pieceId: string } | { kind: 'make'; jobId: string };

export interface LeadItem {
  id: string;
  name: string;
  style: string;
  qty: number;
  approxWeightG: number | null;
  route: LeadRoute | null;
}

export interface LeadField {
  key: string;
  label: string;
  value: string;
  flagged: boolean;
}

export interface Lead {
  id: string;
  title: string;
  source: LeadSource;
  state: LeadState;
  confidence: LeadConfidence;
  arrivedAt: number;
  customerName: string;
  phone: string;
  /** The original message, shown beside the extracted fields. */
  message: string;
  fields: LeadField[];
  items: LeadItem[];
  neededBy: number | null;
  takenBy: string | null;
  note: string;
}

export interface OrderCopy {
  id: string;
  leadId: string | null;
  leadItemId: string | null;
  jobId: string;
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
  createdBy: string;
  createdAt: number;
}

// ---------- karigar jobs ----------
export type JobStatus = 'sent' | 'accepted' | 'on_bench' | 'ready' | 'handed_over';

export interface KarigarJob {
  id: string;
  orderCopyId: string | null;
  title: string;
  style: string;
  qty: number;
  purity: string;
  karigarId: string;
  status: JobStatus;
  sentAt: number;
  dueDate: number;
  /** Date the karigar confirmed on accepting. */
  confirmedDate: number | null;
  targetGrossG: number;
  targetNetG: number;
  toleranceG: number;
  goldIssuedG: number;
  note: string;
  refImage: string | null;
  stopped: boolean;
  parcelId: string | null;
  benchNote: string;
  /** Set when the parcel it came back in is released. */
  settledAt: number | null;
}

// ---------- people ----------
export interface Karigar {
  id: string;
  name: string;
  phone: string;
  specialty: string;
  language: string;
  /** Wastage allowance in percent (0.6 to 1.2). */
  wastagePct: number;
  /** Gold gap on recent parcels, in mg, oldest first. */
  gapsMg: number[];
  metalLossPct: number;
  lateDays: number;
  rating: number;
  finishedJobs: number;
  openSince: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: Exclude<RoleId, 'karigar'>;
  login: string;
  phone: string;
  salesCount: number;
}

export type CustomerGroup = 'VIP Bridal' | 'High net worth' | 'Regular' | 'Wholesale';

export interface HistoryRow {
  id: string;
  name: string;
  tag: string;
  pureG: number;
  on: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  city: string;
  group: CustomerGroup;
  /** ISO date YYYY-MM-DD or null. */
  dob: string | null;
  anniversary: string | null;
  optedIn: boolean;
  history: HistoryRow[];
  notes: string;
  /** Value sockets. Unused while pricing is off. */
  budgetINR: number | null;
  spentINR: number | null;
}

// ---------- exceptions, audit, scrap ----------
export type ProblemTarget = { kind: 'parcel' | 'job' | 'piece'; id: string };

export interface Problem {
  id: string;
  target: ProblemTarget;
  text: string;
  raisedBy: string;
  raisedByRole: RoleId;
  raisedAt: number;
  status: 'open' | 'cleared';
  clearedBy: string | null;
  clearedAt: number | null;
}

export interface ScrapRequest {
  id: string;
  pieceId: string;
  reason: string;
  requestedBy: string;
  requestedAt: number;
  status: 'pending' | 'scrapped' | 'declined';
  decidedAt: number | null;
}

export type AuditKind =
  | 'edit_applied'
  | 'edit_refused'
  | 'loss_accepted'
  | 'parcel_sent_back'
  | 'parcel_last_digit'
  | 'problem_cleared'
  | 'scrap_marked'
  | 'scrap_declined'
  | 'stock_out'
  | 'setting_changed';

export interface AuditEntry {
  id: string;
  at: number;
  actorName: string;
  actorRole: RoleId;
  kind: AuditKind;
  summary: string;
  detail: string;
  /** The tag, batch or job it concerns. */
  ref: string;
}

export interface StockOutRecord {
  id: string;
  pieceIds: string[];
  sellerId: string;
  sellerName: string;
  /** Reference from the billing book. */
  ref: string;
  /** Tax invoice number, a string. The app never holds the amount. */
  invoiceNo: string;
  at: number;
  amountINR: number | null;
}

export interface PoolEntry {
  id: string;
  at: number;
  kind: 'opening' | 'issued' | 'recovered';
  deltaG: number;
  note: string;
  ref: string;
}

export interface MetalPool {
  balanceG: number;
  ledger: PoolEntry[];
}

// ---------- marketing ----------
export interface Broadcast {
  id: string;
  at: number;
  audience: CustomerGroup | 'All';
  message: string;
  pieceIds: string[];
  recipientIds: string[];
  sentBy: string;
}

export interface WishRecord {
  id: string;
  at: number;
  customerId: string;
  kind: 'birthday' | 'anniversary';
  sender: string;
}

// ---------- settings and app state ----------
export interface Settings {
  pricingEnabled: boolean;
  leadSlaHours: number;
  requireEditToken: boolean;
  notifyChannels: { whatsapp: boolean; app: boolean; email: boolean };
  lateLeadAudience: 'staff_then_owner' | 'owner_only';
  autoSendWishes: boolean;
}

export interface AppState {
  /** Counter for generated ids and tokens. Keeps transitions pure. */
  seq: number;
  scales: Scale[];
  karigars: Karigar[];
  staff: StaffMember[];
  customers: Customer[];
  pieces: Piece[];
  parcels: Parcel[];
  leads: Lead[];
  orderCopies: OrderCopy[];
  jobs: KarigarJob[];
  edits: PieceEdit[];
  problems: Problem[];
  scrapRequests: ScrapRequest[];
  stockOuts: StockOutRecord[];
  pool: MetalPool;
  audit: AuditEntry[];
  broadcasts: Broadcast[];
  wishes: WishRecord[];
  settings: Settings;
  /** The scale picked last, remembered so staff do not choose it again. */
  lastScaleId: string;
}
