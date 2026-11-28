import type { PoolEntryKind } from '@goldsmith/shared';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAction } from '../../query/use-action';
import { useQuery } from '../../query/use-query';
import { pagedBoundaryQuery, usePagedQuery } from '../../query/use-paged-query';
import { useSession } from '../../shell/session-context';
import { ActionButton, ActionError, Button, Card, Field, Input, PageHeader, QueryBoundary, ReadError, SectionLabel, Select } from '../ui';
import { PoolBalance } from './PoolBalance';
import { PoolEntryRows } from './PoolEntryRows';
import {
  createAdjustmentEntry,
  createOpeningEntry,
  createReturnEntry,
  custodyQuery,
  fmtGrams,
  gramsFieldError,
  hasPoolFilters,
  NO_POOL_FILTERS,
  POOL_KIND_LABELS,
  POOL_KINDS,
  poolListInput,
} from './pool-queries';
import type { PoolFilters } from './pool-queries';
/** Owner only (EP-18-S7 to S11). The metal pool: balance, every movement, where the gold is, and the owner's three postings. */
export function MetalPoolPage() {
  const { can } = useSession();
  if (!can('listPoolEntries')) {
    return (
      <div>
        <PageHeader title="Metal pool" />
        <Card>
          <p className="text-[15px] text-ink-2">Only the owner can read the metal pool ledger.</p>
        </Card>
      </div>
    );
  }
  return <PoolScreen />;
}
function PoolScreen() {
  const [filters, setFilters] = useState<PoolFilters>(NO_POOL_FILTERS);
  // A changed filter is a new input, so a new chain of pages: an answer for older filters is never shown.
  const list = usePagedQuery({ op: 'listPoolEntries', input: poolListInput(filters) });
  const change = (next: Partial<PoolFilters>) => setFilters((prev) => ({ ...prev, ...next }));
  // The opening balance is for an empty ledger only; a filtered list that is empty says nothing about the ledger.
  const ledgerEmpty = !hasPoolFilters(filters) && list.items.length === 0 && (list.status === 'ready' || list.status === 'possibly_stale');
  return (
    <div>
      <PageHeader title="Metal pool" subtitle="Gold free to issue to a karigar. Every movement is kept and never edited or removed." />
      <Card className="mb-4">
        <SectionLabel>Balance</SectionLabel>
        <div className="mt-2">
          <PoolBalance />
        </div>
      </Card>
      <Custody />
      <Card className="mb-4">
        <SectionLabel>Ledger · newest first</SectionLabel>
        <div className="mb-4 mt-3 flex flex-wrap items-end gap-3">
          <Field label="Kind">
            <Select value={filters.kind} onChange={(e) => change({ kind: e.target.value as PoolEntryKind | '' })}>
              <option value="">All kinds</option>
              {POOL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {POOL_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Job">
            <Input value={filters.job} onChange={(e) => change({ job: e.target.value })} placeholder="MO-2026-118" autoComplete="off" />
          </Field>
          <Field label="Piece">
            <Input value={filters.piece} onChange={(e) => change({ piece: e.target.value })} placeholder="TAG-7701" autoComplete="off" />
          </Field>
          <Field label="From">
            <Input type="date" value={filters.from} onChange={(e) => change({ from: e.target.value })} />
          </Field>
          <Field label="To">
            <Input type="date" value={filters.to} onChange={(e) => change({ to: e.target.value })} />
          </Field>
        </div>
        <QueryBoundary label="metal pool ledger" query={pagedBoundaryQuery(list)}>
          <PoolEntryRows
            entries={list.items}
            emptyText={hasPoolFilters(filters) ? 'No movements match these filters.' : 'No movements yet.'}
          />
        </QueryBoundary>
        {list.loadMoreError && (
          <div className="mt-3">
            <ReadError label="metal pool ledger" message={list.loadMoreError.message} code={list.loadMoreError.code} onRetry={list.loadMore} />
          </div>
        )}
        {list.loadingMore && <p className="mt-3 text-sm text-ink-3">Loading the metal pool ledger…</p>}
        {list.hasMore && !list.loadingMore && !list.loadMoreError && (
          <div className="mt-4">
            <Button onClick={list.loadMore}>Load more</Button>
          </div>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {ledgerEmpty && <OpeningForm />}
        <ReturnForm />
        <AdjustmentForm />
      </div>
    </div>
  );
}
/** Where the gold is: in the pool, with karigars, in parcels, in stock and gone (EP-18-S11). */
function Custody() {
  const custody = useQuery(custodyQuery);
  const c = custody.data;
  return (
    <Card className="mb-4">
      <SectionLabel>Where the gold is</SectionLabel>
      <div className="mt-3">
        <QueryBoundary label="gold custody summary" query={custody}>
          {c && (
            <div className="space-y-3">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-5">
                <Figure label="In the metal pool" g={c.poolG} />
                <Figure label={`With karigars · ${c.withKarigars.openJobs} open ${c.withKarigars.openJobs === 1 ? 'job' : 'jobs'}`} g={c.withKarigars.totalG} />
                <Figure label="In parcels" g={c.inParcelsG} />
                <Figure label="In stock" g={c.inStockG} />
                <Figure label="Gone" g={c.goneG} />
              </dl>
              {c.withKarigars.karigars.length > 0 && (
                <ul className="divide-y divide-line text-sm">
                  {c.withKarigars.karigars.map((k) => (
                    <li key={k.karigarId} className="flex flex-wrap items-center gap-x-4 py-2">
                      <span className="min-w-[10rem] flex-1 text-ink-2">
                        {k.name} <span className="font-mono text-ink-3">{k.karigarId}</span> · {k.openJobs} open {k.openJobs === 1 ? 'job' : 'jobs'}
                      </span>
                      <span className="font-mono tabular font-semibold text-ink">{fmtGrams(k.goldG)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </QueryBoundary>
      </div>
    </Card>
  );
}
function Figure({ label, g }: { label: string; g: string }) {
  return (
    <div>
      <dt className="text-ink-3">{label}</dt>
      <dd className="font-mono tabular text-[15px] font-semibold text-ink">{fmtGrams(g)}</dd>
    </div>
  );
}
type FieldErrors = Partial<Record<string, string>>;
/** The error to show under a field: the form's own check first, then the server's sentence for that field. */
const fieldErrorOf = (errors: FieldErrors, refusal: { field?: string; message: string } | null, field: string): string | undefined =>
  errors[field] ?? (refusal?.field === field ? refusal.message : undefined);
/** A refusal that names no field of the form shows beside the button. */
const generalRefusal = (refusal: { field?: string; message: string } | null, fields: string[]) =>
  refusal && !(refusal.field && fields.includes(refusal.field)) ? { message: refusal.message } : null;
function OpeningForm() {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = useAction(createOpeningEntry);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found: FieldErrors = {};
    const bad = gramsFieldError(amount, false);
    if (bad) found.amountG = bad;
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const answer = await create.run({ amountG: amount.trim(), ...(note.trim() ? { note: note.trim() } : {}) });
    if (answer.ok) {
      setAmount('');
      setNote('');
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)}>
      <Card className="space-y-3">
        <SectionLabel>Record the opening balance</SectionLabel>
        <p className="text-sm text-ink-3">Once only, while the ledger is empty. After that, use an adjustment.</p>
        <Field label="Gold in the pool (g)" error={fieldErrorOf(errors, create.refusal, 'amountG')}>
          <Input inputMode="decimal" className="font-mono" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="812.5800" />
        </Field>
        <Field label="Note (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} autoComplete="off" />
        </Field>
        <ActionError refusal={generalRefusal(create.refusal, ['amountG'])} maybeNotSaved={create.maybeNotSaved} onRetry={() => void create.retry()} busy={create.busy} />
        <ActionButton type="submit" variant="primary" busy={create.busy}>
          Record the opening balance
        </ActionButton>
      </Card>
    </form>
  );
}
function ReturnForm() {
  const [job, setJob] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = useAction(createReturnEntry);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found: FieldErrors = {};
    if (!job.trim()) found.jobId = 'Enter the job the gold came back from.';
    const bad = gramsFieldError(amount, false);
    if (bad) found.amountG = bad;
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const answer = await create.run({ jobId: job.trim(), amountG: amount.trim(), ...(note.trim() ? { note: note.trim() } : {}) });
    if (answer.ok) {
      setJob('');
      setAmount('');
      setNote('');
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)}>
      <Card className="space-y-3">
        <SectionLabel>Gold returned from a job</SectionLabel>
        <p className="text-sm text-ink-3">Puts unused gold back in the pool. It cannot be more than was issued for the job and not yet returned.</p>
        <Field label="Job" error={fieldErrorOf(errors, create.refusal, 'jobId')}>
          <Input value={job} onChange={(e) => setJob(e.target.value)} placeholder="MO-2026-118" autoComplete="off" />
        </Field>
        <Field label="Gold returned (g)" error={fieldErrorOf(errors, create.refusal, 'amountG')}>
          <Input inputMode="decimal" className="font-mono" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="2.5000" />
        </Field>
        <Field label="Note (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} autoComplete="off" />
        </Field>
        <ActionError refusal={generalRefusal(create.refusal, ['jobId', 'amountG'])} maybeNotSaved={create.maybeNotSaved} onRetry={() => void create.retry()} busy={create.busy} />
        <ActionButton type="submit" variant="primary" busy={create.busy}>
          Record the return
        </ActionButton>
      </Card>
    </form>
  );
}
function AdjustmentForm() {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = useAction(createAdjustmentEntry);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found: FieldErrors = {};
    const bad = gramsFieldError(delta, true);
    if (bad) found.adjustmentDeltaG = bad;
    if (reason.trim().length < 3) found.reason = 'Give the reason in at least 3 characters.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const answer = await create.run({ adjustmentDeltaG: delta.trim(), reason: reason.trim() });
    if (answer.ok) {
      setDelta('');
      setReason('');
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)}>
      <Card className="space-y-3">
        <SectionLabel>Adjust the pool</SectionLabel>
        <p className="text-sm text-ink-3">For a recount or a correction. Use a minus sign to take gold out. The reason is kept with the entry.</p>
        <Field label="Change (g)" hint="For example -0.4000 or 1.2500" error={fieldErrorOf(errors, create.refusal, 'adjustmentDeltaG')}>
          <Input inputMode="decimal" className="font-mono" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="-0.4000" />
        </Field>
        <Field label="Reason" error={fieldErrorOf(errors, create.refusal, 'reason')}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Safe recount 2 Nov" autoComplete="off" />
        </Field>
        <ActionError refusal={generalRefusal(create.refusal, ['adjustmentDeltaG', 'reason'])} maybeNotSaved={create.maybeNotSaved} onRetry={() => void create.retry()} busy={create.busy} />
        <ActionButton type="submit" variant="primary" busy={create.busy}>
          Record the adjustment
        </ActionButton>
      </Card>
    </form>
  );
}
