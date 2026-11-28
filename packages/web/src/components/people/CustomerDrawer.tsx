import type { ConsentKind, StaffConsentSource } from '@goldsmith/shared';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { defineAction } from '../../query/action-controller';
import { defineQuery } from '../../query/query-client';
import { useAction } from '../../query/use-action';
import { useQuery } from '../../query/use-query';
import { useSession } from '../../shell/session-context';
import { ActionButton, ActionError, Button, DetailDrawer, DrawerSection, Field, Input, Notice, QueryBoundary, Select, StatusChip } from '../ui';
import { ValueSlot } from '../ui/ValueSlot';
import { WhenToWish, WhoTheyAre } from './customer-fields';
import {
  customerDrawerNotice,
  customerFormErrors,
  consentTimeLabel,
  customerFormInput,
  customerRefusal,
  dayMonthText,
  formFromCustomer,
  formatCustomerPhone,
  monthYearLabel,
  piecesLabel,
} from './customer-rows';
import type { CustomerDetail, CustomerField, CustomerForm } from './customer-rows';
/** Every write here changes what the list and the drawer show, so both are read again after it (EP-17-S5, S6, S13). */
const affectsReads = () => [{ op: 'listCustomers' }, { op: 'readCustomer' }];
export const updateCustomer = defineAction({ op: 'updateCustomer', affects: affectsReads });
export const recordConsent = defineAction({ op: 'recordConsent', affects: affectsReads });
export const eraseCustomer = defineAction({ op: 'eraseCustomer', affects: affectsReads });
const SOURCE_LABEL: Record<string, string> = {
  counter: 'at the counter',
  form: 'on a form',
  whatsapp_reply: 'by WhatsApp reply',
  import: 'imported',
};
const KIND_LABEL: Record<ConsentKind, string> = { opt_in: 'Opted in', opt_out: 'Opted out' };
/** Opens one customer's record: details, what they took home by tag and grams, consent, edit and erase. */
export function CustomerDrawer({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const detail = useQuery(defineQuery({ op: 'readCustomer', input: { customerId } }));
  const customer = detail.data?.customer;
  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={customer?.name ?? 'Customer'}
      subtitle={customer ? `${formatCustomerPhone(customer.phone)}${customer.city ? ` · ${customer.city}` : ''} · ${customer.group}` : undefined}
      hero={
        customer && customer.history.length > 0
          ? { label: 'Pure gold', value: <span className="font-mono text-[26px] font-semibold tabular text-ink">{`${customer.takenHomeG} g taken home`}</span>, note: `${piecesLabel(customer.pieceCount)} in all` }
          : undefined
      }
    >
      <QueryBoundary label="customer" query={detail}>
        {customer && <CustomerBody customer={customer} onClose={onClose} />}
      </QueryBoundary>
    </DetailDrawer>
  );
}
function CustomerBody({ customer, onClose }: { customer: CustomerDetail; onClose: () => void }) {
  const { can } = useSession();
  // The version the edit form was opened with; null while it is closed.
  const [editing, setEditing] = useState<{ version: number } | null>(null);
  const noticeText = editing ? customerDrawerNotice(editing.version, customer.version) : null;
  return (
    <>
      <DrawerSection title="What they have taken home, by weight" defaultOpen>
        {customer.history.length === 0 ? (
          <p>Nothing has been taken home yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {customer.history.map((h, i) => (
              <li key={`${h.tag ?? 'piece'}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="block font-semibold text-ink">{h.name ?? 'Piece'}</span>
                  <span className="block text-sm text-ink-3">
                    {h.tag && <span className="font-mono">{h.tag}</span>}
                    {h.tag && h.on ? ' · ' : ''}
                    {monthYearLabel(h.on)}
                  </span>
                </span>
                {h.pureG !== null && <span className="font-mono text-sm font-medium text-ink tabular">{h.pureG} g</span>}
              </li>
            ))}
          </ul>
        )}
      </DrawerSection>
      <DrawerSection title="When to wish them" defaultOpen>
        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-ink-3">Birthday</dt>
            <dd className="font-semibold text-ink">{dayMonthText(customer.dob) || 'Not given'}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Anniversary</dt>
            <dd className="font-semibold text-ink">{dayMonthText(customer.anniversary) || 'Not given'}</dd>
          </div>
        </dl>
      </DrawerSection>
      <DrawerSection title="Consent for WhatsApp messages" defaultOpen>
        <ConsentSection
          customer={customer}
          onRecorded={() => setEditing((e) => (e ? { version: e.version + 1 } : e))}
        />
      </DrawerSection>
      {customer.address && (
        <DrawerSection title="Address">
          <p>{customer.address}</p>
        </DrawerSection>
      )}
      {customer.notes && (
        <DrawerSection title="Notes">
          <p>{customer.notes}</p>
        </DrawerSection>
      )}
      <div className="mt-3 space-y-1">
        <ValueSlot value={customer.budgetINR} label="Budget" />
        <ValueSlot value={customer.spentINR} label="Spend so far" />
      </div>
      {can('updateCustomer') && (
        <div className="mt-4">
          {editing ? (
            <>
              {noticeText && (
                <div className="mb-3">
                  <Notice tone="wait">{noticeText}</Notice>
                </div>
              )}
              <EditCustomer customer={customer} openedVersion={editing.version} onCancel={() => setEditing(null)} onSaved={() => setEditing(null)} />
            </>
          ) : (
            <Button onClick={() => setEditing({ version: customer.version })}>Edit details</Button>
          )}
        </div>
      )}
      {can('eraseCustomer') && (
        <DrawerSection title="Erase personal data">
          <EraseCustomer customer={customer} onErased={onClose} />
        </DrawerSection>
      )}
    </>
  );
}
function ConsentButton({
  customerId,
  kind,
  source,
  label,
  onRecorded,
}: {
  customerId: string;
  kind: ConsentKind;
  source: StaffConsentSource;
  label: string;
  onRecorded: () => void;
}) {
  const record = useAction(recordConsent);
  const done = (answer: { ok: boolean; data?: { recorded: boolean } }) => {
    if (answer.ok && answer.data?.recorded) onRecorded();
  };
  return (
    <div className="flex flex-col items-start gap-1">
      <ActionButton size="sm" busy={record.busy} onClick={() => void record.run({ customerId, kind, source }).then(done)}>
        {label}
      </ActionButton>
      <ActionError refusal={record.refusal} maybeNotSaved={record.maybeNotSaved} onRetry={() => void record.retry().then(done)} busy={record.busy} />
    </div>
  );
}
/** The consent state, its history (newest first, times in the shop's zone) and the two buttons (EP-17-S6, S7). */
function ConsentSection({ customer, onRecorded }: { customer: CustomerDetail; onRecorded: () => void }) {
  const { can } = useSession();
  const [source, setSource] = useState<StaffConsentSource>('counter');
  return (
    <>
      <p className="mb-2">
        {customer.optedIn ? <StatusChip tone="live" label="Opted in" /> : <StatusChip tone="closed" label="Not opted in" />}{' '}
        <span>{customer.optedIn ? 'Wishes and broadcasts go to this customer.' : 'No wishes or broadcasts go to this customer.'}</span>
      </p>
      {customer.consent.length === 0 ? (
        <p>No consent has been recorded.</p>
      ) : (
        <ul className="mb-3 space-y-1">
          {customer.consent.map((c, i) => (
            <li key={`${c.at}-${i}`}>
              <span className="font-semibold text-ink">{KIND_LABEL[c.kind]}</span> {SOURCE_LABEL[c.source] ?? c.source} · {consentTimeLabel(c.atLocal)} · {c.recordedBy ?? 'System'}
            </li>
          ))}
        </ul>
      )}
      {can('recordConsent') && (
        <div className="space-y-3">
          <Field label="They said it">
            <Select value={source} onChange={(e) => setSource(e.target.value as StaffConsentSource)}>
              <option value="counter">At the counter</option>
              <option value="form">On a form</option>
            </Select>
          </Field>
          <div className="flex flex-wrap items-start gap-2">
            <ConsentButton customerId={customer.id} kind="opt_in" source={source} label="Record consent" onRecorded={onRecorded} />
            <ConsentButton customerId={customer.id} kind="opt_out" source={source} label="Record opt-out" onRecorded={onRecorded} />
          </div>
        </div>
      )}
    </>
  );
}
/**
 * The edit form. It keeps what was typed and sends the version it was opened with, so a change by
 * someone else gets the server's conflict sentence and a refetched customer (EP-08-S9 AC3).
 */
function EditCustomer({ customer, openedVersion, onCancel, onSaved }: { customer: CustomerDetail; openedVersion: number; onCancel: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<CustomerForm>(() => formFromCustomer(customer));
  const [errors, setErrors] = useState<Partial<Record<CustomerField, string>>>({});
  const save = useAction(updateCustomer);
  const refused = customerRefusal(save.refusal);
  const change = (patch: Partial<CustomerForm>) => setForm((f) => ({ ...f, ...patch }));
  const savedWhenOk = (answer: { ok: boolean }) => {
    if (answer.ok) onSaved();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = customerFormErrors(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    void save.run({ customerId: customer.id, version: openedVersion, ...customerFormInput(form) }).then(savedWhenOk);
  };
  const shown: Partial<Record<CustomerField, string>> = { ...errors, ...(refused && 'field' in refused ? { [refused.field]: refused.message } : {}) };
  return (
    <form onSubmit={submit} className="space-y-3">
      <WhoTheyAre form={form} onChange={change} errors={shown} withNotes />
      <WhenToWish form={form} onChange={change} errors={shown} />
      <div className="flex flex-wrap items-start gap-2">
        <ActionButton type="submit" variant="primary" busy={save.busy}>
          Save details
        </ActionButton>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
      <ActionError
        refusal={refused && 'notice' in refused ? { message: refused.notice } : null}
        maybeNotSaved={save.maybeNotSaved}
        onRetry={() => void save.retry().then(savedWhenOk)}
        busy={save.busy}
      />
    </form>
  );
}
/** Owner only (EP-17-S13): clears name, phone, address, birthday and anniversary after a deletion request. */
function EraseCustomer({ customer, onErased }: { customer: CustomerDetail; onErased: () => void }) {
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const erase = useAction(eraseCustomer);
  const refusal = erase.refusal;
  const onField = (field: string) => (refusal?.code === 'validation' && refusal.field === field ? refusal.message : undefined);
  const beside = refusal && !(refusal.code === 'validation' && (refusal.field === 'deletionRequestRef' || refusal.field === 'reason')) ? refusal : null;
  const erasedWhenOk = (answer: { ok: boolean }) => {
    if (answer.ok) onErased();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void erase.run({ customerId: customer.id, version: customer.version, deletionRequestRef: reference, reason }).then(erasedWhenOk);
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <p>This clears the name, phone, address, birthday and anniversary of this customer. It cannot be undone.</p>
      <Field label="Deletion request reference" error={onField('deletionRequestRef')}>
        <Input value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" />
      </Field>
      <Field label="Reason" hint="Do not type the customer's name or phone here. The reason is kept in the security log." error={onField('reason')}>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} autoComplete="off" />
      </Field>
      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-ink-2">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="h-5 w-5 accent-gold" />
        I understand this cannot be undone
      </label>
      <ActionButton type="submit" variant="danger" busy={erase.busy} disabled={!confirmed}>
        Erase personal data
      </ActionButton>
      <ActionError refusal={beside} maybeNotSaved={erase.maybeNotSaved} onRetry={() => void erase.retry().then(erasedWhenOk)} busy={erase.busy} />
    </form>
  );
}
