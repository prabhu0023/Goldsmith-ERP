import { ArrowLeft, Check } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../../store/StoreProvider';
import { Button, Card, Field, Input, Notice, PageHeader, SectionLabel, Textarea } from '../ui';
import { ItemsEditor, blankRow, parseRows } from './ItemsEditor';
import { fromDateInput } from './util';

export function LeadCreate() {
  const { state, actions, go } = useStore();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [rows, setRows] = useState(() => [blankRow()]);
  const [note, setNote] = useState('');
  const [needed, setNeeded] = useState('');
  const [error, setError] = useState<string | null>(null);

  const known = state.customers.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());

  const onName = (v: string) => {
    setName(v);
    const match = state.customers.find((c) => c.name.trim().toLowerCase() === v.trim().toLowerCase());
    if (match && !phone.trim()) setPhone(match.phone);
  };

  const create = () => {
    setError(null);
    const parsed = parseRows(rows);
    if (parsed.error) return setError(parsed.error);
    const neededBy = needed ? fromDateInput(needed) : null;
    if (needed && neededBy === null) return setError('The needed-by date is not a valid date.');
    const r = actions.createLead({
      customerName: name,
      phone,
      items: parsed.items.map((i) => ({ name: i.name, style: i.style, qty: i.qty, approxWeightG: i.approxWeightG })),
      neededBy,
      note,
    });
    if (!r.ok) return setError(r.error ?? 'Could not create the lead.');
    go('lead-convert', { leadId: r.id ?? '' });
  };

  return (
    <div>
      <Button variant="quiet" icon={<ArrowLeft size={16} />} onClick={() => go('leads')} className="mb-2 -ml-3">
        All leads
      </Button>
      <PageHeader title="Add a lead by hand" subtitle="A walk-in or a phone call. Nothing to read, so nothing to check." />

      <Card className="max-w-3xl space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Field label="Who is it?">
              <Input list="known-customers" value={name} onChange={(e) => onName(e.target.value)} placeholder="Mrs Nair" />
            </Field>
            <datalist id="known-customers">
              {state.customers.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
            {known && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-live">
                <Check size={14} aria-hidden /> known customer
              </p>
            )}
          </div>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 94440 22189" />
          </Field>
        </div>

        <div>
          <SectionLabel className="mb-2">What do they want?</SectionLabel>
          <ItemsEditor rows={rows} onChange={setRows} />
        </div>

        <Field label="Anything else they said">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="A little lighter. Likes green meena." />
        </Field>

        <Field label="Needed by (if they said)" className="max-w-xs" hint="Leave empty when no date was given.">
          <Input type="date" value={needed} onChange={(e) => setNeeded(e.target.value)} />
        </Field>

        <div className="rounded-lg border border-gold/40 bg-gold-soft p-4">
          <p className="text-[15px] font-semibold text-ink">This becomes a lead straight away</p>
          <p className="mt-0.5 text-sm text-ink-2">It joins the same list and starts the same {state.settings.leadSlaHours}-hour clock.</p>
        </div>

        {error && <Notice tone="stop">{error}</Notice>}

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={create}>
            Create the lead
          </Button>
          <Button variant="secondary" onClick={() => go('leads')}>
            Cancel
          </Button>
        </div>
      </Card>

      <p className="mt-4 max-w-3xl text-sm text-ink-3">
        After either screen, the lead is worked the same way, and converting it is the next step: sell from stock, or send an order copy to a karigar.
      </p>
    </div>
  );
}
