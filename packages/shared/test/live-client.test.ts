import { describe, expect, it } from 'vitest';
import {
  createLiveClient,
  type LiveClientOperation,
  type LiveEnvelope,
  type LiveServerMessage,
  type LiveStreamHandlers,
  type LiveStreamSource,
  type LiveTimers,
} from '../src/index.js';

/** Timers that only move when the test says so. */
function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void; every: number | null }>();
  const timers: LiveTimers = {
    setTimeout: (fn, ms) => {
      const id = nextId++;
      pending.set(id, { at: now + ms, fn, every: null });
      return id;
    },
    clearTimeout: (id) => void pending.delete(id as number),
    setInterval: (fn, ms) => {
      const id = nextId++;
      pending.set(id, { at: now + ms, fn, every: ms });
      return id;
    },
    clearInterval: (id) => void pending.delete(id as number),
  };
  return {
    timers,
    now: () => now,
    /** Run every timer due within `ms`, in time order. */
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...pending.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, t] = due;
        now = t.at;
        if (t.every === null) pending.delete(id);
        else t.at += t.every;
        t.fn();
        await flush();
      }
      now = end;
    },
  };
}

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

interface FakeStream {
  since: number | null;
  openedAt: number;
  closed: boolean;
  h: LiveStreamHandlers;
  send(msg: LiveServerMessage): void;
}

function fakeSource(clock: () => number) {
  const streams: FakeStream[] = [];
  const source: LiveStreamSource = {
    open(since, h) {
      const s: FakeStream = { since, openedAt: clock(), closed: false, h, send: (msg) => h.onMessage(msg) };
      streams.push(s);
      return {
        close: () => {
          s.closed = true;
        },
      };
    },
  };
  return { source, streams, last: () => streams[streams.length - 1], open: () => streams.filter((s) => !s.closed) };
}

function fakeOps() {
  const calls: Array<{ op: LiveClientOperation; input: Record<string, string> }> = [];
  return {
    calls,
    ops: {
      call: async (op: LiveClientOperation, input: Record<string, string>) => {
        calls.push({ op, input });
        return { ok: true };
      },
    },
  };
}

const hello = (connectionId: string, seq: number): LiveServerMessage => ({
  type: 'hello',
  connectionId,
  userId: 'u-rajesh',
  role: 'staff',
  channels: ['user:u-rajesh', 'role:staff'],
  seq,
});

const event = (seq: number, entityId = 'TAG-8841'): LiveServerMessage => ({
  type: 'event',
  event: {
    seq,
    name: 'Piece billed by one staff member',
    entityType: 'piece',
    entityId,
    entityVersion: 2,
    emittedAt: '2026-11-21T10:00:00.000Z',
    audience: { channels: ['role:staff'] },
  },
});

function setup(opts: { session?: () => Promise<boolean>; heartbeatMs?: number } = {}) {
  const t = fakeTimers();
  const src = fakeSource(t.now);
  const o = fakeOps();
  let sessionChecks = 0;
  const client = createLiveClient({
    source: src.source,
    ops: o.ops,
    timers: t.timers,
    checkSession: async () => {
      sessionChecks += 1;
      return opts.session ? opts.session() : true;
    },
    presenceHeartbeatMs: opts.heartbeatMs,
  });
  const received: LiveEnvelope[] = [];
  client.onEvent((e) => received.push(e));
  return { t, src, o, client, received, sessionChecks: () => sessionChecks };
}

describe('EP-07 shared live client', () => {
  it('S3 AC1: one connection is open at a time, however often it starts or reconnects', async () => {
    const { t, src, client } = setup();
    client.start();
    client.start();
    expect(src.streams).toHaveLength(1);
    src.last().send(hello('c1', 10));
    expect(client.status()).toBe('open');
    expect(client.connectionId()).toBe('c1');
    src.last().h.onError('dropped');
    expect(src.open()).toHaveLength(0);
    await t.advance(500);
    expect(src.streams).toHaveLength(2);
    expect(src.open()).toHaveLength(1);
    client.stop();
    expect(src.open()).toHaveLength(0);
    expect(client.status()).toBe('stopped');
  });

  it('S2 AC2: events reach listeners in strictly increasing seq order, a repeated or older seq is dropped', () => {
    const { src, client, received } = setup();
    client.start();
    src.last().send(hello('c1', 100));
    for (const s of [101, 102, 102, 101, 104]) src.last().send(event(s));
    expect(received.map((e) => e.seq)).toEqual([101, 102, 104]);
    expect(client.lastSeq()).toBe(104);
  });

  it('S7 AC3: an event already received is not delivered twice after a resume, and the resume sends since', async () => {
    const { t, src, client, received } = setup();
    client.start();
    expect(src.last().since).toBeNull();
    src.last().send(hello('c1', 1040));
    src.last().send(event(1041));
    src.last().send(event(1042));
    src.last().h.onError('dropped');
    await t.advance(500);
    expect(src.last().since).toBe(1042);
    src.last().send(hello('c2', 1042));
    src.last().send(event(1042));
    src.last().send(event(1043));
    src.last().send({ type: 'replayed', seq: 1043 });
    expect(received.map((e) => e.seq)).toEqual([1041, 1042, 1043]);
    expect(client.connectionId()).toBe('c2');
  });

  it('S7 AC4: reconnects with growing delays up to the maximum and never stops trying', async () => {
    const { t, src, client } = setup();
    client.start();
    src.last().send(hello('c1', 1));
    const delays: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      const before = src.streams.length;
      const droppedAt = t.now();
      src.last().h.onError('dropped');
      expect(client.status()).toBe('reconnecting');
      while (src.streams.length === before) await t.advance(100);
      delays.push(src.last().openedAt - droppedAt);
    }
    expect(delays).toEqual([500, 1000, 2000, 4000, 8000, 15000, 15000, 15000, 15000, 15000]);
    // A hello resets the delay.
    src.last().send(hello('c9', 1));
    const droppedAt = t.now();
    src.last().h.onError('dropped');
    await t.advance(500);
    expect(src.last().openedAt - droppedAt).toBe(500);
  });

  it('S7 AC4: a refused open while the session still lives (server unreachable) is retried too', async () => {
    const { t, src, client, sessionChecks } = setup({ session: async () => true });
    client.start();
    src.last().h.onError('refused');
    await flush();
    expect(sessionChecks()).toBe(1);
    await t.advance(500);
    expect(src.streams).toHaveLength(2);
    expect(client.status()).toBe('reconnecting');
  });

  it('S7 AC5: a resume refused because the session expired leaves the client signed_out and stopped', async () => {
    let alive = true;
    const { t, src, client } = setup({ session: async () => alive });
    const statuses: string[] = [];
    client.onStatus((s) => statuses.push(s));
    client.start();
    src.last().send(hello('c1', 5));
    src.last().h.onError('dropped');
    alive = false;
    await t.advance(500);
    src.last().h.onError('refused');
    await flush();
    expect(client.status()).toBe('signed_out');
    await t.advance(60_000);
    expect(src.streams).toHaveLength(2);
    expect(statuses).toEqual(['connecting', 'open', 'reconnecting', 'signed_out']);
  });

  it('S7 AC5: closed {session_ended} asks for the session; a dead session ends in signed_out', async () => {
    const { t, src, client } = setup({ session: async () => false });
    client.start();
    src.last().send(hello('c1', 5));
    src.last().send({ type: 'closed', reason: 'session_ended' });
    await flush();
    expect(client.status()).toBe('signed_out');
    await t.advance(60_000);
    expect(src.streams).toHaveLength(1);
  });

  it('closed {going_away} reconnects from the last seq', async () => {
    const { t, src, client } = setup();
    client.start();
    src.last().send(hello('c1', 7));
    src.last().send({ type: 'closed', reason: 'going_away' });
    await t.advance(500);
    expect(src.streams).toHaveLength(2);
    expect(src.last().since).toBe(7);
  });

  it('refetch_all moves the position and tells the screen to reload', () => {
    const { src, client } = setup();
    let reloads = 0;
    client.onRefetchAll(() => {
      reloads += 1;
    });
    client.start();
    src.last().send(hello('c1', 3));
    src.last().send({ type: 'refetch_all', seq: 900 });
    expect(reloads).toBe(1);
    expect(client.lastSeq()).toBe(900);
  });

  it('S8: the presence heartbeat repeats joinParcelPresence and re-joins with the new connection after a reconnect', async () => {
    const { t, src, o, client } = setup({ heartbeatMs: 10_000 });
    const presence: Array<[string, string[]]> = [];
    client.onPresence((p, others) => presence.push([p, others.map((x) => x.name)]));
    client.start();
    src.last().send(hello('c1', 1));
    client.subscribe('karigar_job:JOB-0001');
    client.joinPresence('BATCH-2026-044');
    const joins = () => o.calls.filter((c) => c.op === 'joinParcelPresence');
    expect(joins()).toEqual([{ op: 'joinParcelPresence', input: { connectionId: 'c1', parcelId: 'BATCH-2026-044' } }]);
    await t.advance(30_000);
    expect(joins()).toHaveLength(4);
    src.last().send({ type: 'presence', parcelId: 'BATCH-2026-044', others: [{ userId: 'u-d', name: 'Deepak Rao' }] });
    expect(presence).toEqual([['BATCH-2026-044', ['Deepak Rao']]]);

    src.last().h.onError('dropped');
    await t.advance(500);
    src.last().send(hello('c2', 1));
    expect(o.calls.filter((c) => c.input.connectionId === 'c2').map((c) => c.op)).toEqual([
      'subscribeLiveChannel',
      'joinParcelPresence',
    ]);

    client.leavePresence('BATCH-2026-044');
    expect(o.calls.at(-1)).toEqual({ op: 'leaveParcelPresence', input: { connectionId: 'c2', parcelId: 'BATCH-2026-044' } });
    const count = joins().length;
    await t.advance(60_000);
    expect(joins()).toHaveLength(count);
  });

  it("S8: a second tab shows the join answer's list, though its join changes nobody's list and is not broadcast", async () => {
    const t = fakeTimers();
    const src = fakeSource(t.now);
    const answers: Array<(others: Array<{ userId: string; name: string }>) => void> = [];
    const client = createLiveClient({
      source: src.source,
      timers: t.timers,
      checkSession: async () => true,
      ops: {
        call: (op) =>
          op === 'joinParcelPresence'
            ? new Promise((resolve) => answers.push((others) => resolve({ ok: true, others })))
            : Promise.resolve({ ok: true }),
      },
    });
    const presence: Array<[string, string[]]> = [];
    client.onPresence((p, others) => presence.push([p, others.map((x) => x.name)]));
    client.start();
    src.last().send(hello('c-tab2', 1));
    client.joinPresence('BATCH-2026-044');
    answers.shift()?.([{ userId: 'u-d', name: 'Deepak Rao' }]);
    await flush();
    expect(presence).toEqual([['BATCH-2026-044', ['Deepak Rao']]]);
    // Heartbeat answers do not report: the broadcasts carry later changes.
    await t.advance(10_000);
    answers.shift()?.([{ userId: 'u-x', name: 'Stale Answer' }]);
    await flush();
    expect(presence).toHaveLength(1);
    // A rejoin after a reconnect reports, unless a presence message arrived while it was on its way.
    src.last().h.onError('dropped');
    await t.advance(500);
    src.last().send(hello('c-tab2b', 1));
    src.last().send({ type: 'presence', parcelId: 'BATCH-2026-044', others: [] });
    answers.shift()?.([{ userId: 'u-d', name: 'Deepak Rao' }]);
    await flush();
    expect(presence).toEqual([
      ['BATCH-2026-044', ['Deepak Rao']],
      ['BATCH-2026-044', []],
    ]);
    client.stop();
  });
});
