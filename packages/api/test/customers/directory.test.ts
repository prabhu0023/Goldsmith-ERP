/** List Customers and Read Customer (EP-17-S8, S9, S11 AC1, AC4). */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb } from '../db/db-test-helpers.js';
import { addCustomer, addHistory, type CustomersHarness, startCustomersHarness } from './customer-test-helpers.js';

interface Item {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  group: string;
  optedIn: boolean;
  pieceCount: number;
  takenHomeG: string;
}
interface HistoryItem {
  tag: string;
  name: string;
  pureG: string;
  on: string;
}
interface Page {
  items: Item[];
  nextCursor: string | null;
  pageSize: number;
}

describeDb('the customer directory and detail (EP-17-S8, S9)', () => {
  let h: CustomersHarness;
  let meera: { id: string; code: string };
  beforeAll(async () => {
    h = await startCustomersHarness();
    meera = await addCustomer(h, { name: 'Meera Iyer', phone: '+919884021107', city: 'Chennai', group: 'VIP Bridal', optedIn: true });
    await addCustomer(h, { name: 'Priya Malhotra', phone: '+919845012034', city: 'Bengaluru', group: 'Regular' });
    await addCustomer(h, { name: 'Ravi Shankar', phone: '+919840155501', city: 'Chennai', group: 'VIP Bridal' });
    await addCustomer(h, { name: 'Gone Away', phone: null, city: 'Chennai', group: 'VIP Bridal', status: 'erased' });
    await addHistory(h, meera.id, [
      { tag: 'TAG-7521', name: 'Chettinad Haram', units: 784000, on: '2026-10-12T00:00:00Z' },
      { tag: 'TAG-6690', name: 'Polki Kada pair', units: 574900, on: '2026-02-10T00:00:00Z' },
      { tag: 'TAG-1004', name: 'Stud', units: 0, on: '2026-01-04T00:00:00Z' },
      { tag: 'TAG-1003', name: 'Stud', units: 0, on: '2026-01-04T00:00:00Z' },
      { tag: 'TAG-1002', name: 'Stud', units: 0, on: '2026-01-03T00:00:00Z' },
      { tag: 'TAG-1001', name: 'Stud', units: 0, on: '2026-01-02T00:00:00Z' },
    ]);
  });
  afterAll(async () => {
    await h?.close();
  });
  const list = async (body: Record<string, unknown> = {}, as: 'asStaff' | 'asOwner' = 'asStaff') => {
    const res = await h[as]('listCustomers', body);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as unknown as Page;
  };
  const names = (page: Page) => page.items.map((c) => c.name);

  it('S8 AC1: name, phone typed any way, and city all find her', async () => {
    for (const search of ['iyer', 'IYER', 'Meera I', '98840 21107', '9884021107', '+91 98840 21107', 'chennai']) {
      expect(names(await list({ search })), search).toContain('Meera Iyer');
    }
    expect(names(await list({ search: 'chennai' }))).toEqual(['Meera Iyer', 'Ravi Shankar']);
  });

  it('S8 AC1: a row carries id, name, phone, city, group, consent, piece count and grams', async () => {
    const page = await list({ search: 'iyer' });
    expect(page.items).toEqual([
      { id: meera.code, name: 'Meera Iyer', phone: '+919884021107', city: 'Chennai', group: 'VIP Bridal', optedIn: true, pieceCount: 6, takenHomeG: '135.8900' },
    ]);
  });

  it('S8 AC2: the group filter lists only that group; no filter lists every active customer', async () => {
    expect(names(await list({ group: 'VIP Bridal' }))).toEqual(['Meera Iyer', 'Ravi Shankar']);
    expect(names(await list())).toEqual(['Meera Iyer', 'Priya Malhotra', 'Ravi Shankar']);
    expect(names(await list({ group: 'VIP Bridal', search: 'ravi' }))).toEqual(['Ravi Shankar']);
  });

  it('S8 AC3: a search nobody matches gives an empty page', async () => {
    const page = await list({ search: 'zzz' });
    expect(page).toMatchObject({ items: [], nextCursor: null });
  });

  it('S8: % and _ in the search are literal characters, and a phone search does not match names', async () => {
    expect(names(await list({ search: '%' }))).toEqual([]);
    expect(names(await list({ search: '_' }))).toEqual([]);
    expect(names(await list({ search: 'M_era' }))).toEqual([]);
  });

  it('S8 AC5: an erased customer is not listed or found by search', async () => {
    expect(names(await list())).not.toContain('Gone Away');
    expect(names(await list({ search: 'gone' }))).toEqual([]);
  });

  it('S8: pages by cursor in name order and rejects a bad cursor or group', async () => {
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await list({ pageSize: 2, ...(cursor ? { cursor } : {}) });
      seen.push(...names(page));
      cursor = page.nextCursor ?? undefined;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(2);
    expect(seen).toEqual(['Meera Iyer', 'Priya Malhotra', 'Ravi Shankar']);
    const bad = await h.asStaff('listCustomers', { cursor: 'not-a-cursor' });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ code: 'validation', field: 'cursor' });
    expect((await h.asStaff('listCustomers', { group: 'Festive collector' })).status).toBe(400);
  });

  it('S9 AC1, AC2: the detail lists pieces newest first by tag and grams, with the count and total from integers', async () => {
    const res = await h.asStaff('readCustomer', { customerId: meera.code });
    expect(res.status).toBe(200);
    const c = res.body.customer as { history: HistoryItem[] };
    expect(c).toMatchObject({
      id: meera.code,
      name: 'Meera Iyer',
      phone: '+919884021107',
      city: 'Chennai',
      group: 'VIP Bridal',
      optedIn: true,
      pieceCount: 6,
      takenHomeG: '135.8900',
      budgetINR: null,
      spentINR: null,
      version: 1,
    });
    expect(c.history.slice(0, 2).map((r: HistoryItem) => [r.name, r.tag, r.pureG])).toEqual([
      ['Chettinad Haram', 'TAG-7521', '78.4000'],
      ['Polki Kada pair', 'TAG-6690', '57.4900'],
    ]);
    expect(c.history[0].on).toBe('2026-10-12T00:00:00.000Z');
    // Rows of one day are ordered by tag.
    expect(c.history.slice(2, 4).map((r: HistoryItem) => r.tag)).toEqual(['TAG-1003', 'TAG-1004']);
    expect(c.history.slice(4).map((r: HistoryItem) => r.tag)).toEqual(['TAG-1002', 'TAG-1001']);
  });

  it('S9 AC3: a customer with no history has an empty history and zero pieces', async () => {
    const res = await h.asStaff('readCustomer', { customerId: (await addCustomer(h, { name: 'Fresh Face', phone: '+919800000301' })).code });
    expect(res.body.customer).toMatchObject({ history: [], pieceCount: 0, takenHomeG: '0.0000', consent: [] });
  });

  it('S9: birthday and anniversary come back as day and month', async () => {
    const c = await addCustomer(h, { name: 'Dates Given', phone: '+919800000302', dob: '1985-03-14', anniversary: '2000-12-02' });
    const res = await h.asStaff('readCustomer', { customerId: c.code });
    expect(res.body.customer).toMatchObject({ dob: { day: 14, month: 3 }, anniversary: { day: 2, month: 12 } });
  });

  it('S9 AC5: an unknown or erased customer is not_found', async () => {
    const erased = await addCustomer(h, { name: 'Erased customer', phone: null, status: 'erased' });
    for (const customerId of ['CU-997', erased.code]) {
      const res = await h.asStaff('readCustomer', { customerId });
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ code: 'not_found' });
    }
  });

  it('S9 AC4, S11 AC1, AC4: no response carries a price, value, budget or spend figure', async () => {
    await h.asStaff('listCustomers', {});
    const bodies = [
      (await h.asStaff('listCustomers', {})).body,
      (await h.asStaff('readCustomer', { customerId: meera.code })).body,
      (await h.asStaff('findCustomerByPhone', { phone: '98840 21107' })).body,
    ];
    for (const body of bodies) {
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/price|value|amount/i);
      expect(text).not.toMatch(/INR":(?!null)/);
    }
    const { rows } = await h.pool.query('select budget_inr, spent_inr from customers where shop_id = $1 and (budget_inr is not null or spent_inr is not null)', [h.shop.shopId]);
    expect(rows).toEqual([]);
  });

  it("S8: another shop's customers are not listed", async () => {
    const other = await startCustomersHarness();
    try {
      expect(names((await other.asStaff('listCustomers', {})).body as unknown as Page)).toEqual([]);
    } finally {
      await other.close();
    }
  });
});

describeDb('the directory with 10,000 customers (EP-17-S8 AC4)', () => {
  let h: CustomersHarness;
  beforeAll(async () => {
    h = await startCustomersHarness();
    await h.pool.query(
      `insert into customers (shop_id, code, name, phone, city, customer_group)
       select $1, 'CU-' || (1000 + i), 'Customer ' || lpad(i::text, 5, '0'), '+91' || (7000000000 + i)::text,
              case when i % 2 = 0 then 'Chennai' else 'Madurai' end, 'Regular'
         from generate_series(1, 10000) i`,
      [h.shop.shopId],
    );
  });
  afterAll(async () => {
    await h?.close();
  });

  it('the first page loads in under 2 seconds and later pages follow the cursor', async () => {
    const started = Date.now();
    const first = await h.asStaff('listCustomers', {});
    expect(Date.now() - started).toBeLessThan(2000);
    const page = first.body as unknown as Page;
    expect(page.items).toHaveLength(50);
    expect(page.nextCursor).not.toBeNull();
    const second = (await h.asStaff('listCustomers', { cursor: page.nextCursor })).body as unknown as Page;
    expect(second.items[0].name).toBe('Customer 00051');
    const searched = Date.now();
    const found = (await h.asStaff('listCustomers', { search: '7000009999' })).body as unknown as Page;
    expect(found.items.map((c) => c.name)).toEqual(['Customer 09999']);
    expect(Date.now() - searched).toBeLessThan(2000);
  });
});
