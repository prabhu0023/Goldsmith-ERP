import type { AuditGroupId, OperationInput, OperationResult } from '@goldsmith/shared';
import type { OpsAnswer } from '../../api/ops-client';
/** One row of the server's security log (listAuditEntries). */
export type AuditListItem = OperationResult<'listAuditEntries'>['items'][number];
/** One entry as readAuditEntry answers it. */
export type AuditEntry = OperationResult<'readAuditEntry'>['entry'];
/** The actor select's value for every System job and integration. */
export const SYSTEM_ACTOR = 'system';
/** The screen's filters (EP-06-S10). Empty text means "not filtered". */
export interface AuditFilters {
  group: AuditGroupId;
  /** A tag, batch, job or record code. */
  entity: string;
  /** '' for everyone, SYSTEM_ACTOR, or a user's id. */
  actor: string;
  /** Shop dates YYYY-MM-DD, both inclusive. */
  from: string;
  to: string;
}
export const NO_FILTERS: AuditFilters = { group: 'all', entity: '', actor: '', from: '', to: '' };
/** The listAuditEntries input for the filters, and the cursor of the next page when loading more. */
export function auditListInput(filters: AuditFilters, cursor?: string): OperationInput<'listAuditEntries'> {
  const entity = filters.entity.trim();
  return {
    ...(filters.group !== 'all' ? { group: filters.group } : {}),
    ...(entity ? { entity } : {}),
    ...(filters.actor === SYSTEM_ACTOR ? { actorRole: 'system' as const } : filters.actor ? { actorId: filters.actor } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    ...(cursor ? { cursor } : {}),
  };
}
/** The log's list state: the rows so far, the next page cursor and a load error. */
export interface AuditList {
  entries: AuditListItem[];
  nextCursor: string | null;
  loadError: string | null;
}
/**
 * The list after a listAuditEntries answer (EP-06-S9 AC3, AC4): a page is added after "Load
 * more" or replaces the list; a failure keeps the rows and shows the server's message.
 */
export function afterAuditAnswer(prev: AuditList, answer: OpsAnswer<'listAuditEntries'>, cursor?: string): AuditList {
  if (!answer.ok) return { ...prev, loadError: answer.message };
  return {
    entries: cursor ? [...prev.entries, ...answer.data.items] : answer.data.items,
    nextCursor: answer.data.nextCursor,
    loadError: null,
  };
}
export type SecurityLogNotice = 'loading' | 'error' | 'reconnecting' | null;
/** Which status the screen shows (EP-06-S9 AC4): offline first, then a failed load, then loading. */
export function securityLogNotice({
  loading,
  error,
  online,
}: {
  loading: boolean;
  error: string | null;
  online: boolean;
}): SecurityLogNotice {
  if (!online) return 'reconnecting';
  if (error) return 'error';
  return loading ? 'loading' : null;
}
