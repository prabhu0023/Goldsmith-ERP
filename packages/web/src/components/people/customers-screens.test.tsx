import { describe, expect, it } from 'vitest';
import { createActionController } from '../../query/action-controller';
import { createConnectionStore } from '../../query/connection';
import { createQueryClient, defineQuery } from '../../query/query-client';
import { fail, fakeApi, fakeTimers, flush, networkFail, ok } from '../../query/test-support';
import { renderAs } from '../../test-support/render-as';
import { CustomerDrawer } from './CustomerDrawer';
import { Customers } from './Customers';
import { DuplicateCustomer, OnboardCustomer, createCustomer } from './OnboardCustomer';
import { customerRefusal, duplicatePhoneRefusal } from './customer-rows';
import type { CustomerDetail, CustomerRow } from './customer-rows';
const listCustomers = defineQuery({ op: 'listCustomers', input: {} });
const meera: CustomerRow = {
  id: 'CU-001',
  name: 'Meera Nair',
  phone: '+919884021107',
  city: 'Chennai',
  group: 'VIP Bridal',
  optedIn: false,
  pieceCount: 2,
  takenHomeG: '12.3400',
};
const detail = (over: Partial<CustomerDetail> = {}): CustomerDetail => ({
  id: 'CU-001',
  name: 'Meera Nair',
  phone: '+919884021107',
  city: 'Chennai',
  address: null,
  group: 'VIP Bridal',
  dob: { day: 14, month: 3 },
  anniversary: null,
  notes: null,
  optedIn: true,
  consent: [
    { kind: 'opt_out', source: 'form', at: '2026-10-02T05:00:00.000Z', atLocal: '2026-10-02T10:30:00.000+05:30', recordedBy: 'Rajesh Verma' },
    { kind: 'opt_in', source: 'counter', at: '2026-09-01T05:00:00.000Z', atLocal: '2026-09-01T10:30:00.000+05:30', recordedBy: null },
  ],
  history: [
    { tag: 'TG-0042', name: 'Gold chain', pureG: '8.1000', on: '2026-10-15T09:00:00.000Z' },
    { tag: 'TG-0007', name: 'Bangle', pureG: '4.2400', on: '2026-08-03T09:00:00.000Z' },
  ],
  pieceCount: 2,
  takenHomeG: '12.3400',
  version: 4,
  budgetINR: null,
  spentINR: null,
  ...over,
});
/** A cache whose first read of `def` has been answered (or failed) before the screen renders. */
async function cacheAfter(def: ReturnType<typeof defineQuery>, answer: ReturnType<typeof ok>) {
  const fake = fakeApi();
  const clock = fakeTimers();
  const queries = createQueryClient({ api: fake.api, now: clock.now, timers: clock.timers });
  fake.on(def.op, () => answer);
  queries.subscribe(def, () => {});
  await flush();
  return queries;
}
const page = (items: CustomerRow[]) => ok({ ok: true, items, nextCursor: null, pageSize: 50 });
describe('customer directory (EP-17-S8)', () => {
  it('while the read is pending staff see loading and no empty state', () => {
    const html = renderAs('Rajesh Verma', 'staff', <Customers />);
    expect(html).toContain('Loading the customer list…');
    expect(html).toContain('role="status"');
    expect(html).toContain('Add a customer');
    expect(html).not.toContain('Nobody matches that');
  });
  it('rows come from the server with phone, group, "Not opted in", pieces and grams', async () => {
    const queries = await cacheAfter(
      listCustomers,
      page([meera, { ...meera, id: 'CU-002', name: 'Anita Rao', optedIn: true, pieceCount: 1, takenHomeG: '0.5000' }]),
    );
    const html = renderAs('Rajesh Verma', 'staff', <Customers />, { queries });
    for (const text of ['Meera Nair', '+91 98840 21107', 'Chennai', 'VIP Bridal', 'Not opted in', '2 pieces', '12.3400 g', 'Anita Rao', '1 piece<', '0.5000 g']) {
      expect(html).toContain(text);
    }
    expect(html.match(/Not opted in/g)).toHaveLength(1);
    expect(html).not.toContain('₹');
  });
  it('a finished read with no rows shows the empty sentence', async () => {
    const queries = await cacheAfter(listCustomers, page([]));
    const html = renderAs('Rajesh Verma', 'staff', <Customers />, { queries });
    expect(html).toContain('Nobody matches that. Clear the search or add them as a new customer.');
    expect(html).not.toContain('Loading the customer list');
  });
  it('an unreachable server says the list could not be loaded and offers Try again', async () => {
    const queries = await cacheAfter(listCustomers, networkFail());
    const html = renderAs('Rajesh Verma', 'staff', <Customers />, { queries });
    expect(html).toContain('The customer list could not be loaded.');
    expect(html).toContain('Try again');
    expect(html).not.toContain('Nobody matches that');
  });
  it('a first page with more behind it offers Load more', async () => {
    const queries = await cacheAfter(listCustomers, ok({ ok: true, items: [meera], nextCursor: 'next', pageSize: 1 }));
    expect(renderAs('Rajesh Verma', 'staff', <Customers />, { queries })).toContain('Load more');
  });
  it('a session without listCustomers sees no list and no add button', () => {
    const html = renderAs('Vijay Kumar', 'karigar', <Customers />);
    expect(html).toContain('Your role cannot see the customer list.');
    expect(html).not.toContain('Loading the customer list');
    expect(html).not.toContain('Add a customer');
    expect(renderAs('Rajesh Verma', 'staff', <Customers />, { permissions: [] })).toContain('Your role cannot see the customer list.');
  });
  it('the owner sees the list too', () => {
    expect(renderAs('Sanjay Seth', 'owner', <Customers />)).toContain('Loading the customer list…');
  });
});
describe('add a customer form (EP-17-S3)', () => {
  it('shows the fields, an unticked consent box and no currency sign while pricing is off', () => {
    const html = renderAs('Rajesh Verma', 'staff', <OnboardCustomer />);
    for (const text of ['Name', 'Phone', 'City', 'Address', 'Birthday', 'Anniversary', 'Add this customer', 'They said yes to wishes on WhatsApp']) {
      expect(html).toContain(text);
    }
    expect(html.match(/role="radio"/g)).toHaveLength(4);
    expect(html).toMatch(/<input type="checkbox"(?![^>]*checked)/);
    expect(html).not.toContain('₹');
    expect(html).not.toContain('Budget');
    expect(html).not.toContain('Working…');
  });
  it('a session without createCustomer sees the sentence and no form', () => {
    const html = renderAs('Vijay Kumar', 'karigar', <OnboardCustomer />);
    expect(html).toContain('Your role cannot add customers.');
    expect(html).not.toContain('Add this customer');
  });
  it('S11 AC1: while the connection is down the submit is disabled and says why', () => {
    const connection = createConnectionStore({ windowLike: null });
    connection.setLiveStatus('reconnecting');
    const html = renderAs('Rajesh Verma', 'staff', <OnboardCustomer />, { connection });
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Add this customer<|<button[^>]*disabled=""[^>]*type="submit"[^>]*>Add this customer</);
    expect(html).toContain('Reconnecting to the server. Try again when the connection is back.');
  });
});
describe('adding a customer, with the real createCustomer action (EP-17-S3, S4)', () => {
  const newCustomer = { name: 'Meera Nair', phone: '+91 98840 21107', city: 'Chennai', group: 'Regular' as const };
  const sentence = 'A customer with this phone number already exists.';
  async function setup() {
    const fake = fakeApi();
    const clock = fakeTimers();
    const queries = createQueryClient({ api: fake.api, now: clock.now, timers: clock.timers });
    fake.on('listCustomers', () => page([]));
    queries.subscribe(listCustomers, () => {});
    await flush();
    const controller = createActionController({ def: createCustomer, api: fake.api, queries, newKey: () => 'key-1' });
    return { fake, controller };
  }
  it('after the customer is added the customer list is read again', async () => {
    const { fake, controller } = await setup();
    fake.on('createCustomer', () => ok({ ok: true, id: 'CU-001' }));
    const answer = await controller.run(newCustomer);
    expect(answer).toMatchObject({ ok: true, data: { id: 'CU-001' } });
    await flush();
    expect(fake.callsOf('listCustomers')).toHaveLength(2);
  });
  it('a duplicate phone is refused on the phone field and nothing is read again', async () => {
    const { fake, controller } = await setup();
    fake.on('createCustomer', () => fail('validation', sentence, { field: 'phone' }));
    expect(await controller.run(newCustomer)).toMatchObject({ ok: false, code: 'validation', field: 'phone' });
    const refusal = controller.getSnapshot().refusal;
    expect(duplicatePhoneRefusal(refusal)).toBe(true);
    expect(customerRefusal(refusal)).toEqual({ field: 'phone', message: sentence });
    expect(fake.callsOf('listCustomers')).toHaveLength(1);
  });
  it('the duplicate card names the existing customer and offers to open their record', async () => {
    const find = defineQuery({ op: 'findCustomerByPhone', input: { phone: '+91 98840 21107' } });
    const queries = await cacheAfter(find, ok({ ok: true, customer: { id: 'CU-001', name: 'Meera Nair', city: 'Chennai', group: 'VIP Bridal' } }));
    const html = renderAs('Rajesh Verma', 'staff', <DuplicateCustomer phone="+91 98840 21107" onOpen={() => {}} />, { queries });
    for (const text of ['This number is already a customer', 'Meera Nair', 'Chennai', 'VIP Bridal', 'Open their record']) expect(html).toContain(text);
  });
  it('the duplicate card shows nothing when no customer has the number', async () => {
    const find = defineQuery({ op: 'findCustomerByPhone', input: { phone: '+91 98840 21107' } });
    const queries = await cacheAfter(find, ok({ ok: true, customer: null }));
    const html = renderAs('Rajesh Verma', 'staff', <DuplicateCustomer phone="+91 98840 21107" onOpen={() => {}} />, { queries });
    expect(html).not.toContain('Open their record');
  });
});
describe('customer drawer (EP-17-S5, S6, S7, S11, S12, S13)', () => {
  const read = defineQuery({ op: 'readCustomer', input: { customerId: 'CU-001' } });
  const open = async (customer: CustomerDetail) => cacheAfter(read, ok({ ok: true, customer }));
  it('while the read is pending the drawer says it is loading', () => {
    const html = renderAs('Rajesh Verma', 'staff', <CustomerDrawer customerId="CU-001" onClose={() => {}} />);
    expect(html).toContain('Loading the customer…');
  });
  it('shows history by tag, name and grams with the total and the piece count', async () => {
    const queries = await open(detail());
    const html = renderAs('Rajesh Verma', 'staff', <CustomerDrawer customerId="CU-001" onClose={() => {}} />, { queries });
    for (const text of ['TG-0042', 'Gold chain', '8.1000 g', 'Oct 2026', 'TG-0007', 'Bangle', '4.2400 g', 'Aug 2026', '2 pieces in all', '12.3400 g taken home', '14 Mar', 'Not given']) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain('₹');
  });
  it('without history it says nothing has been taken home and shows no total', async () => {
    const queries = await open(detail({ history: [], pieceCount: 0, takenHomeG: '0.0000' }));
    const html = renderAs('Rajesh Verma', 'staff', <CustomerDrawer customerId="CU-001" onClose={() => {}} />, { queries });
    expect(html).toContain('Nothing has been taken home yet.');
    expect(html).not.toContain('g taken home');
    expect(html).not.toContain('pieces in all');
  });
  it('shows the consent state, its history newest first with who recorded it, and the two buttons', async () => {
    const queries = await open(detail());
    const html = renderAs('Rajesh Verma', 'staff', <CustomerDrawer customerId="CU-001" onClose={() => {}} />, { queries });
    for (const text of ['Opted in', '2 Oct 2026, 10:30', 'Rajesh Verma', 'System', 'Record consent', 'Record opt-out', 'Edit details']) expect(html).toContain(text);
    expect(html.indexOf('2 Oct 2026, 10:30')).toBeLessThan(html.indexOf('1 Sep 2026, 10:30'));
  });
  it('a customer who has not opted in says so', async () => {
    const queries = await open(detail({ optedIn: false, consent: [] }));
    const html = renderAs('Rajesh Verma', 'staff', <CustomerDrawer customerId="CU-001" onClose={() => {}} />, { queries });
    expect(html).toContain('Not opted in');
    expect(html).toContain('No consent has been recorded.');
  });
  it('only the owner is offered erasure', async () => {
    const queries = await open(detail());
    const staff = renderAs('Rajesh Verma', 'staff', <CustomerDrawer customerId="CU-001" onClose={() => {}} />, { queries });
    const owner = renderAs('Sanjay Seth', 'owner', <CustomerDrawer customerId="CU-001" onClose={() => {}} />, { queries });
    expect(staff).not.toContain('Erase personal data');
    expect(owner).toContain('Erase personal data');
  });
  it('a failed read shows the error in the drawer and Try again', async () => {
    const queries = await cacheAfter(read, networkFail());
    const html = renderAs('Rajesh Verma', 'staff', <CustomerDrawer customerId="CU-001" onClose={() => {}} />, { queries });
    expect(html).toContain('The customer could not be loaded.');
    expect(html).toContain('Try again');
  });
});
