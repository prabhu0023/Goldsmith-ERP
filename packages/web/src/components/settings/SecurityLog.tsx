import { AUDIT_ACTION_LABELS, AUDIT_GROUPS, auditActorLabel, auditFieldRows, fmtAuditTime } from '@goldsmith/shared';
import type { AuditGroupId } from '@goldsmith/shared';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { defineQuery } from '../../query/query-client';
import { useQuery } from '../../query/use-query';
import { pagedBoundaryQuery, usePagedQuery } from '../../query/use-paged-query';
import { useSession } from '../../shell/session-context';
import { Button, Card, DetailDrawer, Field, Input, PageHeader, Pill, QueryBoundary, ReadError, Select, cn } from '../ui';
import { auditListInput, NO_FILTERS, SYSTEM_ACTOR } from './security-log-state';
import type { AuditEntry, AuditFilters, AuditListItem } from './security-log-state';
/** Owner only (EP-06-S9 to S12). Every entry from the server: who, when, what and why. */
export function SecurityLog() {
  const { can } = useSession();
  if (!can('listAuditEntries')) {
    return (
      <div>
        <PageHeader title="Security log" />
        <Card>
          <p className="text-[15px] text-ink-2">Only the owner can read the security log.</p>
        </Card>
      </div>
    );
  }
  return <AuditLog />;
}
/** The people in the "Who" filter: one read of up to 200 users. */
const usersQuery = defineQuery({ op: 'listUsers', input: { pageSize: 200 } });
function AuditLog() {
  const [filters, setFilters] = useState<AuditFilters>(NO_FILTERS);
  const [entityText, setEntityText] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  // A changed filter is a new input, so a new chain of pages: an answer for older filters is never shown.
  const list = usePagedQuery({ op: 'listAuditEntries', input: auditListInput(filters) });
  const users = useQuery(usersQuery).data?.items ?? [];
  const change = (next: Partial<AuditFilters>) => setFilters((prev) => ({ ...prev, ...next }));
  const findEntity = (e: FormEvent) => {
    e.preventDefault();
    change({ entity: entityText });
  };
  return (
    <div>
      <PageHeader title="Security log" subtitle="Everything that changed the books and who did it. Entries are never edited or removed." />
      <AuditGroupButtons group={filters.group} onChange={(group) => change({ group })} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <form onSubmit={findEntity} className="flex items-end gap-2">
          <Field label="Tag, batch or record">
            <Input value={entityText} onChange={(e) => setEntityText(e.target.value)} placeholder="TAG-8841" autoComplete="off" />
          </Field>
          <Button type="submit">Find</Button>
        </form>
        <Field label="Who">
          <Select value={filters.actor} onChange={(e) => change({ actor: e.target.value })}>
            <option value="">Everyone</option>
            <option value={SYSTEM_ACTOR}>System</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From">
          <Input type="date" value={filters.from} onChange={(e) => change({ from: e.target.value })} />
        </Field>
        <Field label="To">
          <Input type="date" value={filters.to} onChange={(e) => change({ to: e.target.value })} />
        </Field>
      </div>
      <QueryBoundary label="security log" query={pagedBoundaryQuery(list)}>
        <AuditEntries entries={list.items} onOpen={setOpenId} />
      </QueryBoundary>
      {list.loadMoreError && (
        <div className="mt-3">
          <ReadError label="security log" message={list.loadMoreError.message} code={list.loadMoreError.code} onRetry={list.loadMore} />
        </div>
      )}
      {list.loadingMore && <p className="mt-3 text-sm text-ink-3">Loading the security log…</p>}
      {list.hasMore && !list.loadingMore && !list.loadMoreError && (
        <div className="mt-4">
          <Button onClick={list.loadMore}>Load more</Button>
        </div>
      )}
      {openId && <AuditEntryDrawer key={openId} id={openId} onOpen={setOpenId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
/** The filter groups, one pressed (EP-06-S10 AC1). */
export function AuditGroupButtons({ group, onChange }: { group: AuditGroupId; onChange: (group: AuditGroupId) => void }) {
  return (
    <div role="group" aria-label="Kind of entry" className="mb-4 flex flex-wrap gap-2">
      {AUDIT_GROUPS.map((x) => (
        <button
          key={x.id}
          type="button"
          aria-pressed={group === x.id}
          onClick={() => onChange(x.id)}
          className={cn(
            'min-h-10 rounded-full border px-3 text-sm font-semibold',
            group === x.id ? 'border-gold bg-gold-soft text-gold-ink' : 'border-line-2 bg-surface text-ink-3 hover:bg-paper',
          )}
        >
          {x.label}
        </button>
      ))}
    </div>
  );
}
/** The loaded rows, or the empty sentence when the read finished with none (EP-06-S9 AC5). The boundary above it shows loading and errors. */
export function AuditEntries({ entries, onOpen }: { entries: AuditListItem[]; onOpen: (id: string) => void }) {
  if (entries.length === 0) {
    return (
      <Card>
        <p className="text-[15px] text-ink-2">Nothing has been logged under this heading.</p>
      </Card>
    );
  }
  return (
    <ul className="space-y-2">
      {entries.map((a) => (
        <li key={a.id}>
          <AuditLogRow entry={a} onOpen={() => onOpen(a.id)} />
        </li>
      ))}
    </ul>
  );
}
/** One entry in the list: action, ref, shop time, actor and summary. Opens its detail. */
export function AuditLogRow({ entry, onOpen }: { entry: AuditListItem; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="block w-full rounded-xl border border-line bg-surface p-4 text-left hover:bg-paper">
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Pill>{AUDIT_ACTION_LABELS[entry.kind]}</Pill>
        {entry.ref && <span className="font-mono text-sm text-ink-3">{entry.ref}</span>}
        <span className="ml-auto text-sm text-ink-3">
          {fmtAuditTime(entry.at)} · {auditActorLabel(entry)}
        </span>
      </span>
      {entry.summary && <span className="mt-2 block text-[15px] font-semibold text-ink">{entry.summary}</span>}
    </button>
  );
}
/** Loads one entry and shows it in the drawer (EP-06-S11). */
function AuditEntryDrawer({ id, onOpen, onClose }: { id: string; onOpen: (id: string) => void; onClose: () => void }) {
  const query = useQuery(defineQuery({ op: 'readAuditEntry', input: { id } }));
  const entry: AuditEntry | undefined = query.data?.entry;
  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={entry ? AUDIT_ACTION_LABELS[entry.kind] : 'Security log entry'}
      subtitle={entry ? fmtAuditTime(entry.at) : undefined}
    >
      <QueryBoundary label="entry" query={query}>
        {entry && <AuditEntryDetail entry={entry} onOpenEntry={onOpen} />}
      </QueryBoundary>
    </DetailDrawer>
  );
}
/**
 * One entry in full (EP-06-S11): who, when, what, why, each changed field before and after, and
 * whether a token authorised it. The token's reference is never shown.
 */
export function AuditEntryDetail({ entry, onOpenEntry }: { entry: AuditEntry; onOpenEntry: (id: string) => void }) {
  const fields = auditFieldRows(entry.before, entry.after);
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-ink-3">Who</dt>
        <dd className="text-ink">{auditActorLabel(entry)}</dd>
        <dt className="text-ink-3">When</dt>
        <dd className="text-ink">{fmtAuditTime(entry.at)}</dd>
        <dt className="text-ink-3">What</dt>
        <dd className="text-ink">{AUDIT_ACTION_LABELS[entry.kind]}</dd>
        {entry.entityId && (
          <>
            <dt className="text-ink-3">Record</dt>
            <dd className="font-mono text-ink">{entry.entityId}</dd>
          </>
        )}
        {entry.ref && entry.ref !== entry.entityId && !entry.corrects && (
          <>
            <dt className="text-ink-3">Ref</dt>
            <dd className="font-mono text-ink">{entry.ref}</dd>
          </>
        )}
        {entry.reason && (
          <>
            <dt className="text-ink-3">Why</dt>
            <dd className="text-ink">{entry.reason}</dd>
          </>
        )}
      </dl>
      {entry.summary && <p className="text-[15px] font-semibold text-ink">{entry.summary}</p>}
      {entry.tokenReference && <Pill>Token used</Pill>}
      {fields.length > 0 && (
        <ul className="space-y-1 text-sm">
          {fields.map((f) => (
            <li key={f.field}>
              <span className="text-ink-3">{f.label}: </span>
              <span className="text-ink">
                {f.before} → {f.after}
              </span>
            </li>
          ))}
        </ul>
      )}
      {entry.corrects && (
        <Button size="sm" onClick={() => entry.corrects && onOpenEntry(entry.corrects.id)}>
          Corrects an earlier entry
        </Button>
      )}
    </div>
  );
}
