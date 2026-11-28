import { CUSTOMER_GROUPS } from '@goldsmith/shared';
import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { pagedBoundaryQuery, usePagedQuery } from '../../query/use-paged-query';
import { useNavigation } from '../../shell/navigation';
import { useSession } from '../../shell/session-context';
import { Button, Card, Input, PageHeader, Pill, QueryBoundary, ReadError, SectionLabel, StatusChip, cn } from '../ui';
import { ValueSlot } from '../ui/ValueSlot';
import { CustomerDrawer } from './CustomerDrawer';
import { formatCustomerPhone, piecesLabel } from './customer-rows';
import type { CustomerGroup } from './customer-rows';
/** How long typing pauses before the search is sent (EP-17-S8). */
const SEARCH_DELAY_MS = 250;
/** The text after it has stopped changing for `delayMs`. */
function useDebounced(value: string, delayMs: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
/** The customer directory (EP-17-S8). Staff and the owner. History is by tag and grams; budget and spend sit behind ValueSlot. */
export function Customers() {
  const { can } = useSession();
  if (!can('listCustomers')) {
    return (
      <div>
        <PageHeader title="Customers" />
        <Card>
          <p className="text-[15px] text-ink-2">Your role cannot see the customer list.</p>
        </Card>
      </div>
    );
  }
  return <CustomerDirectory />;
}
function CustomerDirectory() {
  const { go, route } = useNavigation();
  const { can } = useSession();
  const [text, setText] = useState('');
  const [group, setGroup] = useState<CustomerGroup | 'All'>('All');
  const [selected, setSelected] = useState<string | null>(route.params?.customerId ?? null);
  const search = useDebounced(text.trim(), SEARCH_DELAY_MS);
  // A changed search or group starts a new page chain.
  const list = usePagedQuery({ op: 'listCustomers', input: { ...(search ? { search } : {}), ...(group === 'All' ? {} : { group }) } });
  const rows = list.items;
  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Who they are, when to wish them, and what they have taken home by weight."
        actions={
          can('createCustomer') ? (
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => go('customer-new')}>
              Add a customer
            </Button>
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" aria-hidden />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search name, phone or city" aria-label="Search customers" className="pl-9" />
        </div>
        <div role="group" aria-label="Group" className="flex flex-wrap gap-2">
          {(['All', ...CUSTOMER_GROUPS] as const).map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={group === g}
              onClick={() => setGroup(g)}
              className={cn(
                'min-h-10 rounded-full border px-3 text-sm font-semibold',
                group === g ? 'border-gold bg-gold-soft text-gold-ink' : 'border-line-2 bg-surface text-ink-3 hover:bg-paper',
              )}
            >
              {g}
            </button>
          ))}
        </div>
      </div>
      <QueryBoundary label="customer list" query={pagedBoundaryQuery(list)}>
        {rows.length === 0 ? (
          <Card>
            <p className="text-[15px] text-ink-2">Nobody matches that. Clear the search or add them as a new customer.</p>
          </Card>
        ) : (
          <>
            <SectionLabel className="mb-3">{rows.length} shown</SectionLabel>
            <ul className="space-y-2">
              {rows.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(c.id)}
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface p-4 text-left transition hover:border-gold"
                  >
                    <span className="min-w-[12rem] flex-1">
                      <span className="block text-[15px] font-semibold text-ink">{c.name}</span>
                      <span className="block text-sm text-ink-3">
                        {formatCustomerPhone(c.phone)}
                        {c.city && ` · ${c.city}`}
                      </span>
                    </span>
                    <Pill>{c.group}</Pill>
                    {!c.optedIn && <StatusChip tone="closed" label="Not opted in" />}
                    <span className="w-28 text-right text-sm text-ink-3">{piecesLabel(c.pieceCount)}</span>
                    <span className="w-36 text-right font-mono text-sm font-medium text-ink tabular">{c.takenHomeG} g</span>
                    <ValueSlot value={null} label="Spend" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </QueryBoundary>
      {list.loadMoreError && (
        <div className="mt-3">
          <ReadError message={list.loadMoreError.message} code={list.loadMoreError.code} onRetry={list.loadMore} />
        </div>
      )}
      {list.loadingMore && <p className="mt-3 text-sm text-ink-3">Loading the customer list…</p>}
      {list.hasMore && !list.loadingMore && !list.loadMoreError && (
        <div className="mt-4">
          <Button onClick={list.loadMore}>Load more</Button>
        </div>
      )}
      {selected && <CustomerDrawer key={selected} customerId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
