import { describe, expect, it } from 'vitest';
import { createQueryClient, defineQuery } from './query-client';
import { keyOf } from './query-keys';
import { deferred, fail, fakeApi, fakeTimers, flush, networkFail, ok } from './test-support';

const piece = (tagNo: string, version: number) => ok({ ok: true, piece: { tagNo, version } });
const readPiece = (tagNo: string) =>
  defineQuery({
    op: 'readPiece',
    input: { tagNo },
    versionsOf: (d) => ({ [d.piece.tagNo]: d.piece.version }),
  });
const listUsers = defineQuery({ op: 'listUsers', input: {} });
const badges = defineQuery({ op: 'readRailBadges', input: {} });

function setup() {
  const fake = fakeApi();
  const clock = fakeTimers();
  const client = createQueryClient({ api: fake.api, now: clock.now, timers: clock.timers });
  return { fake, clock, client };
}

describe('keys (S2 AC5)', () => {
  it('equal inputs give equal keys whatever the property order; different inputs differ', () => {
    expect(keyOf('listUsers', { a: 1, b: 2 })).toBe(keyOf('listUsers', { b: 2, a: 1 }));
    expect(keyOf('readParcel', { code: 'BATCH-2026-044' })).not.toBe(keyOf('readParcel', { code: 'BATCH-2026-043' }));
  });
  it('two parcels are two entries and one never overwrites the other', async () => {
    const { fake, client } = setup();
    fake.on('readPiece', (input) => piece((input as { tagNo: string }).tagNo, 1));
    const a = readPiece('BATCH-2026-043');
    const b = readPiece('BATCH-2026-044');
    client.subscribe(a, () => {});
    client.subscribe(b, () => {});
    await flush();
    expect(client.getSnapshot(a).data?.piece.tagNo).toBe('BATCH-2026-043');
    expect(client.getSnapshot(b).data?.piece.tagNo).toBe('BATCH-2026-044');
    expect(fake.calls).toHaveLength(2);
  });
});

describe('reads (S2, S3, S4)', () => {
  it('S2 AC1: two subscribers to one key send one request and see the same answer', async () => {
    const { fake, client } = setup();
    fake.on('listUsers', () => ok({ ok: true, items: [{ id: 'u1' }], nextCursor: null, pageSize: 50, count: 42 }));
    client.subscribe(listUsers, () => {});
    client.subscribe(listUsers, () => {});
    await flush();
    expect(fake.callsOf('listUsers')).toHaveLength(1);
    expect(client.getSnapshot(listUsers).data).toMatchObject({ count: 42 });
  });

  it('S2 AC3: an entry holds key, data, fetchedAt, versions seen and a status', async () => {
    const { fake, client, clock } = setup();
    fake.on('readPiece', () => piece('TAG-8841', 7));
    await clock.advance(1000);
    const def = readPiece('TAG-8841');
    expect(client.getSnapshot(def)).toMatchObject({ key: def.key, status: 'loading', data: undefined, fetchedAt: null, versions: {} });
    client.subscribe(def, () => {});
    await flush();
    expect(client.getSnapshot(def)).toMatchObject({ key: def.key, status: 'ready', fetchedAt: 1000, versions: { 'TAG-8841': 7 }, refreshing: false });
    expect(client.inspectAll()).toHaveLength(1);
  });

  it('S2 AC2 and S3 AC5: cached data shows at once, and a refresh keeps it ready with no loading flash', async () => {
    const { fake, client } = setup();
    let version = 1;
    fake.on('readPiece', () => piece('TAG-8841', version));
    const def = readPiece('TAG-8841');
    const off = client.subscribe(def, () => {});
    await flush();
    off();
    version = 2;
    client.invalidate([{ op: 'readPiece' }]); // unobserved: only marked
    expect(fake.calls).toHaveLength(1);
    const seen: Array<{ status: string; refreshing: boolean; v: number | undefined }> = [];
    const gate = deferred<ReturnType<typeof ok>>();
    fake.on('readPiece', () => gate.promise);
    client.subscribe(def, () => {
      const s = client.getSnapshot(def);
      seen.push({ status: s.status, refreshing: s.refreshing, v: s.data?.piece.version });
    });
    expect(client.getSnapshot(def)).toMatchObject({ status: 'ready', refreshing: true });
    expect(client.getSnapshot(def).data?.piece.version).toBe(1);
    gate.resolve(piece('TAG-8841', 2));
    await flush();
    expect(client.getSnapshot(def).data?.piece.version).toBe(2);
    expect(seen.every((s) => s.status === 'ready')).toBe(true);
  });

  it('S2 AC4 and S9 AC5: TAG-8841 v7 is kept when v6 arrives later', async () => {
    const { fake, client } = setup();
    const answers = [piece('TAG-8841', 7), piece('TAG-8841', 6)];
    fake.on('readPiece', () => answers.shift() as never);
    const def = readPiece('TAG-8841');
    client.subscribe(def, () => {});
    await flush();
    await client.refetch(def);
    expect(client.getSnapshot(def).data?.piece.version).toBe(7);
    expect(client.getSnapshot(def).versions).toEqual({ 'TAG-8841': 7 });
    expect(client.getSnapshot(def).status).toBe('ready');
  });

  it('S4 AC2: a failed read keeps its error, Try again recovers without a reload', async () => {
    const { fake, client } = setup();
    const answers = [fail('internal', 'The staff list could not be read.'), ok({ ok: true, items: [] })];
    fake.on('listUsers', () => answers.shift() as never);
    client.subscribe(listUsers, () => {});
    await flush();
    expect(client.getSnapshot(listUsers)).toMatchObject({ status: 'failed', error: { code: 'internal', message: 'The staff list could not be read.' } });
    expect(await client.refetch(listUsers)).toBe(true);
    expect(client.getSnapshot(listUsers)).toMatchObject({ status: 'ready', error: undefined });
  });

  it('a failure keeps the data already held (S4 AC5: the 15 s time-out arrives as a failed read)', async () => {
    const { fake, client } = setup();
    const answers = [ok({ ok: true, items: ['a'] }), networkFail()];
    fake.on('listUsers', () => answers.shift() as never);
    client.subscribe(listUsers, () => {});
    await flush();
    await client.refetch(listUsers);
    expect(client.getSnapshot(listUsers)).toMatchObject({ status: 'failed', data: { items: ['a'] }, error: { code: 'internal' } });
  });

  it('the first read of a screen is a foreground read; an event refetch is a background read (S8 AC1 header rule)', async () => {
    const { fake, client, clock } = setup();
    fake.on('listUsers', () => ok({ ok: true, items: [] }));
    client.subscribe(listUsers, () => {});
    await flush();
    client.invalidate([{ op: 'listUsers' }]);
    await clock.advance(300);
    expect(fake.callsOf('listUsers').map((c) => c.opts?.background)).toEqual([false, true]);
  });

  it('enabled: false never fetches', async () => {
    const { fake, client, clock } = setup();
    fake.on('readRailBadges', () => ok({ ok: true, badges: {} }));
    const off = defineQuery({ op: 'readRailBadges', input: {}, enabled: false });
    client.subscribe(off, () => {});
    client.invalidate([{ op: 'readRailBadges' }]);
    await clock.advance(1000);
    await client.refetch(off);
    expect(fake.calls).toHaveLength(0);
  });
});

describe('invalidation (S7, S8)', () => {
  it('S8 AC5: 5 invalidations within 300 ms give one fetch', async () => {
    const { fake, client, clock } = setup();
    fake.on('readRailBadges', () => ok({ ok: true, badges: {} }));
    client.subscribe(badges, () => {});
    await flush();
    for (let i = 0; i < 5; i += 1) {
      client.invalidate([{ op: 'readRailBadges' }]);
      await clock.advance(50);
    }
    expect(fake.calls).toHaveLength(1);
    await clock.advance(300);
    expect(fake.calls).toHaveLength(2);
    await clock.advance(1000);
    expect(fake.calls).toHaveLength(2);
  });

  it('S8 AC4: an observed read refetches; a cached read nobody observes is only marked and refetches on the next mount', async () => {
    const { fake, client, clock } = setup();
    fake.on('listUsers', () => ok({ ok: true, items: [] }));
    fake.on('readRailBadges', () => ok({ ok: true, badges: {} }));
    client.subscribe(listUsers, () => {});
    const offBadges = client.subscribe(badges, () => {});
    await flush();
    offBadges();
    client.invalidate([{ op: 'listUsers' }, { op: 'readRailBadges' }]);
    await clock.advance(300);
    expect(fake.callsOf('listUsers')).toHaveLength(2);
    expect(fake.callsOf('readRailBadges')).toHaveLength(1);
    client.subscribe(badges, () => {});
    await flush();
    expect(fake.callsOf('readRailBadges')).toHaveLength(2);
  });

  it('a ref with an input matches only that key; one without matches every entry of the operation', async () => {
    const { fake, client, clock } = setup();
    fake.on('readPiece', (input) => piece((input as { tagNo: string }).tagNo, 1));
    client.subscribe(readPiece('TAG-1'), () => {});
    client.subscribe(readPiece('TAG-2'), () => {});
    await flush();
    client.invalidate([{ op: 'readPiece', input: { tagNo: 'TAG-1' } }]);
    await clock.advance(300);
    expect(fake.calls).toHaveLength(3);
    client.invalidate([{ op: 'readPiece' }]);
    await clock.advance(300);
    expect(fake.calls).toHaveLength(5);
  });

  it('an event whose entity version the entry already holds fetches nothing', async () => {
    const { fake, client, clock } = setup();
    fake.on('readPiece', () => piece('TAG-8841', 7));
    client.subscribe(readPiece('TAG-8841'), () => {});
    await flush();
    client.invalidate([{ op: 'readPiece' }], { entity: { id: 'TAG-8841', version: 7 } });
    await clock.advance(300);
    expect(fake.calls).toHaveLength(1);
    client.invalidate([{ op: 'readPiece' }], { entity: { id: 'TAG-8841', version: 8 } });
    await clock.advance(300);
    expect(fake.calls).toHaveLength(2);
  });

  it('S7 AC4: after the own action refetch, the event for the same change causes no second fetch', async () => {
    const { fake, client, clock } = setup();
    fake.on('listUsers', () => ok({ ok: true, items: [] }));
    client.subscribe(listUsers, () => {});
    await flush();
    const [refetched] = client.refetchNow({ op: 'listUsers' });
    await refetched;
    expect(fake.callsOf('listUsers')).toHaveLength(2);
    await clock.advance(100);
    client.invalidate([{ op: 'listUsers' }]);
    await clock.advance(1000);
    expect(fake.callsOf('listUsers')).toHaveLength(2);
    // After the window an event is a real change again.
    client.invalidate([{ op: 'listUsers' }]);
    await clock.advance(300);
    expect(fake.callsOf('listUsers')).toHaveLength(3);
  });

  it('refetchNow cancels a pending coalescing timer and reports a failed refetch as false', async () => {
    const { fake, client, clock } = setup();
    const answers = [ok({ ok: true, items: [] }), fail('internal', 'down')];
    fake.on('listUsers', () => answers.shift() as never);
    client.subscribe(listUsers, () => {});
    await flush();
    client.invalidate([{ op: 'listUsers' }]);
    const results = await Promise.all(client.refetchNow({ op: 'listUsers' }));
    expect(results).toEqual([false]);
    expect(clock.pending()).toBe(0);
  });

  it('a change that lands while a fetch is running is fetched again after it (the first answer may predate it)', async () => {
    const { fake, client } = setup();
    const first = deferred<ReturnType<typeof ok>>();
    const calls: number[] = [];
    fake.on('listUsers', (_i, _o, n) => {
      calls.push(n);
      return n === 1 ? first.promise : ok({ ok: true, items: ['new'] });
    });
    client.subscribe(listUsers, () => {});
    const [again] = client.refetchNow({ op: 'listUsers' });
    expect(calls).toEqual([1]);
    first.resolve(ok({ ok: true, items: ['old'] }));
    await again;
    expect(calls).toEqual([1, 2]);
    expect(client.getSnapshot(listUsers).data).toMatchObject({ items: ['new'] });
  });
});

describe('connection loss (S9 AC5, S10, S11 AC2)', () => {
  it('S11 AC2: markPossiblyStale keeps the data and flags it; markFresh clears the flag', async () => {
    const { fake, client } = setup();
    fake.on('listUsers', () => ok({ ok: true, items: ['a'] }));
    client.subscribe(listUsers, () => {});
    await flush();
    client.markPossiblyStale();
    expect(client.getSnapshot(listUsers)).toMatchObject({ status: 'possibly_stale', data: { items: ['a'] } });
    client.markFresh();
    expect(client.getSnapshot(listUsers).status).toBe('ready');
  });

  it('S10 AC3: refetchAllObserved refetches every observed read and marks the others', async () => {
    const { fake, client, clock } = setup();
    fake.on('listUsers', () => ok({ ok: true, items: [] }));
    fake.on('readRailBadges', () => ok({ ok: true, badges: {} }));
    client.subscribe(listUsers, () => {});
    const offBadges = client.subscribe(badges, () => {});
    await flush();
    offBadges();
    await client.refetchAllObserved();
    expect(fake.callsOf('listUsers')).toHaveLength(2);
    expect(fake.callsOf('readRailBadges')).toHaveLength(1);
    client.subscribe(badges, () => {});
    await flush();
    expect(fake.callsOf('readRailBadges')).toHaveLength(2);
    await clock.advance(0);
  });

  it('whenIdle resolves after the running fetches and pending timers are done', async () => {
    const { fake, client, clock } = setup();
    const gate = deferred<ReturnType<typeof ok>>();
    fake.on('listUsers', () => gate.promise);
    client.subscribe(listUsers, () => {});
    let idle = false;
    void client.whenIdle().then(() => {
      idle = true;
    });
    await flush();
    expect(idle).toBe(false);
    gate.resolve(ok({ ok: true, items: [] }));
    await flush();
    expect(idle).toBe(true);
    fake.on('listUsers', () => ok({ ok: true, items: [] }));
    client.invalidate([{ op: 'listUsers' }]);
    idle = false;
    void client.whenIdle().then(() => {
      idle = true;
    });
    await flush();
    expect(idle).toBe(false);
    await clock.advance(300);
    expect(idle).toBe(true);
  });

  it('clear empties the cache, stops timers, and drops an answer that was on its way', async () => {
    const { fake, client, clock } = setup();
    const gate = deferred<ReturnType<typeof ok>>();
    fake.on('listUsers', () => gate.promise);
    client.subscribe(listUsers, () => {});
    client.invalidate([{ op: 'listUsers' }]);
    client.clear();
    expect(client.inspectAll()).toEqual([]);
    expect(clock.pending()).toBe(0);
    gate.resolve(ok({ ok: true, items: ['secret'] }));
    await flush();
    expect(client.inspectAll()).toEqual([]);
  });
});
