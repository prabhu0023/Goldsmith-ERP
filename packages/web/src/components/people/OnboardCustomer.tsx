import { useState } from 'react';
import type { FormEvent } from 'react';
import { defineAction } from '../../query/action-controller';
import { defineQuery } from '../../query/query-client';
import { useAction } from '../../query/use-action';
import { useQuery } from '../../query/use-query';
import { useNavigation } from '../../shell/navigation';
import { useSession } from '../../shell/session-context';
import { ActionButton, ActionError, Button, Card, PageHeader, SectionLabel } from '../ui';
import { ValueSlot } from '../ui/ValueSlot';
import { WhenToWish, WhoTheyAre } from './customer-fields';
import { customerFormErrors, customerFormInput, customerRefusal, duplicatePhoneRefusal } from './customer-rows';
import type { CustomerField, CustomerForm } from './customer-rows';
/** The new customer shows in the customer list, which is read again once they are saved (EP-17-S3). */
export const createCustomer = defineAction({ op: 'createCustomer', affects: () => [{ op: 'listCustomers' }] });
const EMPTY: CustomerForm = {
  name: '',
  phone: '',
  city: '',
  address: '',
  group: 'Regular',
  notes: '',
  birthdayDay: '',
  birthdayMonth: '',
  anniversaryDay: '',
  anniversaryMonth: '',
};
/** Screen 23. Staff and the owner add a customer (EP-17-S3). Budget and spend stay behind ValueSlot. */
export function OnboardCustomer() {
  const { can } = useSession();
  if (!can('createCustomer')) {
    return (
      <div>
        <PageHeader title="Add a customer" />
        <Card>
          <p className="text-[15px] text-ink-2">Your role cannot add customers.</p>
        </Card>
      </div>
    );
  }
  return <AddCustomerForm />;
}
/** The customer who already has this phone: name, city and group, and a way to open their record (EP-17-S4). */
export function DuplicateCustomer({ phone, onOpen }: { phone: string; onOpen: (customerId: string) => void }) {
  const found = useQuery(defineQuery({ op: 'findCustomerByPhone', input: { phone } }));
  const customer = found.data?.customer ?? null;
  if (!customer) return null;
  return (
    <Card className="mb-4 border-wait">
      <SectionLabel>This number is already a customer</SectionLabel>
      <p className="mt-2 text-[15px] font-semibold text-ink">{customer.name}</p>
      <p className="text-sm text-ink-3">
        {customer.city ? `${customer.city} · ` : ''}
        {customer.group}
      </p>
      <div className="mt-3">
        <Button onClick={() => onOpen(customer.id)}>Open their record</Button>
      </div>
    </Card>
  );
}
function AddCustomerForm() {
  const { go } = useNavigation();
  const [form, setForm] = useState<CustomerForm>(EMPTY);
  // Consent is on the customer's word (BR-17-2): staff tick the box, it never starts ticked.
  const [optedIn, setOptedIn] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<CustomerField, string>>>({});
  const [triedPhone, setTriedPhone] = useState('');
  // The action keeps one key across "Try again" after a lost answer, so the customer is added once (EP-03-S8, EP-08-S6).
  const create = useAction(createCustomer);
  const refused = customerRefusal(create.refusal);
  const duplicate = duplicatePhoneRefusal(create.refusal);
  const change = (patch: Partial<CustomerForm>) => setForm((f) => ({ ...f, ...patch }));
  const opened = (customerId: string) => go('customers', { customerId });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = customerFormErrors(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setTriedPhone(form.phone.trim());
    const answer = await create.run({ ...customerFormInput(form), ...(optedIn ? { optInSource: 'counter' as const } : {}) });
    if (answer.ok) opened(answer.data.id);
  };
  const retry = async () => {
    const answer = await create.retry();
    if (answer.ok) opened(answer.data.id);
  };
  const shown: Partial<Record<CustomerField, string>> = {
    ...errors,
    ...(refused && 'field' in refused ? { [refused.field]: refused.message } : {}),
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="mx-auto max-w-2xl">
      <PageHeader title="Add a customer" subtitle="Who they are and when to wish them. Their pieces attach by weight once they buy." />
      <Card className="mb-4 space-y-4">
        <SectionLabel>Who they are</SectionLabel>
        <WhoTheyAre form={form} onChange={change} errors={shown} />
      </Card>
      {duplicate && triedPhone && <DuplicateCustomer phone={triedPhone} onOpen={opened} />}
      <Card className="mb-4 space-y-4">
        <SectionLabel>When to wish them</SectionLabel>
        <WhenToWish form={form} onChange={change} errors={shown} />
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-ink-2">
          <input type="checkbox" checked={optedIn} onChange={(e) => setOptedIn(e.target.checked)} className="h-5 w-5 accent-gold" />
          They said yes to wishes on WhatsApp
        </label>
        <p className="text-sm text-ink-3">Tick this only when the customer has said yes. Only customers who have said yes receive wishes and broadcasts.</p>
      </Card>
      <div className="mb-4 space-y-3">
        <ValueSlot value={null} label="Budget" />
        <ValueSlot value={null} label="Spend so far" />
      </div>
      <Card className="mb-4">
        <SectionLabel>What they have taken home · by weight</SectionLabel>
        <p className="mt-2 text-sm text-ink-3">Nothing yet. Each piece they buy is attached here by tag and grams, the same ones the system already tracks.</p>
      </Card>
      <div className="mb-4">
        <ActionError
          refusal={refused && 'notice' in refused ? { message: refused.notice } : null}
          maybeNotSaved={create.maybeNotSaved}
          onRetry={() => void retry()}
          busy={create.busy}
        />
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <ActionButton type="submit" variant="primary" busy={create.busy}>
          Add this customer
        </ActionButton>
        <Button onClick={() => go('customers')}>Cancel</Button>
      </div>
    </form>
  );
}
