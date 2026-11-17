import { Lock, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { fmtDateTime } from '../../domain/clock';
import { fmtG, netOf, sumG } from '../../domain/weights';
import { useStore } from '../../store/StoreProvider';
import type { Piece } from '../../types/jewellery';
import { Button, Card, Field, Input, Notice, PageHeader, SectionLabel, Select, ValueSlot } from '../ui';

/** Screen 06: which pieces left the showcase, who sold them, and the reference from the billing book. No prices. */
export function StockOut() {
  const { state, actions, go, route, actor } = useStore();
  const [ids, setIds] = useState<string[]>(() => (route.params?.pieceId ? [route.params.pieceId] : []));
  const [scan, setScan] = useState('');
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [ref, setRef] = useState('');
  const [invoice, setInvoice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ n: number; gold: number; invoice: string } | null>(null);

  const sellers = state.staff;
  const seller = sellerId ?? (sellers.some((m) => m.id === actor.id) ? actor.id : (sellers[0]?.id ?? ''));
  const pieces = ids.map((id) => state.pieces.find((p) => p.id === id)).filter((p): p is Piece => !!p);
  const pure = sumG(pieces.map((p) => netOf(p)));
  const forSale = state.pieces.filter((p) => p.status === 'in_stock' && !ids.includes(p.id));

  const add = () => {
    setError(null);
    const t = scan.trim().toUpperCase();
    if (!t) return;
    const hit = state.pieces.find((p) => p.id.toUpperCase() === t || p.huid.toUpperCase() === t);
    if (!hit) return setError(`No piece has the tag or HUID ${t}.`);
    if (hit.status !== 'in_stock') return setError(`${hit.id} is not in stock, so it cannot go out.`);
    if (ids.includes(hit.id)) return setError(`${hit.id} is already on the list.`);
    setIds([...ids, hit.id]);
    setScan('');
  };

  const submit = () => {
    setError(null);
    const r = actions.stockOut({ pieceIds: ids, ref, invoiceNo: invoice, sellerId: seller });
    if (!r.ok) return setError(r.error ?? 'Could not record it.');
    setDone({ n: ids.length, gold: pure, invoice: invoice.trim() });
    setIds([]);
    setRef('');
    setInvoice('');
  };

  const recent = state.stockOuts.slice(0, 4);

  return (
    <div>
      <PageHeader
        title="A piece is leaving · stock-out"
        subtitle="Record which pieces went out, who sold them, and the reference from your billing book. No prices here. That is kept elsewhere."
      />
      {done && (
        <div className="mb-5">
          <Notice tone="live">
            Done. {done.n} piece{done.n === 1 ? '' : 's'} · {fmtG(done.gold)} g pure gold are out and locked. Tax invoice {done.invoice}.
          </Notice>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card>
            <SectionLabel className="mb-3">What is leaving the showcase</SectionLabel>
            {pieces.length === 0 ? (
              <p className="text-[15px] text-ink-2">Nothing yet. Scan a tag or type it below.</p>
            ) : (
              <ul className="divide-y divide-line">
                {pieces.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                    {p.photos[0] && <img src={p.photos[0]} alt="" className="h-12 w-12 rounded-lg object-cover" />}
                    <div className="min-w-[10rem] flex-1">
                      <p className="text-[15px] font-semibold text-ink">{p.name}</p>
                      <p className="text-sm text-ink-3">
                        <span className="font-mono">{p.id}</span> · {p.purity} · <span className="font-mono">{p.huid || 'no HUID'}</span>
                      </p>
                      {p.heldForLeadId && <p className="text-sm font-semibold text-wait">Held for a customer</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink-4">Pure gold</p>
                      <p className="font-mono text-lg font-medium tabular text-ink">{fmtG(netOf(p))} g</p>
                      <ValueSlot value={p.valueINR} />
                    </div>
                    <Button variant="ghost" size="sm" icon={<X size={16} />} aria-label={`Remove ${p.id}`} onClick={() => setIds(ids.filter((x) => x !== p.id))} />
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <Field label="Scan another tag" className="min-w-[14rem] flex-1">
                <Input
                  list="in-stock-tags"
                  value={scan}
                  onChange={(e) => setScan(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      add();
                    }
                  }}
                  placeholder="TAG-8841 or the HUID"
                  className="font-mono"
                />
              </Field>
              <datalist id="in-stock-tags">
                {forSale.slice(0, 80).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </datalist>
              <Button icon={<Plus size={16} />} onClick={add}>
                Add it
              </Button>
            </div>
            <div className="mt-5 flex flex-wrap items-baseline justify-between gap-3 border-t border-line pt-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-ink-4">Leaving the floor</p>
                <p className="font-mono text-2xl font-semibold tabular text-ink">{fmtG(pure)} g</p>
                <p className="text-sm text-ink-3">
                  pure gold · {pieces.length} piece{pieces.length === 1 ? '' : 's'}
                </p>
              </div>
              <ValueSlot value={null} label="Total value" />
            </div>
          </Card>

          <Card>
            <SectionLabel className="mb-3">The record</SectionLabel>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Who sold it" hint="Goes to their count, for later gamification.">
                <Select value={seller} onChange={(e) => setSellerId(e.target.value)}>
                  {sellers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Reference number">
                <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="REF-2026-1182" className="font-mono" />
              </Field>
              <Field label="Tax invoice number · from your billing book" hint="A reference only. This app does not hold the amount." className="sm:col-span-2">
                <Input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="INV-2026-0855" className="font-mono" />
              </Field>
            </div>
            <div className="mt-5 flex gap-3 rounded-lg border border-line bg-paper p-3 text-sm text-ink-2">
              <Lock size={18} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
              <div>
                <p className="font-semibold text-ink">This locks the pieces for good</p>
                <p>Once out, their weights freeze. No edit, not even by the owner.</p>
              </div>
            </div>
            {error && (
              <div className="mt-4">
                <Notice tone="stop">{error}</Notice>
              </div>
            )}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-2">
                {pieces.length} piece{pieces.length === 1 ? '' : 's'} · {fmtG(pure)} g pure gold{ref.trim() && invoice.trim() ? ` · ${invoice.trim()}` : ''}
              </p>
              <Button variant="primary" size="lg" disabled={pieces.length === 0} onClick={submit}>
                Take them out of stock
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <SectionLabel className="mb-3">Two ways a piece leaves stock</SectionLabel>
            <div className="space-y-4 text-sm text-ink-2">
              <div>
                <p className="text-[15px] font-semibold text-ink">Product out · here</p>
                <p>The piece is sold and physically leaves. Seller, reference and invoice number are recorded. Staff do this themselves. No owner needed.</p>
              </div>
              <div>
                <p className="text-[15px] font-semibold text-ink">Scrap · owner only</p>
                <p>The piece is melted, its gold back to the pool. Staff can request it from the piece; only the owner marks it scrap. Then the metal is free to issue to a karigar again.</p>
                <Button variant="quiet" size="sm" className="-ml-3 mt-1" onClick={() => go('stock')}>
                  Open showroom stock
                </Button>
              </div>
            </div>
          </Card>
          {recent.length > 0 && (
            <Card>
              <SectionLabel className="mb-3">Recently recorded</SectionLabel>
              <ul className="space-y-3">
                {recent.map((o) => (
                  <li key={o.id} className="text-sm text-ink-2">
                    <p className="font-semibold text-ink">
                      {o.pieceIds.length} piece{o.pieceIds.length === 1 ? '' : 's'} · <span className="font-mono">{o.invoiceNo}</span>
                    </p>
                    <p className="text-ink-3">
                      {o.sellerName} · <span className="font-mono">{o.ref}</span> · {fmtDateTime(o.at)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
