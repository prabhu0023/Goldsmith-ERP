import type { ReactNode } from 'react';
import type { Customer, CustomerGroup } from '../../types/jewellery';

export const GROUPS: CustomerGroup[] = ['VIP Bridal', 'High net worth', 'Regular', 'Wholesale'];

/** The first word of a name, for "Namaste Meera". */
export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

/** Puts a real name where {name} sits. */
export const fillName = (template: string, name: string): string => template.replace(/\{name\}/g, firstName(name));

/** Customers an audience would reach: opted in, and in the group when one is chosen. */
export const reachable = (customers: Customer[], audience: CustomerGroup | 'All'): Customer[] =>
  customers.filter((c) => c.optedIn && (audience === 'All' || c.group === audience));

/** What a message looks like on the customer's phone. */
export function PhonePreview({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-xs rounded-[28px] border-4 border-closed bg-closed-soft p-3">
      <div className="flex items-center gap-2 rounded-t-xl bg-live px-3 py-2 text-white">
        <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-bold text-live">
          JGD
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold">Jai Gulab Dev Jewellers</span>
          <span className="block text-[13px] opacity-90">business account</span>
        </span>
      </div>
      <div className="min-h-40 space-y-2 rounded-b-xl bg-paper p-3">
        <div className="rounded-lg rounded-tl-none bg-surface p-3 text-sm leading-relaxed text-ink shadow-sm">{children}</div>
        {footer}
      </div>
    </div>
  );
}
