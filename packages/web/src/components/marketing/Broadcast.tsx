import { useState } from 'react';
import { fmtDateTime } from '@goldsmith/shared';
import { fmtG, netOf } from '@goldsmith/shared';
import { inStockPieces } from '../../store/selectors';
import { useStore } from '../../store/StoreProvider';
import type { CustomerGroup } from '@goldsmith/shared';
import { Button, Card, Field, Input, Modal, Notice, PageHeader, SectionLabel, Select, Textarea, cn } from '../ui';
import { GROUPS, PhonePreview, fillName, reachable } from './util';

const TEMPLATES: { id: string; label: string; text: string }[] = [
  {
    id: 'festive',
    label: 'Festive preview',
    text: 'Namaste {name}, our Deepavali bridal collection is now in the showroom. A few antique Kundan pieces this year. Shall we keep some aside for you to see?',
  },
  { id: 'new', label: 'New arrivals', text: 'Namaste {name}, new pieces have just arrived at Jai Gulab Dev. Come and see them whenever you are free.' },
  { id: 'blank', label: 'Blank', text: '' },
];

type Audience = CustomerGroup | 'All';

/** Pick who hears it, write it once, see it as they will. Only customers who opted in are counted. */
export function Broadcast() {
  const { state, actions, go } = useStore();
  const [audience, setAudience] = useState<Audience>('VIP Bridal');
  const [template, setTemplate] = useState('festive');
  const [text, setText] = useState(TEMPLATES[0].text);
  const [pieceIds, setPieceIds] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const [result, setResult] = useState<{ tone: 'live' | 'stop'; text: string } | null>(null);
  const [replyText, setReplyText] = useState('Yes please, I would like to see the bridal pieces.');
  const [replyFrom, setReplyFrom] = useState('');
  const [repliedLead, setRepliedLead] = useState<string | null>(null);

  const recipients = reachable(state.customers, audience);
  const skipped = state.customers.filter((c) => !c.optedIn && (audience === 'All' || c.group === audience)).length;
  const countFor = (a: Audience) => reachable(state.customers, a).length;
  const stock = inStockPieces(state);
  const attached = pieceIds.map((id) => state.pieces.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p && p.status === 'in_stock');
  const sample = recipients[0];
  const last = state.broadcasts[0];
  const needle = q.trim().toLowerCase();
  const pickList = stock.filter((p) => !needle || [p.id, p.name, p.style, p.collection].some((f) => f.toLowerCase().includes(needle)));

  const toggle = (id: string) => setPieceIds(pieceIds.includes(id) ? pieceIds.filter((x) => x !== id) : [...pieceIds, id]);

  const send = () => {
    const r = actions.sendBroadcast({ audience, message: text, pieceIds: attached.map((p) => p.id) });
    if (r.ok) {
      setResult({ tone: 'live', text: `Sent to ${recipients.length} opted-in ${recipients.length === 1 ? 'customer' : 'customers'}.` });
      setRepliedLead(null);
      setReplyFrom('');
    } else setResult({ tone: 'stop', text: r.error ?? 'Could not send.' });
  };

  const simulate = () => {
    if (!last) return;
    const r = actions.simulateReply({ broadcastId: last.id, customerId: replyFrom || undefined, text: replyText });
    if (r.ok && r.id) {
      setRepliedLead(r.id);
      setResult({ tone: 'live', text: 'A reply came in and is now a lead.' });
    } else setResult({ tone: 'stop', text: r.error ?? 'Could not add the reply.' });
  };

  return (
    <div>
      <PageHeader title="Send a broadcast on WhatsApp" subtitle="Pick who hears it, write it once, see it as they will. Only customers who opted in are counted." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card>
            <SectionLabel className="mb-3">Who hears it</SectionLabel>
            <div role="radiogroup" aria-label="Audience" className="flex flex-wrap gap-2">
              {(['All', ...GROUPS] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={audience === g}
                  onClick={() => setAudience(g)}
                  className={cn(
                    'min-h-11 rounded-full border px-4 text-sm font-semibold',
                    audience === g ? 'border-gold bg-gold-soft text-gold-ink' : 'border-line-2 bg-surface text-ink-2 hover:bg-paper',
                  )}
                >
                  {g === 'All' ? 'Everyone' : g} · {countFor(g)}
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm text-ink-3">
              {recipients.length} {recipients.length === 1 ? 'customer' : 'customers'} · all opted in to WhatsApp
              {skipped > 0 && <> · {skipped} left out because they have not opted in</>}
            </p>
          </Card>

          <Card>
            <SectionLabel className="mb-3">What you send</SectionLabel>
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <Field label="Start from a template" className="min-w-[14rem]">
                <Select
                  value={template}
                  onChange={(e) => {
                    setTemplate(e.target.value);
                    setText(TEMPLATES.find((t) => t.id === e.target.value)?.text ?? '');
                  }}
                >
                  {TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Message" hint="{name} is filled in per person.">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-32" />
            </Field>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-ink-2">Attach pieces from the catalogue</span>
              <Button onClick={() => setPicking(true)}>Pick pieces</Button>
              <span className="text-sm text-ink-3">{attached.length} attached</span>
            </div>
            {attached.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {attached.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 rounded-lg border border-line bg-paper py-1 pl-1 pr-2 text-sm">
                    {p.photos[0] && <img src={p.photos[0]} alt="" className="h-9 w-9 rounded object-cover" />}
                    <span className="font-semibold text-ink">{p.name}</span>
                    <button type="button" aria-label={`Remove ${p.name}`} onClick={() => toggle(p.id)} className="rounded px-1.5 text-ink-3 hover:bg-closed-soft">
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-[15px] font-semibold text-ink">
              Going to {recipients.length} opted-in {audience === 'All' ? 'customers' : `${audience} ${recipients.length === 1 ? 'customer' : 'customers'}`}
            </p>
            <Button variant="primary" disabled={recipients.length === 0 || !text.trim()} onClick={send}>
              Send to {recipients.length}
            </Button>
          </Card>
          {result && <Notice tone={result.tone}>{result.text}</Notice>}

          <Card>
            <SectionLabel className="mb-2">After you send</SectionLabel>
            <p className="text-sm text-ink-3">Replies become leads. A reply lands in the lead inbox, so nothing a customer sends is lost.</p>
            {last ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-ink-2">
                  Latest broadcast: {last.audience === 'All' ? 'everyone' : last.audience} · {last.recipientIds.length} sent · {fmtDateTime(last.at)}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Reply from">
                    <Select value={replyFrom} onChange={(e) => setReplyFrom(e.target.value)}>
                      <option value="">First customer on the list</option>
                      {last.recipientIds.map((id) => (
                        <option key={id} value={id}>
                          {state.customers.find((c) => c.id === id)?.name ?? id}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="What they say">
                    <Input value={replyText} onChange={(e) => setReplyText(e.target.value)} />
                  </Field>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={!replyText.trim()} onClick={simulate}>
                    Simulate a customer reply
                  </Button>
                  {repliedLead && (
                    <Button variant="primary" onClick={() => go('lead-review', { leadId: repliedLead })}>
                      Open the new lead
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-3">Send a broadcast first. Then you can simulate a customer replying to it.</p>
            )}
          </Card>
        </div>

        <aside className="space-y-3">
          <SectionLabel>How it lands on their phone</SectionLabel>
          <PhonePreview
            footer={
              attached.length > 0 && (
                <div className="rounded-lg bg-surface p-2 text-sm shadow-sm">
                  <ul className="space-y-1.5">
                    {attached.map((p) => (
                      <li key={p.id} className="flex items-center gap-2">
                        {p.photos[0] && <img src={p.photos[0]} alt="" className="h-10 w-10 rounded object-cover" />}
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-ink">{p.name}</span>
                          <span className="block font-mono text-[13px] text-ink-3">{fmtG(netOf(p))} g pure gold</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-center font-semibold text-live">See the pieces</p>
                </div>
              )
            }
          >
            {text.trim() ? fillName(text, sample?.name ?? 'Meera Iyer') : <span className="text-ink-4">Your message shows here.</span>}
          </PhonePreview>
          <p className="text-center text-[13px] text-ink-3">{'{name}'} shows as their real name{sample ? `, here ${sample.name}` : ''}.</p>
        </aside>
      </div>

      <Modal
        open={picking}
        onClose={() => setPicking(false)}
        title="Attach pieces"
        footer={
          <Button variant="primary" onClick={() => setPicking(false)}>
            Done · {attached.length} attached
          </Button>
        }
      >
        <p className="mb-3 text-sm text-ink-3">Only pieces in stock are listed, so nothing sold or scrapped can go out.</p>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, tag or style" aria-label="Search pieces" className="mb-3" />
        <ul className="max-h-80 divide-y divide-line overflow-y-auto">
          {pickList.map((p) => (
            <li key={p.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2">
                <input type="checkbox" className="h-5 w-5" checked={pieceIds.includes(p.id)} onChange={() => toggle(p.id)} />
                {p.photos[0] && <img src={p.photos[0]} alt="" className="h-10 w-10 rounded object-cover" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                  <span className="block text-[13px] text-ink-3">
                    <span className="font-mono">{p.id}</span> · {p.purity}
                  </span>
                </span>
                <span className="font-mono text-sm tabular text-ink-2">{fmtG(netOf(p))} g</span>
              </label>
            </li>
          ))}
          {pickList.length === 0 && <li className="py-3 text-sm text-ink-3">No piece in stock matches that.</li>}
        </ul>
      </Modal>
    </div>
  );
}
