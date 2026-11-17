import { ArrowLeft, Check } from 'lucide-react';
import { useState } from 'react';
import { DAY, startOfDay } from '../../domain/clock';
import { fmtG, parseWeight, round4 } from '../../domain/weights';
import { imageList } from '../../data/images';
import { useStore } from '../../store/StoreProvider';
import type { Karigar, Lead, LeadItem } from '../../types/jewellery';
import { Button, Card, Field, Input, Notice, PageHeader, SectionLabel, Select, Textarea, cn } from '../ui';
import { fromDateInput, toDateInput } from './util';

const words = (t: string): string[] => t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

export function OrderCopyBuilder() {
  const { state, route, go } = useStore();
  const lead = state.leads.find((l) => l.id === route.params?.leadId);
  const item = lead?.items.find((i) => i.id === route.params?.itemId);
  if (!lead || !item) {
    return (
      <div>
        <PageHeader title="Order copy to a karigar" />
        <Card>
          <p className="mb-3 text-[15px] text-ink-2">Choose a lead and the item to make first.</p>
          <Button onClick={() => go('leads')}>Back to leads</Button>
        </Card>
      </div>
    );
  }
  if (item.route) {
    return (
      <div>
        <PageHeader title="Order copy to a karigar" />
        <Card>
          <p className="mb-3 text-[15px] text-ink-2">This item has already been routed.</p>
          <Button onClick={() => go('lead-convert', { leadId: lead.id })}>Back to the lead</Button>
        </Card>
      </div>
    );
  }
  return <Builder key={item.id} lead={lead} item={item} />;
}

function pickKarigar(karigars: Karigar[], item: LeadItem): string {
  const style = item.style.toLowerCase();
  const hit = style ? karigars.find((k) => k.specialty.toLowerCase().includes(style)) : undefined;
  return (hit ?? karigars[0])?.id ?? '';
}

function Builder({ lead, item }: { lead: Lead; item: LeadItem }) {
  const { state, actions, go, now } = useStore();
  const [imageIds, setImageIds] = useState<string[]>(() => {
    const w = words(`${item.name} ${item.style}`);
    return imageList.filter((im) => words(im.label).some((x) => w.includes(x))).map((im) => im.id);
  });
  const [brief, setBrief] = useState(`${item.name}${item.style ? ` · ${item.style}` : ''}. `);
  const [qty, setQty] = useState(String(item.qty));
  const [purity, setPurity] = useState('22K');
  const [gross, setGross] = useState(item.approxWeightG === null ? '' : String(item.approxWeightG));
  const [net, setNet] = useState('');
  const [tolMg, setTolMg] = useState('500');
  const [karigarId, setKarigarId] = useState(() => pickKarigar(state.karigars, item));
  const [due, setDue] = useState(() => {
    const day = lead.neededBy !== null ? lead.neededBy - 3 * DAY : startOfDay(now) + 14 * DAY;
    return toDateInput(Math.max(day, startOfDay(now)));
  });
  const [goldText, setGoldText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const karigar = state.karigars.find((k) => k.id === karigarId);
  const qtyN = Number(qty);
  const grossG = parseWeight(gross);
  const autoGold =
    karigar && grossG !== null && Number.isInteger(qtyN) && qtyN > 0 ? round4(qtyN * grossG * (1 + karigar.wastagePct / 100)) : null;
  const goldShown = goldText ?? (autoGold === null ? '' : autoGold.toFixed(4));
  const goldG = parseWeight(goldShown);
  const overPool = goldG !== null && goldG > state.pool.balanceG;

  const toggleImage = (id: string) => setImageIds(imageIds.includes(id) ? imageIds.filter((x) => x !== id) : [...imageIds, id]);

  const send = () => {
    setError(null);
    if (!brief.trim()) return setError('Write the brief the karigar will read.');
    if (!Number.isInteger(qtyN) || qtyN < 1) return setError('How many pieces? Enter a whole number.');
    if (grossG === null || grossG <= 0) return setError('Enter the weight the finished piece should have, in grams.');
    const netG = parseWeight(net);
    if (netG === null || netG <= 0) return setError('Enter the gold inside the finished piece, after stones, in grams.');
    if (netG > grossG) return setError('The gold inside cannot be more than the whole piece.');
    const tol = Number(tolMg);
    if (!Number.isFinite(tol) || tol < 0) return setError('Allowed to be off by: enter milligrams, such as 500.');
    if (!karigarId) return setError('Pick who makes it.');
    const dueDate = fromDateInput(due);
    if (dueDate === null) return setError('Pick a due date.');
    if (goldG === null) return setError('Enter the gold to issue, in grams.');
    const r = actions.createOrderCopyAndJob({
      leadId: lead.id,
      leadItemId: item.id,
      title: item.name,
      style: item.style,
      refImages: imageList.filter((im) => imageIds.includes(im.id)).map((im) => im.src),
      brief: brief.trim(),
      qty: qtyN,
      purity,
      targetGrossG: grossG,
      targetNetG: netG,
      toleranceG: tol / 1000,
      karigarId,
      dueDate,
      goldIssuedG: goldG,
    });
    if (!r.ok) return setError(r.error ?? 'Could not send the order copy.');
    go('lead-convert', { leadId: lead.id, sent: r.id ?? '' });
  };

  return (
    <div>
      <Button variant="quiet" icon={<ArrowLeft size={16} />} onClick={() => go('lead-convert', { leadId: lead.id })} className="mb-2 -ml-3">
        Back to the lead
      </Button>
      <PageHeader
        title="Order copy to a karigar"
        subtitle={`From the ${lead.title.split(' · ')[0]} lead · ${item.qty} × ${item.name}${item.style ? `, ${item.style}` : ''} · this becomes a job on the karigar’s phone`}
      />

      <div className="space-y-5">
        <Card>
          <SectionLabel className="mb-3">What you send · images and the brief</SectionLabel>
          <p className="mb-2 text-sm font-semibold text-ink-2">
            Reference images · {imageIds.length} attached
          </p>
          <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {imageList.map((im) => {
              const on = imageIds.includes(im.id);
              return (
                <li key={im.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleImage(im.id)}
                    className={cn('relative block w-full overflow-hidden rounded-lg border-2 text-left', on ? 'border-gold' : 'border-line hover:border-line-2')}
                  >
                    <img src={im.src} alt={im.label} className="aspect-square w-full object-cover" />
                    <span className="block bg-surface px-2 py-1.5 text-[13px] font-medium text-ink-2">{im.label}</span>
                    {on && (
                      <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-gold text-ink">
                        <Check size={14} aria-hidden />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <Field label="The brief, in your words and theirs">
            <Textarea className="min-h-32" value={brief} onChange={(e) => setBrief(e.target.value)} />
          </Field>
        </Card>

        <Card>
          <SectionLabel className="mb-3">The targets and who makes it</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="How many">
              <Input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
            <Field label="Purity">
              <Select value={purity} onChange={(e) => setPurity(e.target.value)}>
                <option value="22K">22K (916)</option>
                <option value="18K">18K (750)</option>
              </Select>
            </Field>
            <Field label="Finished piece should weigh (g)" hint="each">
              <Input inputMode="decimal" className="font-mono" value={gross} onChange={(e) => setGross(e.target.value)} placeholder="80.0000" />
            </Field>
            <Field label="Gold inside it, after stones (g)" hint="each">
              <Input inputMode="decimal" className="font-mono" value={net} onChange={(e) => setNet(e.target.value)} placeholder="70.0000" />
            </Field>
            <Field label="Allowed to be off by (± mg)" hint="on the finished weight">
              <Input inputMode="numeric" className="font-mono" value={tolMg} onChange={(e) => setTolMg(e.target.value)} />
            </Field>
          </div>

          <p className="mb-2 mt-5 text-sm font-semibold text-ink-2">Who makes it</p>
          <div role="radiogroup" aria-label="Who makes it" className="grid gap-3 md:grid-cols-3">
            {state.karigars.map((k) => {
              const on = k.id === karigarId;
              return (
                <button
                  key={k.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setKarigarId(k.id)}
                  className={cn('min-h-14 rounded-xl border-2 p-3 text-left', on ? 'border-gold bg-gold-soft' : 'border-line bg-surface hover:border-line-2')}
                >
                  <span className="block text-[15px] font-semibold text-ink">
                    {k.name} · {k.id}
                  </span>
                  <span className="block text-sm text-ink-3">
                    {k.specialty} specialist · {k.wastagePct}% loss allowed · {k.lateDays < 1 ? 'usually on time' : `about ${Math.round(k.lateDays)} days late`}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <SectionLabel className="mb-3">The due date and the gold you hand over</SectionLabel>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Due date" hint={lead.neededBy !== null ? '3 days before the customer needs it, for QC' : 'No date from the customer, so two weeks from today'}>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </Field>
            <Field
              label={`Pure gold issued${karigar ? ` to ${karigar.name.split(' ')[0]}` : ''} (g)`}
              hint={
                autoGold !== null && karigar
                  ? `${fmtG(round4(qtyN * (grossG ?? 0)))} g target + ${karigar.wastagePct}% wastage, from the metal pool`
                  : 'Fills in once you give how many and the weight'
              }
              error={overPool ? `The metal pool only has ${fmtG(state.pool.balanceG)} g.` : undefined}
            >
              <Input inputMode="decimal" className="font-mono" value={goldShown} onChange={(e) => setGoldText(e.target.value)} />
            </Field>
          </div>
          <p className="mt-3 text-sm text-ink-3">Metal pool right now: {fmtG(state.pool.balanceG)} g.</p>
        </Card>

        {error && <Notice tone="stop">{error}</Notice>}

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" onClick={send} disabled={overPool}>
            Send the order copy
          </Button>
          <p className="text-sm text-ink-3">
            {karigar ? `Lands on ${karigar.name.split(' ')[0]}’s phone to accept.` : 'Pick who makes it.'}
          </p>
        </div>
        <p className="max-w-3xl text-sm text-ink-3">
          On send this becomes a karigar job: they accept and confirm the date, work it, mark it ready, and hand it over as a parcel. The gold issued is drawn from the metal pool, including anything recovered from scrapped pieces, and settled against this job when the parcel is reconciled.
        </p>
      </div>
    </div>
  );
}
