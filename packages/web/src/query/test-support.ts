/**
 * Test doubles for the query layer: a fake api whose answers a test controls, and timers moved
 * by hand. Used by the query tests only; nothing in the app imports this file.
 */
import { LIVE_CATALOGUE, type LiveClient, type LiveEnvelope, type LiveStatus, type LiveTimers } from '@goldsmith/shared';
import type { ApiClient } from '../api/api-client';

type AnyAnswer = { ok: true; data: unknown } | { ok: false; code: string; message: string; field?: string; network?: true };
export interface FakeCall {
  op: string;
  input: unknown;
  opts: { idempotencyKey?: string | false; background?: boolean } | undefined;
}
type Handler = (input: unknown, opts: FakeCall['opts'], callNo: number) => AnyAnswer | Promise<AnyAnswer>;

/** A promise a test settles by hand. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

export const ok = (data: unknown): AnyAnswer => ({ ok: true, data });
export const fail = (code: string, message: string, extra: { field?: string; network?: true } = {}): AnyAnswer => ({
  ok: false,
  code,
  message,
  ...extra,
});
export const networkFail = (): AnyAnswer => fail('internal', 'Cannot reach the server. Check the connection and try again.', { network: true });

/** An ApiClient that records every call and answers through the handler set for its operation. */
export function fakeApi() {
  const calls: FakeCall[] = [];
  const handlers = new Map<string, Handler>();
  const api: Pick<ApiClient, 'call'> = {
    call: (async (op: string, input: unknown, opts?: FakeCall['opts']) => {
      calls.push({ op, input, opts });
      const handler = handlers.get(op);
      if (!handler) throw new Error(`fakeApi: no handler for ${op}`);
      return handler(input, opts, calls.filter((c) => c.op === op).length);
    }) as unknown as ApiClient['call'],
  };
  return {
    api,
    calls,
    callsOf: (op: string) => calls.filter((c) => c.op === op),
    /** Answer every call to `op` with `handler`. */
    on(op: string, handler: Handler) {
      handlers.set(op, handler);
    },
  };
}

/** Let promise callbacks run (a few microtask turns). */
export async function flush(turns = 8) {
  for (let i = 0; i < turns; i += 1) await Promise.resolve();
}

/** Timers and a clock moved by hand: `advance(ms)` fires what is due and lets callbacks settle. */
export function fakeTimers() {
  let now = 0;
  let next = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  const timers: Pick<LiveTimers, 'setTimeout' | 'clearTimeout'> & LiveTimers = {
    setTimeout: (fn, ms) => {
      const id = next++;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (id) => void pending.delete(id as number),
    setInterval: () => 0,
    clearInterval: () => {},
  };
  return {
    timers,
    now: () => now,
    pending: () => pending.size,
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...pending.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        await flush();
      }
      now = end;
      await flush();
    },
  };
}

/** A live client stand-in whose status and events the test drives. */
export function fakeLive(initial: LiveStatus = 'open') {
  let status = initial;
  const statusFns = new Set<(s: LiveStatus) => void>();
  const eventFns = new Set<(e: LiveEnvelope) => void>();
  const refetchFns = new Set<() => void>();
  let stops = 0;
  const live: Pick<LiveClient, 'status' | 'onStatus' | 'onEvent' | 'onRefetchAll'> & { stop(): void } = {
    stop: () => {
      stops += 1;
    },
    status: () => status,
    onStatus: (fn) => {
      statusFns.add(fn);
      return () => void statusFns.delete(fn);
    },
    onEvent: (fn) => {
      eventFns.add(fn);
      return () => void eventFns.delete(fn);
    },
    onRefetchAll: (fn) => {
      refetchFns.add(fn);
      return () => void refetchFns.delete(fn);
    },
  };
  let seq = 0;
  return {
    live,
    stops: () => stops,
    counts: () => ({ status: statusFns.size, event: eventFns.size, refetch: refetchFns.size }),
    setStatus(next: LiveStatus) {
      status = next;
      for (const fn of [...statusFns]) fn(next);
    },
    push(topic: keyof typeof LIVE_CATALOGUE, over: Partial<LiveEnvelope> = {}) {
      seq += 1;
      const e: LiveEnvelope = {
        seq,
        name: LIVE_CATALOGUE[topic].name,
        entityType: LIVE_CATALOGUE[topic].entityType,
        entityId: 'u-other',
        entityVersion: seq,
        emittedAt: '2026-11-21T10:00:00.000Z',
        audience: { channels: ['role:owner'] },
        ...over,
      };
      for (const fn of [...eventFns]) fn(e);
    },
    refetchAll() {
      for (const fn of [...refetchFns]) fn();
    },
  };
}
