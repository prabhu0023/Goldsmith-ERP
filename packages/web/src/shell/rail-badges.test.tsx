import type { LiveHandle } from './signed-in-runtime';
import type { RailBadges } from '@goldsmith/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createConnectionStore } from '../query/connection';
import { connectLiveBridge } from '../query/live-bridge';
import { QueryProvider } from '../query/QueryProvider';
import { createQueryClient } from '../query/query-client';
import { fail, fakeApi, fakeLive, fakeTimers, flush, ok } from '../query/test-support';
import { railBadgesFrom, railBadgesQuery, useRailBadges } from './rail-badges';
import type { RoleId } from '@goldsmith/shared';
const counts = (badges: RailBadges) => ok({ ok: true, badges });
function setup() {
  const fake = fakeApi();
  const clock = fakeTimers();
  const queries = createQueryClient({ api: fake.api, now: clock.now, timers: clock.timers });
  const connection = createConnectionStore({ windowLike: { navigator: { onLine: true }, addEventListener: () => {}, removeEventListener: () => {} } });
  const l = fakeLive('open');
  connectLiveBridge({ live: l.live as LiveHandle, queries, connection, me: { userId: 'u-me' }, onSessionEnded: () => {}, timers: clock.timers });
  return { fake, clock, queries, l };
}
function Badges({ role }: { role: RoleId }) {
  return <p>{JSON.stringify(useRailBadges(role))}</p>;
}
const html = (queries: ReturnType<typeof setup>['queries'], role: RoleId) =>
  renderToStaticMarkup(
    <QueryProvider client={queries}>
      <Badges role={role} />
    </QueryProvider>,
  ).replaceAll('&quot;', '"');
describe('rail badges from the server (EP-08-S16, EP-07-S9)', () => {
  it('S16 AC3: while the read loads no number shows, never a 0', () => {
    const { queries } = setup();
    expect(html(queries, 'owner')).toBe('<p>{}</p>');
  });
  it('S16 AC1: the counts come from readRailBadges', async () => {
    const { fake, queries } = setup();
    fake.on('readRailBadges', () => counts({ decisions: 2, leads: 5, parcels: 3, stock: 7 }));
    queries.subscribe(railBadgesQuery('owner'), () => {});
    await flush();
    expect(html(queries, 'owner')).toBe('<p>{"decisions":2,"leads":5,"parcels":3,"stock":7}</p>');
  });
  it('S16 AC2: a parcel.stopped event moves the parcels badge from 3 to 4', async () => {
    const { fake, clock, queries, l } = setup();
    let parcels = 3;
    fake.on('readRailBadges', () => counts({ parcels }));
    queries.subscribe(railBadgesQuery('owner'), () => {});
    await flush();
    expect(railBadgesFrom(queries.getSnapshot(railBadgesQuery('owner')))).toEqual({ parcels: 3 });
    parcels = 4;
    l.push('parcel.stopped');
    await clock.advance(300);
    expect(railBadgesFrom(queries.getSnapshot(railBadgesQuery('owner')))).toEqual({ parcels: 4 });
  });
  it('S16 AC4: a failed read shows no badge', async () => {
    const { fake, queries } = setup();
    fake.on('readRailBadges', () => fail('internal', 'Cannot reach the server.'));
    queries.subscribe(railBadgesQuery('owner'), () => {});
    await flush();
    expect(html(queries, 'owner')).toBe('<p>{}</p>');
  });
  it('S16 AC5: a karigar has no badge and no read is made', async () => {
    const { fake, clock, queries, l } = setup();
    fake.on('readRailBadges', () => counts({ parcels: 1 }));
    queries.subscribe(railBadgesQuery('karigar'), () => {});
    l.push('parcel.stopped');
    await clock.advance(1000);
    expect(fake.callsOf('readRailBadges')).toHaveLength(0);
    expect(html(queries, 'karigar')).toBe('<p>{}</p>');
  });
  it('S9 AC5 (EP-07): a burst of 5 badge events within one coalescing window leads to one read after the burst', async () => {
    const { fake, clock, queries, l } = setup();
    fake.on('readRailBadges', () => counts({ leads: 1 }));
    queries.subscribe(railBadgesQuery('staff'), () => {});
    await flush();
    for (let i = 0; i < 5; i += 1) {
      l.push('lead.alert');
      await clock.advance(50);
    }
    await clock.advance(300);
    expect(fake.callsOf('readRailBadges')).toHaveLength(2);
  });
  it('events that do not move a badge (tag saved, metal pool) cause no read', async () => {
    const { fake, clock, queries, l } = setup();
    fake.on('readRailBadges', () => counts({ leads: 1 }));
    queries.subscribe(railBadgesQuery('staff'), () => {});
    await flush();
    l.push('tag.saved');
    l.push('metal_pool.changed');
    await clock.advance(1000);
    expect(fake.callsOf('readRailBadges')).toHaveLength(1);
  });
  it('the six badge events each refresh the badges', async () => {
    const topics = ['piece.billed', 'parcel.stopped', 'edit.proposed', 'edit.applied', 'lead.alert', 'parcel.handed_over'] as const;
    for (const topic of topics) {
      const { fake, clock, queries, l } = setup();
      fake.on('readRailBadges', () => counts({ leads: 1 }));
      queries.subscribe(railBadgesQuery('owner'), () => {});
      await flush();
      l.push(topic);
      await clock.advance(300);
      expect(fake.callsOf('readRailBadges'), topic).toHaveLength(2);
    }
  });
});
