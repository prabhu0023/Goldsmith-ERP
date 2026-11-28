import type { AuditGroupId, OperationInput, OperationResult } from '@goldsmith/shared';
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
/** The listAuditEntries input for the filters; the paged read adds the cursor of each next page. */
export function auditListInput(filters: AuditFilters): OperationInput<'listAuditEntries'> {
  const entity = filters.entity.trim();
  return {
    ...(filters.group !== 'all' ? { group: filters.group } : {}),
    ...(entity ? { entity } : {}),
    ...(filters.actor === SYSTEM_ACTOR ? { actorRole: 'system' as const } : filters.actor ? { actorId: filters.actor } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
  };
}
