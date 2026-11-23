import type { RoleId } from '@goldsmith/shared';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StoreProvider } from '../../store/StoreProvider';
import { afterAuditAnswer, auditListInput, NO_FILTERS, securityLogNotice } from './security-log-state';
import type { AuditEntry, AuditListItem } from './security-log-state';
import { AuditEntries, AuditEntryDetail, AuditGroupButtons, AuditLogRow, SecurityLog, SecurityLogStatus } from './SecurityLog';
const as = (name: string, role: RoleId, screen: ReactElement) =>
  renderToStaticMarkup(
    <StoreProvider signedIn={{ name, role }} onSignOut={async () => null}>
      {screen}
    </StoreProvider>,
  );
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
const page = (items: AuditListItem[], nextCursor: string | null) =>
  ({ ok: true, data: { ok: true, items, nextCursor, pageSize: 50 } }) as const;
describe('security log screen (EP-06-S9 to S12)', () => {
  it('S9 AC1: the owner sees the title, subtitle and the log loading from the server', () => {
    const html = as('Sanjay Seth', 'owner', <SecurityLog />);
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
  it('S9 AC4: loading, a failed load with Retry, and reconnecting while offline', () => {
    expect(securityLogNotice({ loading: true, error: null, online: true })).toBe('loading');
    expect(securityLogNotice({ loading: false, error: 'Cannot reach the server.', online: true })).toBe('error');
    expect(securityLogNotice({ loading: true, error: 'Cannot reach the server.', online: false })).toBe('reconnecting');
    expect(securityLogNotice({ loading: false, error: null, online: true })).toBeNull();
    const status = (notice: 'loading' | 'error' | 'reconnecting', message: string | null = null) =>
      renderToStaticMarkup(<SecurityLogStatus notice={notice} message={message} onRetry={() => {}} />);
    expect(status('loading')).toContain('Loading the security log…');
    const failed = status('error', 'Cannot reach the server. Check the connection and try again.');
    expect(failed).toContain('Cannot reach the server. Check the connection and try again.');
    expect(failed).toMatch(/<button[^>]*>Retry<\/button>/);
    expect(status('reconnecting')).toContain('Reconnecting…');
  });
  it('S9 AC3, AC4: Load more adds a page; a failure keeps the rows and shows the message', () => {
    const second = { ...item, id: 'b2', ref: 'TAG-1001' };
    const first = afterAuditAnswer({ entries: [], nextCursor: null, loadError: null }, page([item], 'c1'));
    expect(first).toEqual({ entries: [item], nextCursor: 'c1', loadError: null });
    const more = afterAuditAnswer(first, page([second], null), 'c1');
    expect(more.entries.map((e) => e.id)).toEqual([item.id, 'b2']);
    const failed = afterAuditAnswer(more, { ok: false, code: 'internal', message: 'Try again.' });
    expect(failed).toEqual({ ...more, loadError: 'Try again.' });
    expect(afterAuditAnswer(more, page([second], null)).entries).toEqual([second]);
  });
  it('S9 AC5: a finished load with no entries shows the empty sentence', () => {
    const empty = afterAuditAnswer({ entries: [item], nextCursor: null, loadError: null }, page([], null));
    const html = renderToStaticMarkup(<AuditEntries entries={empty.entries} settled onOpen={() => {}} />);
    expect(html).toContain('Nothing has been logged under this heading.');
    const loading = renderToStaticMarkup(<AuditEntries entries={[]} settled={false} onOpen={() => {}} />);
    expect(loading).not.toContain('Nothing has been logged');
    expect(renderToStaticMarkup(<AuditEntries entries={[item]} settled onOpen={() => {}} />)).toContain('TAG-8841');
  });
  it('S10 AC1: the pressed group is marked and becomes the group filter', () => {
    const html = renderToStaticMarkup(<AuditGroupButtons group="edits" onChange={() => {}} />);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Tag edits</);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Everything</);
    expect(auditListInput({ ...NO_FILTERS, group: 'edits' })).toEqual({ group: 'edits' });
    expect(auditListInput(NO_FILTERS)).toEqual({});
    expect(
      auditListInput({ group: 'all', entity: ' TAG-8841 ', actor: 'system', from: '2026-03-01', to: '2026-03-07' }, 'c1'),
    ).toEqual({ entity: 'TAG-8841', actorRole: 'system', from: '2026-03-01', to: '2026-03-07', cursor: 'c1' });
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
      const html = as(name, role, <SecurityLog />);
      expect(html).toContain('Only the owner can read the security log.');
      expect(html).not.toContain('Loading the security log');
    }
  });
  it('the session permissions decide, not the role alone', () => {
    const html = renderToStaticMarkup(
      <StoreProvider signedIn={{ name: 'Sanjay Seth', role: 'owner' }} permissions={[]} onSignOut={async () => null}>
        <SecurityLog />
      </StoreProvider>,
    );
    expect(html).toContain('Only the owner can read the security log.');
  });
});
