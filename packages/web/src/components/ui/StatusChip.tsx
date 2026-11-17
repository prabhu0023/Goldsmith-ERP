import { cn } from './cn';

export type Tone = 'live' | 'wait' | 'stop' | 'closed' | 'draft';

const toneCls: Record<Tone, { chip: string; dot: string }> = {
  live: { chip: 'bg-live-soft text-live border-live/30', dot: 'bg-live' },
  wait: { chip: 'bg-wait-soft text-wait border-wait/30', dot: 'bg-wait' },
  stop: { chip: 'bg-stop-soft text-stop border-stop/30', dot: 'bg-stop' },
  closed: { chip: 'bg-closed text-white border-closed', dot: 'bg-white' },
  draft: { chip: 'bg-paper text-ink-3 border-line-2 border-dashed', dot: 'bg-ink-4' },
};

interface Entry {
  label: string;
  tone: Tone;
}

/**
 * The words people read. The enum values stay in the data. Colour means one thing:
 * green live, amber waiting on a named person, red stopped, dark closed, dashed grey not live yet.
 */
const vocab = {
  piece: {
    draft: { label: 'Draft', tone: 'draft' },
    with_owner: { label: 'With the owner', tone: 'wait' },
    stopped: { label: 'Stopped', tone: 'stop' },
    in_stock: { label: 'In stock', tone: 'live' },
    billed: { label: 'Billed', tone: 'closed' },
    scrapped: { label: 'Scrapped', tone: 'closed' },
    held: { label: 'Held for a customer', tone: 'wait' },
  },
  job: {
    sent: { label: 'Sent to karigar', tone: 'wait' },
    accepted: { label: 'Accepted', tone: 'live' },
    on_bench: { label: 'On the bench', tone: 'live' },
    ready: { label: 'Ready', tone: 'live' },
    handed_over: { label: 'Handed over', tone: 'closed' },
    stopped: { label: 'Stopped', tone: 'stop' },
    overdue: { label: 'Past its date', tone: 'wait' },
  },
  parcel: {
    open: { label: 'Being tagged', tone: 'wait' },
    stopped: { label: 'Stopped', tone: 'stop' },
    sent_back: { label: 'Sent back', tone: 'wait' },
    released: { label: 'In stock', tone: 'closed' },
    matches: { label: 'Matches', tone: 'live' },
  },
  lead: {
    needs_glance: { label: 'Needs a glance', tone: 'wait' },
    opened: { label: 'Opened', tone: 'wait' },
    being_worked: { label: 'Being worked', tone: 'live' },
    converted: { label: 'Converted', tone: 'closed' },
    lost: { label: 'Lost', tone: 'closed' },
    late: { label: 'Late', tone: 'stop' },
  },
  edit: {
    proposed: { label: 'Proposed', tone: 'wait' },
    token_sent: { label: 'Token sent', tone: 'wait' },
    applied: { label: 'Applied', tone: 'live' },
    refused: { label: 'Refused', tone: 'closed' },
    void: { label: 'Void', tone: 'closed' },
  },
  verdict: {
    incomplete: { label: 'Items still to tag', tone: 'wait' },
    exact: { label: 'Matches exactly', tone: 'live' },
    last_digit: { label: 'Off by the last digit', tone: 'wait' },
    mismatch: { label: 'Gold unaccounted for', tone: 'stop' },
  },
} satisfies Record<string, Record<string, Entry>>;

type Vocab = typeof vocab;
export type ChipKind = keyof Vocab;

type Props =
  | { [K in ChipKind]: { kind: K; value: keyof Vocab[K]; label?: string; tone?: undefined; className?: string } }[ChipKind]
  | { kind?: undefined; value?: undefined; tone: Tone; label: string; className?: string };

export function StatusChip(props: Props) {
  let entry: Entry;
  if (props.kind) {
    const table = vocab[props.kind] as Record<string, Entry>;
    const base = table[props.value as string];
    entry = { label: props.label ?? base.label, tone: base.tone };
  } else {
    entry = { label: props.label, tone: props.tone };
  }
  const c = toneCls[entry.tone];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[13px] font-semibold', c.chip, props.className)}>
      <span aria-hidden className={cn('h-2 w-2 rounded-full', c.dot)} />
      {entry.label}
    </span>
  );
}
