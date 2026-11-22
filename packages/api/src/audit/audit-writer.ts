/**
 * The one audit writer (EP-06-S2 to S6): appendAudit is the only code that inserts into
 * audit_entries. It runs on the operation's transaction client, so a rolled-back operation leaves
 * no entry, and it refuses an entry before the insert when:
 *   - the kind is not in the shared AUDIT_ACTIONS, or the entity type not in AUDIT_ENTITY_TYPES;
 *   - the entity id is empty;
 *   - the token reference looks like a token (4 to 8 digits): only the record id of a token goes in;
 *   - a weight key (grossG, lossG, …) holds anything but an integer of 0.0001 g units.
 * Before and after values lose secret-like and money keys and have phones and emails masked; the
 * reason has contacts masked. The entries a client wrote are recorded while an audit scope is
 * open on it (openAuditScope), so the pipeline can check an operation wrote one.
 */
import {
  AUDIT_ACTION_ENTITY,
  AUDIT_ENTITY_TYPES,
  type AuditAction,
  type AuditEntityType,
  isAuditAction,
  isWeightKey,
  type RoleId,
} from '@goldsmith/shared';
import type pg from 'pg';
import { maskContactsInText } from '../auth/mask.js';
import { redactSecrets, stripMoney } from './redact.js';

type Queryable = pg.Pool | pg.PoolClient;

/**
 * Who acted: a signed-in user, a System job or integration (by its name, e.g. "System (SLA breach
 * job)" or SYSTEM_ACTORS.scheduler) or first-time setup. Never taken from a request body.
 */
export type AuditActor =
  | { kind: 'user'; id: string; name: string; role: RoleId }
  | { kind: 'system'; name: string }
  | { kind: 'setup' };

/** The fixed names of integrations that act as System (EP-06-S6 AC2). Jobs use "System (<label>)". */
export const SYSTEM_ACTORS = {
  scheduler: 'Scheduler',
  whatsappIntake: 'WhatsApp intake',
} as const;

export interface AuditWrite {
  shopId: string;
  at: Date;
  actor: AuditActor;
  kind: AuditAction;
  /** Defaults to the kind's entity type (AUDIT_ACTION_ENTITY). */
  entityType?: AuditEntityType;
  /** The record's human code when it has one (LD-2026-213, KG-04, a setting key), else its uuid. */
  entityId: string;
  /** A short sentence, e.g. "Lead LD-2026-213 marked lost". */
  summary: string;
  /** Free text kept as is (callers that store facts put JSON text here). */
  detail?: string | null;
  /** Why, as the person typed it; phones and emails are masked. */
  reason?: string | null;
  /** The tag, batch, job or run code it concerns. */
  ref?: string | null;
  /** The record id of a token that authorised the change, never the token itself (S4). */
  tokenReference?: string | null;
  /** The changed fields as they were; null for a create. */
  before?: unknown;
  after?: unknown;
  /** The id of the earlier entry this one corrects; stored as the reference (S11 AC5). */
  corrects?: string | null;
}

export interface RecordedAudit {
  id: string;
  kind: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
}

const scopes = new WeakMap<Queryable, RecordedAudit[]>();

/** Start recording the entries appended on `client` (one operation's audit scope). */
export function openAuditScope(client: Queryable): void {
  scopes.set(client, []);
}

/** Stop recording on `client` and return what it wrote since openAuditScope. */
export function closeAuditScope(client: Queryable): readonly RecordedAudit[] {
  const written = scopes.get(client) ?? [];
  scopes.delete(client);
  return written;
}

const TOKEN_LIKE = /^\d{4,8}$/;

function actorColumns(actor: AuditActor): { id: string | null; name: string; role: string } {
  if (actor.kind === 'user') return { id: actor.id, name: actor.name, role: actor.role };
  if (actor.kind === 'system') return { id: null, name: actor.name, role: 'system' };
  return { id: null, name: 'Setup', role: 'setup' };
}

function assertWeightUnits(value: unknown): void {
  if (Array.isArray(value)) {
    for (const v of value) assertWeightUnits(v);
    return;
  }
  if (value === null || typeof value !== 'object' || value instanceof Date) return;
  for (const [key, child] of Object.entries(value)) {
    if (isWeightKey(key) && child !== null && child !== undefined && !Number.isSafeInteger(child)) {
      throw new Error(`Weight ${key} must be integer units of 0.0001 g`);
    }
    assertWeightUnits(child);
  }
}

const jsonValue = (value: unknown): string | null =>
  value === undefined || value === null ? null : JSON.stringify(stripMoney(redactSecrets(value)));

/** Append one entry. Throws, before inserting anything, when the entry breaks a rule above. */
export async function appendAudit(client: Queryable, entry: AuditWrite): Promise<{ id: string }> {
  if (!isAuditAction(entry.kind)) throw new Error(`Unknown audit kind: ${JSON.stringify(entry.kind)}`);
  const entityType = entry.entityType ?? AUDIT_ACTION_ENTITY[entry.kind];
  if (!(AUDIT_ENTITY_TYPES as readonly string[]).includes(entityType)) {
    throw new Error(`Unknown audit entity type: ${JSON.stringify(entityType)}`);
  }
  if (typeof entry.entityId !== 'string' || entry.entityId.trim() === '') {
    throw new Error(`An audit entry of kind ${entry.kind} must name its entity`);
  }
  const tokenReference = entry.tokenReference ?? null;
  if (tokenReference !== null && TOKEN_LIKE.test(tokenReference.trim())) {
    throw new Error('An audit entry takes the token reference, never the token');
  }
  assertWeightUnits(entry.before);
  assertWeightUnits(entry.after);
  const actor = actorColumns(entry.actor);
  const { rows } = await client.query<{ id: string }>(
    `insert into audit_entries
       (shop_id, at, actor_id, actor_name, actor_role, kind, entity_type, entity_id, summary, detail, reason,
        reference, token_reference, before_value, after_value)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     returning id`,
    [
      entry.shopId,
      entry.at,
      actor.id,
      actor.name,
      actor.role,
      entry.kind,
      entityType,
      entry.entityId,
      entry.summary,
      entry.detail ?? null,
      entry.reason ? maskContactsInText(entry.reason) : null,
      entry.corrects ?? entry.ref ?? null,
      tokenReference,
      jsonValue(entry.before),
      jsonValue(entry.after),
    ],
  );
  const id = rows[0].id;
  scopes.get(client)?.push({ id, kind: entry.kind, entityType, entityId: entry.entityId });
  return { id };
}

type Values = Record<string, unknown>;

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.hasOwn(b, k) && sameValue((a as Values)[k], (b as Values)[k]));
}

/**
 * Only the fields that changed (EP-06-S3 AC1, AC3): a key whose value differs (compared deeply;
 * an object or list field is kept whole). A create has `before: null` and keeps every field.
 * A key missing on one side is null there.
 */
export function changedFields(
  before: Values | null,
  after: Values | null,
): { before: Values | null; after: Values | null } {
  if (before === null || after === null) return { before, after };
  const outBefore: Values = {};
  const outAfter: Values = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const was = before[key] ?? null;
    const now = after[key] ?? null;
    if (sameValue(was, now)) continue;
    outBefore[key] = was;
    outAfter[key] = now;
  }
  return { before: outBefore, after: outAfter };
}
