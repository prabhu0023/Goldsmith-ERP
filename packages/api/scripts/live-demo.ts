/**
 * Live channel demo (EP-07-S12): two signed-in users against a running api. Client 1 triggers a
 * "Piece billed" test event for TAG-8841 through the dev stub; client 2, the shared LiveClient on
 * a Server-Sent Events stream, prints what it received and how long it took. Then client 2 is cut
 * off, client 1 triggers 2 more, and client 2 reconnects with Last-Event-ID and prints the
 * catch-up. Needs a seeded database, passwords set with `npm run db:dev-password`, and the api
 * running outside production (the stub does not exist there). See docs/setup/live.md.
 *
 *   npm run live:demo -w @goldsmith/api -- --phone1 "+91 98410 22222" --password1 <pw> \
 *     --phone2 "+91 98410 11111" --password2 <pw> [--base http://localhost:4001]
 */
import { parseArgs } from 'node:util';
import { createLiveClient, type LiveEnvelope, type LiveTimers } from '@goldsmith/shared';
import { SESSION_COOKIE } from '../src/auth/session-cookie.js';
import { laneApiPort, readLane } from '../src/lane.js';
import { nodeLiveStream } from '../test/live/node-live-stream.js';

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: `http://localhost:${process.env.API_PORT || laneApiPort(readLane(process.env))}` },
    phone1: { type: 'string', default: '+91 98410 22222' },
    password1: { type: 'string' },
    phone2: { type: 'string', default: '+91 98410 11111' },
    password2: { type: 'string' },
  },
});

const timers: LiveTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (h) => clearInterval(h as NodeJS.Timeout),
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function until(check: () => boolean, ms: number, what: string): Promise<void> {
  const t0 = Date.now();
  while (!check()) {
    if (Date.now() - t0 > ms) throw new Error(`${what}: nothing within ${ms} ms`);
    await sleep(5);
  }
}

async function post(base: string, path: string, body: unknown, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return fetch(`${base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

async function signIn(base: string, phone: string, password: string): Promise<{ cookie: string; name: string }> {
  const res = await post(base, '/api/auth/signIn', { phone, password });
  const body = (await res.json()) as { user?: { name: string }; message?: string };
  const token = res.headers.get('set-cookie')?.match(new RegExp(`${SESSION_COOKIE}=([^;]*)`))?.[1];
  if (res.status !== 200 || !token) throw new Error(`sign-in for ${phone} failed (${res.status}): ${body.message ?? ''}`);
  return { cookie: `${SESSION_COOKIE}=${token}`, name: body.user?.name ?? phone };
}

async function emit(base: string, cookie: string, entityId: string): Promise<void> {
  const res = await post(base, '/api/dev/live/emit', { event: 'piece.billed', entityId }, cookie);
  if (res.status !== 200) throw new Error(`test event for ${entityId} refused (${res.status}): ${await res.text()}`);
}

const show = (e: LiveEnvelope) => `seq ${e.seq} · ${e.name} · ${e.entityType} ${e.entityId} v${e.entityVersion}`;

async function main(): Promise<void> {
  const base = values.base;
  if (!values.password1 || !values.password2) throw new Error('--password1 and --password2 are required');
  const one = await signIn(base, values.phone1, values.password1);
  const two = await signIn(base, values.phone2, values.password2);
  console.log(`client 1: ${one.name} · client 2: ${two.name} · api ${base}`);

  const stream = nodeLiveStream({ base, cookie: two.cookie });
  const received: Array<{ event: LiveEnvelope; at: number }> = [];
  const client = createLiveClient({
    source: stream.source,
    timers,
    ops: { call: async (op, input) => ({ ok: (await post(base, `/api/ops/${op}`, input, two.cookie)).ok }) },
    checkSession: async () => {
      if (stream.isCut()) throw new Error('cut off');
      return (await post(base, '/api/auth/readCurrentSession', {}, two.cookie)).ok;
    },
    backoff: { initialMs: 250, factor: 2, maxMs: 1_000 },
  });
  client.onEvent((event) => received.push({ event, at: Date.now() }));
  client.start();
  await until(() => client.status() === 'open', 3_000, 'client 2 connecting');
  console.log(`client 2 connected (connection ${client.connectionId()}, stream position ${client.lastSeq()})`);

  const t0 = Date.now();
  await emit(base, one.cookie, 'TAG-8841');
  await until(() => received.length >= 1, 3_000, 'client 2 receiving Piece billed');
  const first = received[0];
  console.log(`client 2 received ${show(first.event)} in ${first.at - t0} ms`);
  console.log(`envelope: ${JSON.stringify(first.event)}`);

  const before = received.length;
  const lastSeq = client.lastSeq();
  stream.cutOff(2_000);
  await until(() => client.status() === 'reconnecting', 2_000, 'client 2 dropping');
  console.log('client 2 dropped (network cut for 2 s)');
  for (const tag of ['TAG-8802', 'TAG-8841']) await emit(base, one.cookie, tag);
  console.log('client 1 triggered 2 more Piece billed events while client 2 was offline');
  await until(() => received.length >= before + 2, 10_000, 'client 2 catching up');
  console.log(`client 2 reconnected with Last-Event-ID ${stream.opens.at(-1)} (last seq before the drop: ${lastSeq})`);
  for (const r of received.slice(before)) console.log(`  caught up: ${show(r.event)}`);
  await sleep(300);
  const extra = received.length - (before + 2);
  console.log(extra === 0 ? 'catch-up complete: each missed event exactly once' : `unexpected extra events: ${extra}`);
  client.stop();
  if (extra !== 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(`live demo failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
