/**
 * Mark Lead Lost (EP-03-S12): the reference service function. Every feature epic copies this
 * pattern:
 *   - the input is already validated against the shared contract (`contract.markLeadLost`);
 *   - actor, time and shop come from `ctx`, set by the server, never from the request body;
 *   - the record is found by its human code within `ctx.shop` (missing -> not_found);
 *   - the domain rule comes from `@goldsmith/shared` (refusal -> rule_refused);
 *   - the write goes through `updateVersioned` (a concurrent change -> conflict);
 *   - everything runs in the one transaction `tx` the pipeline opened for this request;
 *   - the change is audited with `auditChange` in that transaction (EP-06-S2).
 * The prototype's hold release is not ported: v1 has no holds.
 */
import { assertCanMarkLost, type contract, type LeadState } from '@goldsmith/shared';
import { auditChange } from '../audit/audit-writer.js';
import { updateVersioned } from '../db/versioned.js';
import { leadSlaTimerAfterTransition } from '../jobs/handlers/lead-sla.js';
import { NotFoundError } from '../pipeline/api-errors.js';
import type { Handler } from '../pipeline/registry.js';

export const markLeadLost: Handler<typeof contract.markLeadLost> = async (tx, ctx, input) => {
  const { rows } = await tx.client.query<{ id: string; state: LeadState; note: string | null; version: number }>(
    'select id, state, note, version from leads where shop_id = $1 and code = $2',
    [ctx.shop.shopId, input.leadId],
  );
  const lead = rows[0];
  if (!lead) throw new NotFoundError('Lead', input.leadId);
  assertCanMarkLost(lead.state);
  const note = input.reason ? input.reason : lead.note;
  await updateVersioned(tx.client, ctx.shop, {
    table: 'leads',
    id: lead.id,
    expectedVersion: lead.version,
    set: { state: 'lost', note },
  });
  await auditChange(tx, ctx, {
    kind: 'lead_lost',
    entityType: 'lead',
    entityId: input.leadId,
    ref: input.leadId,
    summary: `Lead ${input.leadId} marked lost`,
    reason: input.reason || null,
    before: { state: lead.state, note: lead.note },
    after: { state: 'lost', note },
  });
  await leadSlaTimerAfterTransition(tx.client, ctx.shop, { leadId: lead.id, state: 'lost' });
  return { ok: true };
};
