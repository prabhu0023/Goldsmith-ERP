import type { Lead, LeadState } from '../types/jewellery.js';
import { HOUR } from './clock.js';
import { DomainError } from './domain-error.js';

export type SlaPhase = 'late' | 'running' | 'met';

export interface SlaState {
  phase: SlaPhase;
  elapsedH: number;
  /** Whole hours left before the limit; 0 once passed. */
  leftH: number;
  label: string;
}

/** A lead's clock runs from arrival until a person works it. */
export const slaRunning = (lead: Pick<Lead, 'state'>): boolean => lead.state === 'needs_glance' || lead.state === 'opened';

export function slaState(lead: Lead, now: number, slaHours: number): SlaState {
  const elapsedH = Math.max(0, (now - lead.arrivedAt) / HOUR);
  if (!slaRunning(lead)) {
    return { phase: 'met', elapsedH, leftH: 0, label: lead.state === 'being_worked' ? 'being worked' : 'closed' };
  }
  if (elapsedH >= slaHours) {
    return { phase: 'late', elapsedH, leftH: 0, label: `${slaHours} h limit passed · owner told` };
  }
  const leftH = Math.max(1, Math.ceil(slaHours - elapsedH));
  return { phase: 'running', elapsedH, leftH, label: `within time · ${leftH} h left` };
}

/** A lead converts only when it has lines and every line has been sent one way or the other. */
export const isFullyRouted = (lead: Lead): boolean => lead.items.length > 0 && lead.items.every((i) => i.route !== null);
/** A converted lead is closed as an order; it cannot be marked lost. */
export function assertCanMarkLost(state: LeadState): void {
  if (state === 'converted') throw new DomainError('A converted lead cannot be marked lost.');
}
