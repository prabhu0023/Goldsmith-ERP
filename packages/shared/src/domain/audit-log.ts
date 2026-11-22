/**
 * The audit log model (EP-06): the one list of action kinds, the entity each concerns, their
 * labels, the filter groups of the security log and the helpers that show an entry's values.
 * The database check on audit_entries.kind holds exactly AUDIT_ACTIONS (a test compares them),
 * and kinds use only a-z and _ so the order-safe check widening keeps them
 * (docs/setup/parallel-lanes.md). Weights in before/after values are integers of 0.0001 g.
 */
import type { AuditKind } from '../types/jewellery.js';
import { formatShopTime } from './shop-time.js';
import { unitsToGrams } from './weights.js';

export const AUDIT_ACTIONS = [
  // The 10 kinds the prototype writes (types/jewellery.ts AuditKind).
  'edit_applied',
  'edit_refused',
  'loss_accepted',
  'parcel_sent_back',
  'parcel_last_digit',
  'problem_cleared',
  'scrap_marked',
  'scrap_declined',
  'stock_out',
  'setting_changed',
  // EP-04 sign-in.
  'first_owner_created',
  'activation_link_sent',
  'password_set',
  'signed_in',
  'sign_in_failed',
  'sign_in_locked',
  'account_unlocked',
  'signed_out',
  'sessions_ended',
  'password_reset_requested',
  'password_reset',
  // EP-10 background jobs.
  'lead_marked_late',
  'job_marked_overdue',
  'job_reminder_sent',
  'edit_token_expired',
  'job_run_retried',
  // EP-05 users.
  'user_added',
  'user_edited',
  'role_changed',
  'user_deactivated',
  'user_reactivated',
  'karigar_linked',
  // EP-09 files: attach and detach on a piece, order copy, job or lead, intake, retention.
  'file_attached',
  'file_detached',
  'po_attachment_stored',
  'file_removed_by_retention',
  // EP-06-S7: transitions the prototype does not audit (working names).
  'lead_created',
  'lead_confirmed',
  'lead_work_started',
  'lead_lost',
  'lead_item_routed_to_stock',
  'order_copy_job_created',
  'job_accepted',
  'job_started',
  'job_marked_ready',
  'job_handed_over',
  'parcel_arrived',
  'tag_saved',
  'qc_ticked',
  'parcel_released',
  'tag_recheck_requested',
  'problem_raised',
  'edit_proposed',
  'edit_agreed',
  'scrap_requested',
  'customer_onboarded',
  'karigar_onboarded',
  'staff_onboarded',
  'wishes_sent',
  'broadcast_sent',
  'scale_upserted',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Compile-time check: every prototype AuditKind is still an AuditAction (EP-06-S7 AC2). */
type KindsAreActions<T extends AuditAction> = T;

export type PrototypeAuditKind = KindsAreActions<AuditKind>;

export const isAuditAction = (kind: string): kind is AuditAction => (AUDIT_ACTIONS as readonly string[]).includes(kind);

/** What each kind is called on the security log. The prototype's words are kept. */
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  edit_applied: 'Edit applied',
  edit_refused: 'Edit refused',
  loss_accepted: 'Loss accepted',
  parcel_sent_back: 'Parcel sent back',
  parcel_last_digit: 'Released at the last digit',
  problem_cleared: 'Problem cleared',
  scrap_marked: 'Scrapped',
  scrap_declined: 'Scrap declined',
  stock_out: 'Stock-out',
  setting_changed: 'Rule changed',
  first_owner_created: 'First owner created',
  activation_link_sent: 'Activation link sent',
  password_set: 'Password set',
  signed_in: 'Signed in',
  sign_in_failed: 'Sign-in failed',
  sign_in_locked: 'Sign-in locked',
  account_unlocked: 'Account unlocked',
  signed_out: 'Signed out',
  sessions_ended: 'Sessions ended',
  password_reset_requested: 'Password reset requested',
  password_reset: 'Password reset',
  lead_marked_late: 'Lead marked late',
  job_marked_overdue: 'Job marked overdue',
  job_reminder_sent: 'Overdue reminder sent',
  edit_token_expired: 'Edit token expired',
  job_run_retried: 'Job run retried',
  user_added: 'User added',
  user_edited: 'User edited',
  role_changed: 'Role changed',
  user_deactivated: 'User deactivated',
  user_reactivated: 'User reactivated',
  karigar_linked: 'Karigar linked',
  file_attached: 'File attached',
  file_detached: 'File detached',
  po_attachment_stored: 'PO attachment stored',
  file_removed_by_retention: 'File removed by retention',
  lead_created: 'Lead created',
  lead_confirmed: 'Lead confirmed',
  lead_work_started: 'Lead being worked',
  lead_lost: 'Lead lost',
  lead_item_routed_to_stock: 'Lead item sent to stock',
  order_copy_job_created: 'Order copy and job created',
  job_accepted: 'Job accepted',
  job_started: 'Job started',
  job_marked_ready: 'Job ready',
  job_handed_over: 'Job handed over',
  parcel_arrived: 'Parcel arrived',
  tag_saved: 'Tag saved',
  qc_ticked: 'QC ticked',
  parcel_released: 'Parcel released',
  tag_recheck_requested: 'Tag recheck asked',
  problem_raised: 'Problem raised',
  edit_proposed: 'Edit proposed',
  edit_agreed: 'Edit agreed',
  scrap_requested: 'Scrap requested',
  customer_onboarded: 'Customer added',
  karigar_onboarded: 'Karigar added',
  staff_onboarded: 'Staff added',
  wishes_sent: 'Wishes sent',
  broadcast_sent: 'Broadcast sent',
  scale_upserted: 'Scale saved',
};

/** What an entry can be about. "invoice" is not one: the app never holds invoices. */
export const AUDIT_ENTITY_TYPES = [
  'piece',
  'parcel',
  'lead',
  'job',
  'edit',
  'problem',
  'scrap_request',
  'stock_out',
  'setting',
  'user',
  'scale',
  'karigar',
  'customer',
  'broadcast',
  'wish',
  'session',
  'job_run',
  'order_copy',
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

/** The entity type an entry of each kind concerns (the writer's default). */
export const AUDIT_ACTION_ENTITY: Record<AuditAction, AuditEntityType> = {
  edit_applied: 'edit',
  edit_refused: 'edit',
  loss_accepted: 'parcel',
  parcel_sent_back: 'parcel',
  parcel_last_digit: 'parcel',
  problem_cleared: 'problem',
  scrap_marked: 'scrap_request',
  scrap_declined: 'scrap_request',
  stock_out: 'stock_out',
  setting_changed: 'setting',
  first_owner_created: 'user',
  activation_link_sent: 'user',
  password_set: 'user',
  signed_in: 'session',
  sign_in_failed: 'user',
  sign_in_locked: 'user',
  account_unlocked: 'user',
  signed_out: 'session',
  sessions_ended: 'user',
  password_reset_requested: 'user',
  password_reset: 'user',
  lead_marked_late: 'lead',
  job_marked_overdue: 'job',
  job_reminder_sent: 'job',
  edit_token_expired: 'edit',
  job_run_retried: 'job_run',
  user_added: 'user',
  user_edited: 'user',
  role_changed: 'user',
  user_deactivated: 'user',
  user_reactivated: 'user',
  karigar_linked: 'user',
  // A file entry is about the file's owner; the writer passes the owner's type.
  file_attached: 'piece',
  file_detached: 'piece',
  po_attachment_stored: 'lead',
  file_removed_by_retention: 'piece',
  lead_created: 'lead',
  lead_confirmed: 'lead',
  lead_work_started: 'lead',
  lead_lost: 'lead',
  lead_item_routed_to_stock: 'lead',
  order_copy_job_created: 'job',
  job_accepted: 'job',
  job_started: 'job',
  job_marked_ready: 'job',
  job_handed_over: 'job',
  parcel_arrived: 'parcel',
  tag_saved: 'piece',
  qc_ticked: 'piece',
  parcel_released: 'parcel',
  tag_recheck_requested: 'piece',
  problem_raised: 'problem',
  edit_proposed: 'edit',
  edit_agreed: 'edit',
  scrap_requested: 'scrap_request',
  customer_onboarded: 'customer',
  karigar_onboarded: 'karigar',
  staff_onboarded: 'user',
  wishes_sent: 'wish',
  broadcast_sent: 'broadcast',
  scale_upserted: 'scale',
};

/** Who can be an entry's actor: a person by role, a System job or integration, or first-time setup. */
export const AUDIT_ACTOR_ROLES = ['owner', 'staff', 'karigar', 'system', 'setup'] as const;

export type AuditActorRole = (typeof AUDIT_ACTOR_ROLES)[number];

export const AUDIT_GROUP_IDS = ['all', 'edits', 'losses', 'problems', 'scrap', 'stock-out', 'rules'] as const;

export type AuditGroupId = (typeof AUDIT_GROUP_IDS)[number];

export interface AuditGroup {
  id: AuditGroupId;
  label: string;
  /** Empty for Everything, which shows every kind. */
  kinds: readonly AuditAction[];
}

/** The security log's filter groups, as in the prototype. Kinds added since are under Everything only. */
export const AUDIT_GROUPS: readonly AuditGroup[] = [
  { id: 'all', label: 'Everything', kinds: [] },
  { id: 'edits', label: 'Tag edits', kinds: ['edit_applied', 'edit_refused'] },
  { id: 'losses', label: 'Parcels and losses', kinds: ['loss_accepted', 'parcel_sent_back', 'parcel_last_digit'] },
  { id: 'problems', label: 'Problems', kinds: ['problem_cleared'] },
  { id: 'scrap', label: 'Scrap', kinds: ['scrap_marked', 'scrap_declined'] },
  { id: 'stock-out', label: 'Stock-out', kinds: ['stock_out'] },
  { id: 'rules', label: 'Rules', kinds: ['setting_changed'] },
];

/** The kinds a group shows; Everything shows every kind. */
export function kindsOfGroup(id: AuditGroupId): readonly AuditAction[] {
  if (id === 'all') return AUDIT_ACTIONS;
  return AUDIT_GROUPS.find((g) => g.id === id)?.kinds ?? [];
}

/**
 * The kind each transition writes when its feature epic ports it (EP-06-S7 AC1). releaseHold
 * has none: v1 has no holds.
 */
export const TRANSITION_AUDIT_KINDS = {
  createLead: 'lead_created',
  confirmLead: 'lead_confirmed',
  startWorkingLead: 'lead_work_started',
  markLeadLost: 'lead_lost',
  routeLeadItemToStock: 'lead_item_routed_to_stock',
  createOrderCopyAndJob: 'order_copy_job_created',
  acceptJob: 'job_accepted',
  startJob: 'job_started',
  markJobReady: 'job_marked_ready',
  handOver: 'job_handed_over',
  recordParcelArrival: 'parcel_arrived',
  saveTag: 'tag_saved',
  qcTick: 'qc_ticked',
  releaseParcel: 'parcel_released',
  ownerRecheckTag: 'tag_recheck_requested',
  raiseProblem: 'problem_raised',
  proposeEdit: 'edit_proposed',
  ownerAgreeEdit: 'edit_agreed',
  requestScrap: 'scrap_requested',
  onboardCustomer: 'customer_onboarded',
  onboardKarigar: 'karigar_onboarded',
  onboardStaff: 'staff_onboarded',
  sendWishes: 'wishes_sent',
  sendBroadcast: 'broadcast_sent',
  upsertScale: 'scale_upserted',
} as const satisfies Record<string, AuditAction>;

/** A before/after key that holds a weight in units of 0.0001 g: grossG, stoneG, lossG, netG. */
export const isWeightKey = (key: string): boolean => /[a-z]G$/.test(key);

/** One before or after value as the log shows it: weights in grams to four decimals, nothing as "—". */
export function formatAuditValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (isWeightKey(key) && typeof value === 'number' && Number.isSafeInteger(value)) return `${unitsToGrams(value)} g`;
  if (Array.isArray(value)) return value.map((v) => formatAuditValue(key, v)).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${formatAuditValue(k, v)}`)
      .join(', ');
  }
  return String(value);
}

/** "48.6500 g → 48.6100 g (-0.0400 g)" for two weights in units. */
export function weightChangeText(before: number, after: number): string {
  const delta = after - before;
  const sign = delta > 0 ? '+' : '';
  return `${unitsToGrams(before)} g → ${unitsToGrams(after)} g (${sign}${unitsToGrams(delta)} g)`;
}

const FIELD_LABELS: Record<string, string> = {
  grossG: 'Gross weight',
  stoneG: 'Stone weight',
  lossG: 'Loss',
  state: 'State',
  note: 'Note',
};

export interface AuditFieldRow {
  field: string;
  label: string;
  before: string;
  after: string;
}

type Values = Record<string, unknown> | null | undefined;

/** One row per field in either value, formatted for the entry's detail. */
export function auditFieldRows(before: Values, after: Values): AuditFieldRow[] {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  return keys.map((field) => ({
    field,
    label: FIELD_LABELS[field] ?? field,
    before: formatAuditValue(field, before?.[field]),
    after: formatAuditValue(field, after?.[field]),
  }));
}

/**
 * "Sanjay Seth (owner)"; a System actor as "Scheduler (System)", and a job's stored name
 * "System (SLA breach job)" as "SLA breach job (System)".
 */
export function auditActorLabel({ actorName, actorRole }: { actorName: string; actorRole: string }): string {
  if (actorRole === 'system') {
    const job = /^System \((.+)\)$/.exec(actorName);
    return `${job ? job[1] : actorName} (System)`;
  }
  if (actorRole === 'setup') return actorName;
  return `${actorName} (${actorRole})`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "22 Nov 2026, 14:32 IST" for a UTC time (ISO text or epoch ms), in shop time. */
export function fmtAuditTime(at: string | number): string {
  const ms = typeof at === 'number' ? at : Date.parse(at);
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(formatShopTime(ms));
  if (!m) throw new Error(`Not a time: ${JSON.stringify(at)}`);
  const [, year, month, day, hour, minute] = m;
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}, ${hour}:${minute} IST`;
}
