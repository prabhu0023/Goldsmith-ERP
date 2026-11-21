import { afterAll, beforeAll, expect, it } from 'vitest';
import { DEFAULT_PAGE_SIZE, encodeCursor, INVALID_CURSOR_MESSAGE, MAX_PAGE_SIZE } from '../../src/pipeline/paging.js';
import { describeDb } from '../db/db-test-helpers.js';
import { type Harness, startHarness } from '../support/api-harness.js';

interface Page {
  ok: true;
  items: Array<{ at: string; summary: string | null }>;
  nextCursor: string | null;
  pageSize: number;
}

describeDb('cursor paging (EP-03-S9)', () => {
  let h: Harness;

  /** Insert audit entries `entry-<from>`..`entry-<to - 1>`; every 5 share one `at`, with microseconds. */
  const addEntries = (from: number, to: number, base = '2026-11-20 09:00:00+00') =>
    h.pool.query(
      `insert into audit_entries (shop_id, at, actor_id, actor_name, actor_role, kind, summary)
       select $1, $2::timestamptz + (i / 5) * interval '1.000001 second', $3, 'Rajesh Verma', 'staff', 'stock_out', 'entry-' || i
         from generate_series($4::int, $5::int - 1) as i`,
      [h.shop.shopId, base, h.userId, from, to],
    );

  const list = async (body: Record<string, unknown>) => {
    const res = await h.call('listAuditEntries', body, { session: h.session });
    return { status: res.status, body: res.body as unknown as Page & Record<string, unknown> };
  };

  /** Every page from the first, following nextCursor. */
  const walk = async (pageSize?: number) => {
    const pages: Page[] = [];
    let cursor: string | undefined;
    do {
      const res = await list({ cursor, pageSize });
      expect(res.status).toBe(200);
      pages.push(res.body);
      cursor = res.body.nextCursor ?? undefined;
    } while (cursor !== undefined);
    return pages;
  };

  const dbOrder = async () =>
    (
      await h.pool.query<{ summary: string }>(
        'select summary from audit_entries where shop_id = $1 order by at desc, id desc',
        [h.shop.shopId],
      )
    ).rows.map((r) => r.summary);

  beforeAll(async () => {
    h = await startHarness();
    await addEntries(0, 500);
  });

  afterAll(async () => {
    await h.close();
  });

  it('AC1: the first page of 500 entries holds the default page size and a next cursor', async () => {
    const { status, body } = await list({});
    expect(status).toBe(200);
    expect(body.items).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(body.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(typeof body.nextCursor).toBe('string');
    expect(Object.keys(body).sort()).toEqual(['items', 'nextCursor', 'ok', 'pageSize']);
  });

  it('AC2, AC5: walking every page returns all 500 once, in (at desc, id desc) order; the last cursor is null', async () => {
    const pages = await walk();
    expect(pages).toHaveLength(10);
    const summaries = pages.flatMap((p) => p.items.map((i) => i.summary));
    expect(new Set(summaries).size).toBe(500);
    expect(summaries).toEqual(await dbOrder());
    expect(pages.at(-1)?.nextCursor).toBeNull();
    // Entries sharing one `at` are split across a page boundary and still neither repeat nor go missing.
    const smallPages = await walk(7);
    expect(smallPages.flatMap((p) => p.items.map((i) => i.summary))).toEqual(summaries);
  });

  it('S3 AC4: times in a page are ISO 8601 UTC', async () => {
    const { body } = await list({ pageSize: 3 });
    for (const item of body.items) expect(item.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('AC3: a page size above the maximum answers the maximum and does not fail', async () => {
    const { status, body } = await list({ pageSize: 1000 });
    expect(status).toBe(200);
    expect(body.items).toHaveLength(MAX_PAGE_SIZE);
    expect(body.pageSize).toBe(MAX_PAGE_SIZE);
  });

  it.each([
    ['garbage', 'not-a-cursor!'],
    ['base64 of non-JSON', Buffer.from('hello').toString('base64url')],
    ['wrong shape', encodeCursor(['yesterday', 'not-a-uuid'])],
    ['impossible time', encodeCursor(['2026-13-45 99:00:00+00', '00000000-0000-4000-8000-000000000000'])],
  ])('refuses a cursor that cannot be read (%s) as validation, field cursor', async (_label, cursor) => {
    const { status, body } = await list({ cursor });
    expect(status).toBe(400);
    expect(body).toEqual({ code: 'validation', field: 'cursor', message: INVALID_CURSOR_MESSAGE });
  });

  it('refuses page size 0 as validation, field pageSize', async () => {
    const { status, body } = await list({ pageSize: 0 });
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: 'validation', field: 'pageSize' });
  });

  it('AC4: entries added between page 1 and page 2 never bring a page-1 entry back', async () => {
    const first = await list({ pageSize: 20 });
    // Five newer than everything, and one at the time of page 1's last entry (to the millisecond).
    await addEntries(500, 505, '2026-11-21 09:00:00+00');
    const lastAt = first.body.items.at(-1)?.at as string;
    await h.pool.query(
      `insert into audit_entries (shop_id, at, actor_id, actor_name, actor_role, kind, summary)
       values ($1, $2, $3, 'Rajesh Verma', 'staff', 'stock_out', 'entry-tie')`,
      [h.shop.shopId, lastAt, h.userId],
    );
    const second = await list({ pageSize: 20, cursor: first.body.nextCursor });
    expect(second.status).toBe(200);
    const firstSummaries = new Set(first.body.items.map((i) => i.summary));
    expect(second.body.items.filter((i) => firstSummaries.has(i.summary))).toEqual([]);
    expect(second.body.items).toHaveLength(20);
  });
});
