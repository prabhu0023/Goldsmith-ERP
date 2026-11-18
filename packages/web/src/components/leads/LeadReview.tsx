import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { fmtDate, fmtTime } from '@goldsmith/shared';
import { slaState } from '@goldsmith/shared';
import { useStore } from '../../store/StoreProvider';
import type { Lead } from '@goldsmith/shared';
import { Button, Card, Field, Input, Notice, PageHeader, SectionLabel, StatusChip } from '../ui';
import { ItemsEditor, parseRows, rowsFromItems } from './ItemsEditor';
import { fromDateInput, sourceLabel, toDateInput } from './util';

function Sure({ flagged }: { flagged: boolean }) {
  return flagged ? <StatusChip tone="wait" label="Check this" /> : <StatusChip tone="live" label="Sure" />;
}

export function LeadReview() {
  const { state, route, go } = useStore();
  const lead = state.leads.find((l) => l.id === route.params?.leadId);
  if (!lead) {
    return (
      <div>
        <PageHeader title="Check a lead" />
        <Card>
          <p className="mb-3 text-[15px] text-ink-2">That lead was not found.</p>
          <Button onClick={() => go('leads')}>Back to leads</Button>
        </Card>
      </div>
    );
  }
  return <ReviewForm key={lead.id} lead={lead} />;
}

function ReviewForm({ lead }: { lead: Lead }) {
  const { state, actions, go, now } = useStore();
  const [customer, setCustomer] = useState(lead.customerName);
  const [phone, setPhone] = useState(lead.phone);
  const [needed, setNeeded] = useState(toDateInput(lead.neededBy));
  const [rows, setRows] = useState(() => rowsFromItems(lead.items));
  const [error, setError] = useState<string | null>(null);

  const flagged = (key: string) => lead.fields.some((f) => f.key === key && f.flagged);
  const unreadable = lead.confidence === 'unreadable';
  const sla = slaState(lead, now, state.settings.leadSlaHours);
  const flaggedN = lead.fields.filter((f) => f.flagged).length;
  const open = lead.state !== 'needs_glance';

  const keep = () => {
    if (!customer.trim()) return setError('Add the customer name.');
    const parsed = parseRows(rows);
    if (parsed.error) return setError(parsed.error);
    if (parsed.items.length === 0) return setError('Add at least one item the customer wants.');
    const neededBy = needed ? fromDateInput(needed) : null;
    if (needed && neededBy === null) return setError('The needed-by date is not a valid date.');
    const items = parsed.items.map((it, i) => ({
      id: it.id ?? `LI-${lead.id}-n${i + 1}`,
      name: it.name,
      style: it.style,
      qty: it.qty,
      approxWeightG: it.approxWeightG,
      route: null,
    }));
    const r = actions.confirmLead({ leadId: lead.id, patch: { customerName: customer.trim(), phone: phone.trim(), neededBy, items } });
    if (!r.ok) return setError(r.error ?? 'Could not keep this lead.');
    go('lead-convert', { leadId: lead.id });
  };

  const notAnOrder = () => {
    const r = actions.markLeadLost({ leadId: lead.id, reason: 'Not an order' });
    if (!r.ok) return setError(r.error ?? 'Could not close this lead.');
    go('leads');
  };

  return (
    <div>
      <Button variant="quiet" icon={<ArrowLeft size={16} />} onClick={() => go('leads')} className="mb-2 -ml-3">
        All leads
      </Button>
      <PageHeader
        title={lead.title.split(' · ')[0] + (unreadable ? '' : ' enquiry')}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {unreadable ? <StatusChip tone="stop" label="Please check" /> : lead.confidence === 'unsure' ? <StatusChip tone="wait" label={`${flaggedN} field${flaggedN === 1 ? '' : 's'} to confirm`} /> : <StatusChip tone="live" label="Read cleanly" />}
            <span className={sla.phase === 'late' ? 'font-semibold text-stop' : ''}>{sla.label}</span>
          </span>
        }
      />

      {open && <div className="mb-4"><Notice tone="wait">This lead has already been opened. Changes here are not saved.</Notice></div>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <SectionLabel className="mb-3">What they sent · {sourceLabel[lead.source]}</SectionLabel>
          <blockquote className="whitespace-pre-wrap rounded-lg border border-line bg-paper p-4 text-[15px] leading-relaxed text-ink-2">
            {lead.message || 'No message.'}
          </blockquote>
          <p className="mt-3 text-sm text-ink-3">
            received {fmtTime(lead.arrivedAt)}, {fmtDate(lead.arrivedAt)}
            {lead.phone ? ` · ${lead.phone}` : ''}
          </p>
          {unreadable && (
            <p className="mt-3 text-sm font-semibold text-stop">
              The system could not read this. Look at the original, type in what they want, or close it as not an order.
            </p>
          )}
        </Card>

        <Card className="space-y-5">
          <SectionLabel>What the system pulled out · fix anything wrong</SectionLabel>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Field label="Customer">
                <Input value={customer} onChange={(e) => setCustomer(e.target.value)} />
              </Field>
              <div className="mt-1.5"><Sure flagged={flagged('customer') || unreadable} /></div>
            </div>
            <div>
              <Field label="Phone">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <div className="mt-1.5"><Sure flagged={flagged('phone')} /></div>
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm font-semibold text-ink-2">Wants</p>
            <ItemsEditor rows={rows} onChange={setRows} weightFlagged={flagged('weight')} />
            <div className="mt-1.5"><Sure flagged={flagged('items') || unreadable} /></div>
          </div>

          <div className="max-w-xs">
            <Field label="Needed by">
              <Input type="date" value={needed} onChange={(e) => setNeeded(e.target.value)} />
            </Field>
            <div className="mt-1.5"><Sure flagged={flagged('neededBy')} /></div>
          </div>

          {error && <Notice tone="stop">{error}</Notice>}

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button variant="primary" onClick={keep} disabled={open}>
              Looks right — keep the lead
            </Button>
            <Button variant="secondary" onClick={notAnOrder} disabled={open}>
              Not an order
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
