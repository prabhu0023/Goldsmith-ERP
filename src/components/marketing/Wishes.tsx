import { useState } from 'react';
import { DAY, fmtTime, sameDay } from '../../domain/clock';
import { wishesDueToday } from '../../store/selectors';
import { useStore } from '../../store/StoreProvider';
import type { Customer } from '../../types/jewellery';
import { Button, Card, Notice, PageHeader, SectionLabel, StatusChip, Textarea, cn } from '../ui';
import { PhonePreview, fillName, firstName } from './util';

type Kind = 'birthday' | 'anniversary';
interface Due {
  customer: Customer;
  kind: Kind;
  tomorrow: boolean;
}

const DEFAULT_TEXT: Record<Kind, string> = {
  birthday: 'Happy birthday {name}! Warm wishes from all of us at Jai Gulab Dev. Do visit, we would love to show you something special.',
  anniversary: 'Happy anniversary {name}! Warm wishes from all of us at Jai Gulab Dev. Do visit, we would love to show you something special.',
};

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

/** Birthdays and anniversaries that come up on their own, sent from a known name. Opted-in customers only are messaged. */
export function Wishes() {
  const { state, actions, now } = useStore();
  const [sender, setSender] = useState('');
  const [texts, setTexts] = useState(DEFAULT_TEXT);
  const [editing, setEditing] = useState(false);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'live' | 'stop'; text: string } | null>(null);

  const auto = state.settings.autoSendWishes;
  const owner = state.staff.find((m) => m.role === 'owner');
  const showroom = state.staff.find((m) => m.role === 'staff');
  const senders = [owner, showroom]
    .filter((m): m is NonNullable<typeof m> => !!m)
    .map((m) => ({ name: m.name, label: `${firstName(m.name)} (${m.role === 'owner' ? 'Owner' : 'Showroom staff'})` }));
  const chosen = sender || senders[0]?.name || 'Jai Gulab Dev Jewellers';

  const sentToday = state.wishes.filter((w) => sameDay(w.at, now));
  const wasSent = (c: Customer, kind: Kind) => sentToday.some((w) => w.customerId === c.id && w.kind === kind);
  const due: Due[] = [
    ...wishesDueToday(state, now).filter((w) => !wasSent(w.customer, w.kind)).map((w) => ({ ...w, tomorrow: false })),
    ...wishesDueToday(state, now + DAY).map((w) => ({ ...w, tomorrow: true })),
  ];
  const optedToday = due.filter((d) => !d.tomorrow && d.customer.optedIn);

  const keyOf = (d: Due) => `${d.customer.id}:${d.kind}:${d.tomorrow ? 't' : 'n'}`;
  const previewing = due.find((d) => keyOf(d) === previewKey);

  const send = (ids: string[]) => {
    const r = actions.sendWishes({ customerIds: ids, sender: chosen });
    setMessage(r.ok ? { tone: 'live', text: `Sent from ${firstName(chosen)}.` } : { tone: 'stop', text: r.error ?? 'Could not send.' });
  };

  const customerOf = (id: string) => state.customers.find((c) => c.id === id);

  return (
    <div>
      <PageHeader title="Wishes" subtitle="Birthdays and anniversaries come up on their own. Send with a tap, or let it send itself." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold text-ink">Send wishes automatically at 9 am</h2>
              <p className="mt-1 text-sm text-ink-3">On, each morning's birthdays and anniversaries go out on WhatsApp without you lifting a finger.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={auto}
                aria-label="Send wishes automatically at 9 am"
                onClick={() => actions.setSetting('autoSendWishes', !auto)}
                className={cn('relative h-8 w-14 rounded-full border transition', auto ? 'border-live bg-live' : 'border-line-2 bg-closed-soft')}
              >
                <span aria-hidden className={cn('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all', auto ? 'left-7' : 'left-0.5')} />
              </button>
              <span className="w-8 text-sm font-semibold text-ink-2">{auto ? 'On' : 'Off'}</span>
              <Button onClick={() => setEditing(!editing)} aria-expanded={editing}>
                {editing ? 'Done editing' : 'Edit the message'}
              </Button>
            </div>
          </Card>

          {message && <Notice tone={message.tone}>{message.text}</Notice>}

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <SectionLabel>Coming up · {due.length}</SectionLabel>
              {optedToday.length > 0 && (
                <Button variant="primary" onClick={() => send(optedToday.map((d) => d.customer.id))}>
                  Send today's {optedToday.length} now
                </Button>
              )}
            </div>
            {due.length === 0 ? (
              <Card>
                <p className="text-[15px] text-ink-2">No birthdays or anniversaries today or tomorrow, and everything due has gone out.</p>
              </Card>
            ) : (
              <ul className="space-y-2">
                {due.map((d) => {
                  const c = d.customer;
                  const when = d.tomorrow ? 'tomorrow' : 'today';
                  return (
                    <li key={keyOf(d)} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-surface p-4">
                      <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-soft text-sm font-bold text-gold-ink">
                        {initials(c.name)}
                      </span>
                      <span className="min-w-[14rem] flex-1">
                        <span className="block text-[15px] font-semibold text-ink">
                          {c.name} · {d.kind} {when}
                        </span>
                        <span className="block text-sm text-ink-3">
                          {c.group}
                          {c.history.length > 0 && <> · last took home {c.history[c.history.length - 1].name}</>}
                        </span>
                        <span className="mt-1 block">
                          {!c.optedIn ? (
                            <StatusChip tone="closed" label="Not opted in · will not auto-send" />
                          ) : d.tomorrow ? (
                            <StatusChip tone={auto ? 'live' : 'wait'} label={auto ? 'Opted in · scheduled for 9 am tomorrow' : 'Opted in · auto-send is off'} />
                          ) : (
                            <StatusChip tone={auto ? 'live' : 'wait'} label={auto ? 'Opted in · will auto-send unless you send now' : 'Opted in · waiting for you to send'} />
                          )}
                        </span>
                      </span>
                      {!c.optedIn ? (
                        <span className="text-sm font-semibold text-ink-2">Call instead · {c.phone}</span>
                      ) : d.tomorrow ? (
                        <Button onClick={() => setPreviewKey(previewKey === keyOf(d) ? null : keyOf(d))}>Preview</Button>
                      ) : (
                        <Button variant="primary" onClick={() => send([c.id])}>
                          Send now
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {sentToday.length > 0 && (
            <section>
              <SectionLabel className="mb-3">Sent today · {sentToday.length}</SectionLabel>
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {sentToday.map((w) => (
                  <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span className="font-semibold text-ink">
                      {customerOf(w.customerId)?.name ?? w.customerId} · {w.kind}
                    </span>
                    <span className="text-ink-3">
                      from {w.sender} · {fmtTime(w.at)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <Card>
            <SectionLabel className="mb-2">Sent from</SectionLabel>
            <p className="mb-3 text-sm text-ink-3">Two names under the owner can be the sender.</p>
            <div role="radiogroup" aria-label="Sent from" className="flex flex-wrap gap-2">
              {senders.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  role="radio"
                  aria-checked={chosen === s.name}
                  onClick={() => setSender(s.name)}
                  className={cn(
                    'min-h-11 rounded-full border px-4 text-sm font-semibold',
                    chosen === s.name ? 'border-gold bg-gold-soft text-gold-ink' : 'border-line-2 bg-surface text-ink-2 hover:bg-paper',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[13px] text-ink-3">Wishes feel personal when they come from a known name.</p>
          </Card>

          <Card>
            <SectionLabel className="mb-2">The messages</SectionLabel>
            {(['birthday', 'anniversary'] as const).map((k) => (
              <div key={k} className="mb-3 last:mb-0">
                <p className="mb-1 text-sm font-semibold capitalize text-ink-2">{k}</p>
                {editing ? (
                  <Textarea aria-label={`The ${k} message`} value={texts[k]} onChange={(e) => setTexts({ ...texts, [k]: e.target.value })} />
                ) : (
                  <p className="rounded-lg bg-paper p-3 text-sm text-ink-2">{texts[k]}</p>
                )}
              </div>
            ))}
            <p className="text-[13px] text-ink-3">{'{name}'} fills in per person. Edit once, applies to all.</p>
          </Card>

          {previewing && (
            <Card>
              <SectionLabel className="mb-3">How it will read</SectionLabel>
              <PhonePreview>{fillName(texts[previewing.kind], previewing.customer.name)}</PhonePreview>
            </Card>
          )}

          <p className="text-[13px] text-ink-3">
            The dates come straight off each customer's profile. This is contact and goodwill only. A customer who is not opted in is still shown so you can reach
            them another way, but they are never messaged.
          </p>
        </aside>
      </div>
    </div>
  );
}
