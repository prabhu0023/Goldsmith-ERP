import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defineAction } from './action-controller';
import { createConnectionStore } from './connection';
import { createQueryClient, defineQuery } from './query-client';
import { QueryProvider } from './QueryProvider';
import { fail, fakeApi, fakeTimers, flush, ok } from './test-support';
import { useAction } from './use-action';
import { ConnectionProvider, useConnection } from './use-connection';
import { usePagedQuery } from './use-paged-query';
import { useQuery } from './use-query';

const listUsers = defineQuery({ op: 'listUsers', input: {} });
const disabled = defineQuery({ op: 'readRailBadges', input: {}, enabled: false });
const markLost = defineAction({ op: 'markLeadLost', fallback: 'Could not mark the lead lost.' });

function setup() {
  const fake = fakeApi();
  const clock = fakeTimers();
  const client = createQueryClient({ api: fake.api, now: clock.now, timers: clock.timers });
  return { fake, client };
}
const page = (ids: string[], nextCursor: string | null) => ok({ ok: true, items: ids.map((id) => ({ id })), nextCursor, pageSize: 2 });

function QueryProbe() {
  const q = useQuery(listUsers);
  const items = (q.data as { items?: Array<{ id: string }> } | undefined)?.items ?? [];
  return <p>{`${q.status}|${items.map((i) => i.id).join(',')}|${q.error?.message ?? ''}|${q.refreshing}`}</p>;
}
function Off() {
  return <p>{useQuery(disabled).status}</p>;
}
function Paged() {
  const p = usePagedQuery({ op: 'listUsers', input: {} });
  return <p>{`${p.status}|${p.items.map((i) => (i as { id: string }).id).join(',')}|${p.hasMore}|${p.loadingMore}|${p.loadMoreError?.message ?? ''}`}</p>;
}
function Act() {
  const a = useAction(markLost);
  return <p>{`${a.busy}|${a.refusal?.message ?? ''}|${a.maybeNotSaved}`}</p>;
}
function Conn() {
  const c = useConnection();
  return <p>{`${c.state}|${c.blocksActions()}|${c.reason ?? ''}`}</p>;
}
const html = (client: ReturnType<typeof setup>['client'], node: React.ReactNode) =>
  renderToStaticMarkup(<QueryProvider client={client}>{node}</QueryProvider>);

describe('useQuery', () => {
  it('renders loading before the first answer', () => {
    const { client } = setup();
    expect(html(client, <QueryProbe />)).toContain('loading||');
  });
  it('renders the ready data of a seeded client', async () => {
    const { fake, client } = setup();
    fake.on('listUsers', () => page(['u1', 'u2'], null));
    client.subscribe(listUsers, () => {});
    await flush();
    expect(html(client, <QueryProbe />)).toContain('ready|u1,u2||false');
  });
  it('renders the failed sentence of a seeded client', async () => {
    const { fake, client } = setup();
    fake.on('listUsers', () => fail('internal', 'The staff list could not be read.'));
    client.subscribe(listUsers, () => {});
    await flush();
    expect(html(client, <QueryProbe />)).toContain('failed||The staff list could not be read.|false');
  });
  it('a disabled query stays loading and never fetches', () => {
    const { fake, client } = setup();
    expect(html(client, <Off />)).toContain('loading');
    expect(fake.calls).toHaveLength(0);
  });
  it('outside a provider it says what is missing', () => {
    expect(() => renderToStaticMarkup(<QueryProbe />)).toThrow('QueryProvider');
  });
});

describe('usePagedQuery', () => {
  it('renders loading, then the first page with hasMore', async () => {
    const { fake, client } = setup();
    expect(html(client, <Paged />)).toContain('loading||false|false|');
    fake.on('listUsers', () => page(['u1', 'u2'], 'c2'));
    client.subscribe(listUsers, () => {});
    await flush();
    expect(html(client, <Paged />)).toContain('ready|u1,u2|true|false|');
  });
});

describe('useAction and useConnection', () => {
  it('an action with no provider is idle (the sign-in screens have no cache)', () => {
    expect(renderToStaticMarkup(<Act />)).toContain('false||false');
  });
  it('the connection with no provider follows the browser only: connecting, not blocked', () => {
    expect(renderToStaticMarkup(<Conn />)).toContain('connecting|false|');
  });
  it('the connection of a provider is shown, with the reason when actions are blocked', () => {
    const store = createConnectionStore({ windowLike: null });
    store.setLiveStatus('reconnecting');
    const out = renderToStaticMarkup(
      <ConnectionProvider store={store}>
        <Conn />
      </ConnectionProvider>,
    );
    expect(out).toContain('reconnecting|true|Reconnecting to the server. Try again when the connection is back.');
  });
});
