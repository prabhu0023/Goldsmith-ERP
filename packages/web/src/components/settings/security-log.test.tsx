import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createQueryClient, defineQuery } from '../../query/query-client';
import { fakeApi, fakeTimers, flush, networkFail, ok } from '../../query/test-support';
import { renderAs } from '../../test-support/render-as';
import { auditListInput, NO_FILTERS } from './security-log-state';
import type { AuditEntry, AuditListItem } from './security-log-state';
import { AuditEntries, AuditEntryDetail, AuditGroupButtons, AuditLogRow, SecurityLog } from './SecurityLog';
const item: AuditListItem = {
  id: '6f1c2a34-0b6e-4c9a-9d3e-2f5b8a7c1d10',
  at: '2026-11-22T09:02:00.000Z',
  atLocal: '2026-11-22T14:32:00.000+05:30',
  kind: 'edit_applied',
  entityType: 'edit',
  entityId: 'ED-2026-014',
  ref: 'TAG-8841',
  actorId: '0d6c3f9e-5a2b-4e71-8c4d-9b0a1e2f3c45',
  actorName: 'Sanjay Seth',
  actorRole: 'owner',
  summary: 'Edit applied to TAG-8841',
  tokenUsed: true,
};
const entry: AuditEntry = {
  ...item,
  before: { grossG: 486500 },
  after: { grossG: 486100 },
  reason: 'Re-weighed on the counter scale',
  detail: null,
  tokenReference: 'TK-2026-0042',
  corrects: null,
};
const page = (items: AuditListItem[], nextCursor: string | null) => ok({ ok: true, items, nextCursor, pageSize: 50 });
const logQuery = defineQuery({ op: 'listAuditEntries', input: {} });
/** A cache whose security-log read answers as `answers` says, one answer per read, already asked once. */
async function cacheWith(...answers: Array<ReturnType<typeof ok>>) {
  const fake = fakeApi();
  const clock = fakeTimers();
  const queries = createQueryClient({ api: fake.api, now: clock.now, timers: clock.timers });
  let n = 0;
  fake.on('listAuditEntries', () => answers[Math.min(n++, answers.length - 1)]);
  fake.on('listUsers', () => ok({ ok: true, items: [], nextCursor: null, pageSize: 200 }));
  queries.subscribe(logQuery, () => {});
  await flush();
  return queries;
}
describe('security log screen (EP-06-S9 to S12)', () => {
  it('S9 AC1: the owner sees the title, subtitle and the log loading from the server', () => {
    const html = renderAs('Sanjay Seth', 'owner', <SecurityLog />);
    expect(html).toContain('Security log');
    expect(html).toContain('Everything that changed the books and who did it. Entries are never edited or removed.');
    expect(html).toContain('Loading the security log…');
    expect(html).not.toContain('Only the owner can read the security log.');
  });
  it('S9 AC2: a row shows the action, ref, shop time and actor', () => {
    const html = renderToStaticMarkup(<AuditLogRow entry={item} onOpen={() => {}} />);
    for (const text of ['Edit applied', 'TAG-8841', '14:32 IST', 'Sanjay Seth (owner)', 'Edit applied to TAG-8841']) {
      expect(html).toContain(text);
    }
  });
  it('S9 AC3: rows from the server show with their action, ref and actor', async () => {
    const queries = await cacheWith(page([item], null));
    const html = renderAs('Sanjay Seth', 'owner', <SecurityLog />, { queries });
    expect(html).toContain('TAG-8841');
    expect(html).toContain('Sanjay Seth (owner)');
    expect(html).not.toContain('Loading the security log');
  });
  it('S4 AC1, S18 AC4: an unreachable server says the log could not be loaded and offers Try again', async () => {
    const queries = await cacheWith(networkFail());
    const html = renderAs('Sanjay Seth', 'owner', <SecurityLog />, { queries });
    expect(html).toContain('The security log could not be loaded.');
    expect(html).toContain('Cannot reach the server. Check the connection and try again.');
    expect(html).toMatch(/<button[^>]*>Try again<\/button>/);
    expect(html).not.toContain('Nothing has been logged');
  });
  it('S4 AC2: Try again loads the log once the server is back, without a reload', async () => {
    const queries = await cacheWith(networkFail(), page([item], null));
    expect(renderAs('Sanjay Seth', 'owner', <SecurityLog />, { queries })).toContain('could not be loaded');
    expect(await queries.refetch(logQuery)).toBe(true);
    const html = renderAs('Sanjay Seth', 'owner', <SecurityLog />, { queries });
    expect(html).toContain('TAG-8841');
    expect(html).not.toContain('could not be loaded');
  });
  it('S9 AC5: a finished read with no entries shows the empty sentence; a pending one does not', async () => {
    const queries = await cacheWith(page([], null));
    expect(renderAs('Sanjay Seth', 'owner', <SecurityLog />, { queries })).toContain('Nothing has been logged under this heading.');
    expect(renderAs('Sanjay Seth', 'owner', <SecurityLog />)).not.toContain('Nothing has been logged');
    expect(renderToStaticMarkup(<AuditEntries entries={[item]} onOpen={() => {}} />)).toContain('TAG-8841');
  });
  it('S10 AC1: the pressed group is marked and becomes the group filter', () => {
    const html = renderToStaticMarkup(<AuditGroupButtons group="edits" onChange={() => {}} />);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Tag edits</);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Everything</);
    expect(auditListInput({ ...NO_FILTERS, group: 'edits' })).toEqual({ group: 'edits' });
    expect(auditListInput(NO_FILTERS)).toEqual({});
    expect(auditListInput({ group: 'all', entity: ' TAG-8841 ', actor: 'system', from: '2026-03-01', to: '2026-03-07' })).toEqual({
      entity: 'TAG-8841',
      actorRole: 'system',
      from: '2026-03-01',
      to: '2026-03-07',
    });
    expect(auditListInput({ ...NO_FILTERS, actor: item.actorId ?? '' })).toEqual({ actorId: item.actorId });
  });
  it('S11 AC1, AC3: the detail shows weights to four decimals and "Token used", never the token reference', () => {
    const html = renderToStaticMarkup(<AuditEntryDetail entry={entry} onOpenEntry={() => {}} />);
    for (const text of ['Sanjay Seth (owner)', '22 Nov 2026, 14:32 IST', 'Edit applied', 'ED-2026-014', 'Gross weight']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('48.6500 g → 48.6100 g');
    expect(html).toContain('Re-weighed on the counter scale');
    expect(html).toContain('Token used');
    expect(html).not.toContain('TK-2026-0042');
    expect(html).not.toMatch(/\b\d{6}\b/);
  });
  it('S11 AC2: a lost lead shows its state change and the reason', () => {
    const html = renderToStaticMarkup(
      <AuditEntryDetail
        entry={{
          ...entry,
          kind: 'lead_lost',
          entityType: 'lead',
          entityId: 'LD-2026-213',
          ref: 'LD-2026-213',
          before: { state: 'opened', note: null },
          after: { state: 'lost', note: 'Customer went elsewhere.' },
          reason: 'Customer went elsewhere.',
          tokenReference: null,
          tokenUsed: false,
        }}
        onOpenEntry={() => {}}
      />,
    );
    expect(html).toContain('Lead lost');
    expect(html).toContain('State: </span><span class="text-ink">opened → lost');
    expect(html).toContain('Customer went elsewhere.');
  });
  it('S11 AC3: a scheduler entry shows its actor as System and no token when none was used', () => {
    const html = renderToStaticMarkup(
      <AuditEntryDetail
        entry={{ ...entry, actorId: null, actorName: 'Scheduler', actorRole: 'system', tokenReference: null, tokenUsed: false }}
        onOpenEntry={() => {}}
      />,
    );
    expect(html).toContain('Scheduler (System)');
    expect(html).not.toContain('Token used');
  });
  it('S11 AC5: a correction offers the entry it corrects', () => {
    const earlier = { id: '1a2b3c4d-0000-4000-8000-000000000001', kind: 'edit_applied' as const, at: '2026-11-22T08:00:00.000Z' };
    const html = renderToStaticMarkup(
      <AuditEntryDetail entry={{ ...entry, ref: earlier.id, corrects: earlier }} onOpenEntry={() => {}} />,
    );
    expect(html).toMatch(/<button[^>]*>Corrects an earlier entry<\/button>/);
    expect(renderToStaticMarkup(<AuditEntryDetail entry={entry} onOpenEntry={() => {}} />)).not.toContain(
      'Corrects an earlier entry',
    );
  });
  it('S12 AC3: staff and karigars see the owner-only sentence and no log', () => {
    for (const [name, role] of [
      ['Rajesh Verma', 'staff'],
      ['Lakshmi Devi', 'karigar'],
    ] as const) {
      const html = renderAs(name, role, <SecurityLog />);
      expect(html).toContain('Only the owner can read the security log.');
      expect(html).not.toContain('Loading the security log');
    }
  });
  it('the session permissions decide, not the role alone', () => {
    const html = renderAs('Sanjay Seth', 'owner', <SecurityLog />, { permissions: [] });
    expect(html).toContain('Only the owner can read the security log.');
  });
});
