import type { Lead, LeadSource } from '@goldsmith/shared';

/** "2026-11-20" for an <input type="date">; empty when there is no date. */
export function toDateInput(at: number | null): string {
  if (at === null) return '';
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Local midnight for a YYYY-MM-DD value; null when empty or malformed. */
export function fromDateInput(text: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

export const sourceLabel: Record<LeadSource, string> = {
  whatsapp: 'from WhatsApp',
  email: 'by email',
  counter: 'typed at the counter',
};

/** Fields the system flagged for a person to check. */
export const flaggedCount = (lead: Lead): number => lead.fields.filter((f) => f.flagged).length;

export const firstName = (name: string): string => name.split(/\s+/)[0] ?? name;

/** "2 × Temple Haram, 1 × Kundan Choker". */
export const itemsLine = (lead: Lead): string => lead.items.map((i) => `${i.qty} × ${i.name}`).join(', ');
