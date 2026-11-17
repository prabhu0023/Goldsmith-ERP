import { Check, Search } from 'lucide-react';
import { useState } from 'react';
import { fmtG, netOf, sumG } from '../../domain/weights';
import { inStockPieces } from '../../store/selectors';
import { useStore } from '../../store/StoreProvider';
import type { CustomerGroup } from '../../types/jewellery';
import { Button, Card, Field, Input, Notice, PageHeader, SectionLabel, Select, ValueSlot, cn } from '../ui';
import { GROUPS, reachable } from './util';

type Audience = CustomerGroup | 'All';

/** Share a small showcase of pieces that are in stock. Photos and weights go; a price can join later through ValueSlot. */
export function CatalogueShare() {
  const { state, actions } = useStore();
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [audience, setAudience] = useState<Audience>('VIP Bridal');
  const [result, setResult] = useState<{ tone: 'live' | 'stop'; text: string } | null>(null);

  const stock = inStockPieces(state);
  const needle = q.trim().toLowerCase();
  const list = stock.filter((p) => !needle || [p.id, p.name, p.style, p.collection, p.kind, p.purity].some((f) => f.toLowerCase().includes(needle)));
  const chosen = picked.map((id) => stock.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
  const preview = chosen[0];
  const recipients = reachable(state.customers, audience);

  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);

  const send = () => {
    const r = actions.sendBroadcast({
      audience,
      message: 'Namaste {name}, here are a few pieces we thought you would like to see. Come and see them at the showroom.',
      pieceIds: chosen.map((p) => p.id),
    });
    setResult(
      r.ok
        ? { tone: 'live', text: `A showcase of ${chosen.length} ${chosen.length === 1 ? 'piece' : 'pieces'} went to ${recipients.length} opted-in customers. Replies land in the lead inbox.` }
        : { tone: 'stop', text: r.error ?? 'Could not send.' },
    );
  };

  const copyLink = async () => {
    const link = `https://jaigulabdev.example/showcase/${chosen.map((p) => p.id).join('-')}`;
    try {
      await navigator.clipboard.writeText(link);
      setResult({ tone: 'live', text: 'Link copied. Anyone who opens it sees these pieces with photos and weights.' });
    } catch {
      setResult({ tone: 'stop', text: 'This browser did not allow copying. Try again from a secure page.' });
    }
  };

  return (
    <div>
      <PageHeader title="Share a set of pieces" subtitle="Pick from in-stock pieces, make a little showcase, and send it. Photos and weights go, never a price." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section>
          <SectionLabel className="mb-3">
            Pick from what is in stock · {chosen.length} chosen
          </SectionLabel>
          <div className="relative mb-4">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by style, collection, weight, tag" aria-label="Filter pieces" className="pl-9" />
          </div>
          {list.length === 0 ? (
            <Card>
              <p className="text-[15px] text-ink-2">No piece in stock matches that.</p>
            </Card>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.slice(0, 36).map((p) => {
                const on = picked.includes(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(p.id)}
                      className={cn(
                        'relative flex h-full w-full flex-col overflow-hidden rounded-xl border bg-surface text-left transition hover:border-gold',
                        on ? 'border-gold ring-2 ring-gold' : 'border-line',
                      )}
                    >
                      {p.photos[0] ? <img src={p.photos[0]} alt="" className="h-32 w-full object-cover" /> : <div className="h-32 w-full bg-closed-soft" aria-hidden />}
                      {on && (
                        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[13px] font-semibold text-ink">
                          <Check size={14} aria-hidden /> Chosen
                        </span>
                      )}
                      <span className="block p-3">
                        <span className="block truncate text-[15px] font-semibold text-ink">{p.name}</span>
                        <span className="block text-sm text-ink-3">
                          <span className="font-mono">{p.id}</span> · {p.purity}
                        </span>
                        <span className="mt-1 block font-mono text-sm font-medium tabular text-ink">{fmtG(netOf(p))} g</span>
                        <ValueSlot value={p.valueINR} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {list.length > 36 && <p className="mt-3 text-sm text-ink-3">Showing the first 36 of {list.length}. Narrow the filter to see the rest.</p>}
        </section>

        <aside className="space-y-6">
          <Card>
            <SectionLabel className="mb-2">How to send it</SectionLabel>
            <h2 className="text-[15px] font-semibold text-ink">
              A showcase of {chosen.length} {chosen.length === 1 ? 'piece' : 'pieces'}
            </h2>
            <p className="mb-4 text-sm text-ink-3">{fmtG(sumG(chosen.map((p) => netOf(p))))} g of pure gold across them · no price shown</p>
            <Field label="Send to a broadcast audience" hint={`${recipients.length} opted-in will receive it.`}>
              <Select value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
                <option value="All">Everyone</option>
                {GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" disabled={chosen.length === 0 || recipients.length === 0} onClick={send}>
                Send showcase
              </Button>
              <Button disabled={chosen.length === 0} onClick={copyLink}>
                Copy a link
              </Button>
            </div>
            <p className="mt-3 text-[13px] text-ink-3">Replies land in the lead inbox as new leads.</p>
          </Card>
          {result && <Notice tone={result.tone}>{result.text}</Notice>}

          <div>
            <SectionLabel className="mb-3">What a piece looks like to them</SectionLabel>
            {preview ? (
              <Card padded={false} className="overflow-hidden">
                {preview.photos[0] && <img src={preview.photos[0]} alt="" className="h-40 w-full object-cover" />}
                <div className="space-y-1 p-4">
                  <p className="text-[15px] font-semibold text-ink">{preview.name}</p>
                  <p className="text-sm text-ink-3">
                    {preview.purity}
                    {preview.style && <> · {preview.style}</>}
                    {preview.collection && <> · {preview.collection}</>}
                  </p>
                  <p className="pt-1 text-sm text-ink-3">Pure gold</p>
                  <p className="font-mono text-xl font-semibold tabular text-ink">{fmtG(netOf(preview))} g</p>
                  <ValueSlot value={preview.valueINR} label="Value at today's rate" />
                </div>
              </Card>
            ) : (
              <Card>
                <p className="text-sm text-ink-3">Choose a piece to see its card.</p>
              </Card>
            )}
            <p className="mt-3 text-[13px] text-ink-3">
              Only in-stock pieces can be shared, so nothing sold or scrapped ever goes out. A price can appear here later without changing the layout.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
