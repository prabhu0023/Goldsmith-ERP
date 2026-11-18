import { ArrowLeft, Hammer, PackageCheck } from 'lucide-react';
import { useState } from 'react';
import { fmtDayMonth } from '@goldsmith/shared';
import { fmtG, netOf } from '@goldsmith/shared';
import { useStore } from '../../store/StoreProvider';
import type { AppState, Lead, LeadItem, Piece } from '@goldsmith/shared';
import { Button, Card, Modal, Notice, PageHeader, Pill, SectionLabel, Select, StatusChip, Textarea } from '../ui';
import { itemsLine } from './util';

const words = (t: string): string[] => t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

/** In-stock, unheld pieces that look like what the customer described: same kind, and close in weight when a weight was given. */
export function stockMatches(s: AppState, item: LeadItem): Piece[] {
  const want = item.name.toLowerCase();
  return s.pieces.filter((p) => {
    if (p.status !== 'in_stock' || p.heldForLeadId) return false;
    const kind = p.kind.toLowerCase();
    const sameKind = kind.includes(want) || want.includes(kind) || (words(item.name).length > 0 && words(item.name).every((w) => kind.includes(w)));
    if (!sameKind) return false;
    if (item.approxWeightG === null) return true;
    const within = (g: number) => Math.abs(g - item.approxWeightG!) <= item.approxWeightG! * 0.2;
    return within(netOf(p)) || within(p.grossG);
  });
}

export function ConvertLead() {
  const { state, route, go } = useStore();
  const lead = state.leads.find((l) => l.id === route.params?.leadId);
  if (!lead) {
    return (
      <div>
        <PageHeader title="Convert a lead" />
        <Card>
          <p className="mb-3 text-[15px] text-ink-2">That lead was not found.</p>
          <Button onClick={() => go('leads')}>Back to leads</Button>
        </Card>
      </div>
    );
  }
  return <ConvertBody lead={lead} sentJobId={route.params?.sent ?? null} />;
}

function ConvertBody({ lead, sentJobId }: { lead: Lead; sentJobId: string | null }) {
  const { state, actions, go } = useStore();
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [lostOpen, setLostOpen] = useState(false);
  const [reason, setReason] = useState('');

  const routed = lead.items.filter((i) => i.route).length;
  const closed = lead.state === 'converted' || lead.state === 'lost';
  const glance = lead.state === 'needs_glance';
  const sentJob = sentJobId ? state.jobs.find((j) => j.id === sentJobId) : undefined;

  const hold = (item: LeadItem, pieceId: string) => {
    setError(null);
    const r = actions.routeLeadItemToStock({ leadId: lead.id, itemId: item.id, pieceId });
    if (!r.ok) setError(r.error ?? 'Could not hold that piece.');
  };
  const release = (item: LeadItem) => {
    setError(null);
    const r = actions.releaseHold({ leadId: lead.id, itemId: item.id });
    if (!r.ok) setError(r.error ?? 'Could not release the hold.');
  };
  const markLost = () => {
    const r = actions.markLeadLost({ leadId: lead.id, reason: reason.trim() || undefined });
    if (!r.ok) return setError(r.error ?? 'Could not close this lead.');
    setLostOpen(false);
    go('leads');
  };

  return (
    <div>
      <Button variant="quiet" icon={<ArrowLeft size={16} />} onClick={() => go('leads')} className="mb-2 -ml-3">
        All leads
      </Button>
      <PageHeader
        title={`${lead.title.split(' · ')[0]} · what happens to this lead?`}
        subtitle={`${lead.customerName} · ${itemsLine(lead)}${lead.neededBy ? ` · needed by ${fmtDayMonth(lead.neededBy)}` : ''}`}
        actions={<StatusChip kind="lead" value={lead.state} />}
      />

      {glance && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Notice tone="wait">This lead has not been checked yet.</Notice>
          <Button variant="primary" onClick={() => go('lead-review', { leadId: lead.id })}>
            Check and keep it first
          </Button>
        </div>
      )}
      {sentJob && (
        <div className="mb-4">
          <Notice tone="live">
            Order copy sent. {sentJob.id} is on {state.karigars.find((k) => k.id === sentJob.karigarId)?.name ?? 'the karigar'}’s phone, waiting to be accepted.
          </Notice>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Notice tone="stop">{error}</Notice>
        </div>
      )}

      <SectionLabel className="mb-3">Two ways to meet it · per item, so a lead can split both ways</SectionLabel>
      <ul className="space-y-4">
        {lead.items.map((item) => {
          const matches = stockMatches(state, item);
          const pick = picks[item.id] ?? matches[0]?.id ?? '';
          const chosen = matches.find((p) => p.id === pick);
          const title = `${item.name}${item.style ? ` · ${item.style}` : ''} · ×${item.qty}`;
          return (
            <li key={item.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[14rem]">
                    <h3 className="text-[17px] font-semibold text-ink">{title}</h3>
                    <p className="mt-0.5 text-sm text-ink-3">
                      {item.approxWeightG !== null ? `around ${fmtG(item.approxWeightG)} g${item.qty > 1 ? ' each' : ''} · ` : ''}
                      {item.route
                        ? 'routed'
                        : matches.length === 0
                          ? 'nothing like it in stock right now'
                          : chosen
                            ? `${chosen.id} matches what they described · ${fmtG(netOf(chosen))} g gold, in the showcase`
                            : ''}
                    </p>
                  </div>
                  {!item.route && <Pill>{matches.length === 0 ? 'best made fresh' : 'already here, no need to make it'}</Pill>}
                </div>

                {item.route?.kind === 'stock' && <HeldLine lead={lead} item={item} pieceId={item.route.pieceId} onRelease={() => release(item)} />}
                {item.route?.kind === 'make' && <MakeLine jobId={item.route.jobId} />}

                {!item.route && (
                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    <Button variant={matches.length === 0 ? 'primary' : 'secondary'} icon={<Hammer size={16} />} disabled={glance} onClick={() => go('order-copy', { leadId: lead.id, itemId: item.id })}>
                      Make it — order to karigar
                    </Button>
                    {matches.length > 1 && (
                      <Select aria-label="Which piece to hold" className="max-w-xs" value={pick} onChange={(e) => setPicks({ ...picks, [item.id]: e.target.value })}>
                        {matches.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.id} · {fmtG(netOf(p))} g gold
                          </option>
                        ))}
                      </Select>
                    )}
                    {matches.length > 0 ? (
                      <Button
                        variant={chosen ? 'primary' : 'secondary'}
                        icon={<PackageCheck size={16} />}
                        disabled={glance || item.qty > 1 || !chosen}
                        onClick={() => chosen && hold(item, chosen.id)}
                      >
                        Hold {chosen?.id} for them
                      </Button>
                    ) : (
                      <Button variant="secondary" disabled>
                        Sell from stock
                      </Button>
                    )}
                    {item.qty > 1 && matches.length > 0 && <p className="w-full text-sm text-ink-3">A hold covers one piece. This line asks for {item.qty}, so make it.</p>}
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      <Card className="mt-5 flex flex-wrap items-center justify-between gap-3 bg-paper">
        <div>
          <p className="text-[15px] font-semibold text-ink">
            {routed} of {lead.items.length} {lead.items.length === 1 ? 'line' : 'lines'} routed
          </p>
          <p className="text-sm text-ink-3">
            {lead.state === 'converted'
              ? 'Every item has been routed one way or the other, so this lead is converted.'
              : 'The lead is only converted once every item on it has been routed one way or the other.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {lead.state === 'opened' && (
            <Button variant="secondary" onClick={() => actions.startWorkingLead({ leadId: lead.id })}>
              I am working on this
            </Button>
          )}
          {!closed && !glance && (
            <Button variant="danger" onClick={() => setLostOpen(true)}>
              Mark lost
            </Button>
          )}
        </div>
      </Card>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <h4 className="text-[15px] font-semibold text-ink">Make it: an order copy goes to a karigar</h4>
          <p className="mt-1 text-sm text-ink-2">
            You build the work order next: reference images, the brief, target weights, who makes it, the due date and the gold issued to them. It becomes a job on the karigar’s phone, and the lead stays attached so the customer can be told when it is ready.
          </p>
        </Card>
        <Card>
          <h4 className="text-[15px] font-semibold text-ink">Sell from stock: the piece is held for this customer</h4>
          <p className="mt-1 text-sm text-ink-2">
            Other quotes cannot see it. When they come in, it goes straight to the stock-out: seller, reference, invoice number. If they walk away, the hold is released and the piece returns to the showcase.
          </p>
        </Card>
      </div>

      <Modal
        open={lostOpen}
        onClose={() => setLostOpen(false)}
        title="Mark this lead lost"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLostOpen(false)}>
              Keep it open
            </Button>
            <Button variant="danger" onClick={markLost}>
              Mark lost
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-ink-2">Pieces held for this lead go back to the showcase.</p>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why? For example, customer went elsewhere." aria-label="Reason" />
      </Modal>
    </div>
  );
}

function HeldLine({ lead, item, pieceId, onRelease }: { lead: Lead; item: LeadItem; pieceId: string; onRelease: () => void }) {
  const { state, go } = useStore();
  const piece = state.pieces.find((p) => p.id === pieceId);
  const heldNow = piece?.heldForLeadId === lead.id;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-wait/30 bg-wait-soft p-3">
      <StatusChip kind="piece" value="held" />
      <p className="min-w-[12rem] flex-1 text-sm text-ink-2">
        {pieceId}
        {piece ? ` · ${fmtG(netOf(piece))} g gold` : ''} {heldNow ? 'is held' : 'was held'} for {lead.customerName}.
        {piece && piece.status === 'billed' ? ' It has been billed.' : ''}
      </p>
      {heldNow && (
        <>
          <Button variant="primary" onClick={() => go('stock-out')}>
            Go to the stock-out
          </Button>
          <Button variant="secondary" onClick={onRelease} aria-label={`Release the hold on ${item.name}`}>
            Release the hold
          </Button>
        </>
      )}
    </div>
  );
}

function MakeLine({ jobId }: { jobId: string }) {
  const { state } = useStore();
  const job = state.jobs.find((j) => j.id === jobId);
  const karigar = job ? state.karigars.find((k) => k.id === job.karigarId) : undefined;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-paper p-3">
      {job ? <StatusChip kind="job" value={job.stopped ? 'stopped' : job.status} /> : null}
      <p className="text-sm text-ink-2">
        Order copy sent as {jobId}
        {karigar ? ` to ${karigar.name}` : ''}.
      </p>
    </div>
  );
}
