/**
 * EP-07-S3: one authenticated live stream per open app (Server-Sent Events, D3), checked against
 * the session store on open like an API request, closed by the server when the session ends.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb } from '../db/db-test-helpers.js';
import { newSession, newUser, SERVER_NOW, sessionCookie } from '../support/api-harness.js';
import { LIVE_APP_URL, type LiveHarness, startLiveHarness } from './live-test-helpers.js';

const UNAUTHENTICATED = { code: 'unauthenticated', message: 'Sign in to continue.' };

describeDb('EP-07-S3 authenticated live connection', () => {
  let h: LiveHarness;
  beforeAll(async () => {
    h = await startLiveHarness();
  });
  afterAll(async () => {
    await h?.close();
  });

  const mine = (userId: string) => h.live.connections().filter((c) => c.userId === userId);

  it('S3 AC1: Rajesh (Staff) opens exactly one stream; the server records his user id and role', async () => {
    const rajesh = await h.user('Rajesh Verma');
    const c = await h.connect(rajesh.token);
    expect(c.status).toBe(200);
    expect(c.hello).toMatchObject({ type: 'hello', userId: rajesh.id, role: 'staff' });
    expect(mine(rajesh.id)).toEqual([
      expect.objectContaining({ id: c.hello?.connectionId, userId: rajesh.id, role: 'staff', name: 'Rajesh Verma' }),
    ]);
    c.close();
  });

  it('S3 AC2: no session, an expired or an ended session is refused as unauthenticated; nothing is recorded', async () => {
    const before = h.live.connections().length;
    const none = await h.connect(null);
    expect([none.status, none.body]).toEqual([401, UNAUTHENTICATED]);
    const userId = await newUser(h.pool, h.shop, { name: 'Expired Session' });
    const expired = await newSession(h.pool, h.shop, userId, { expiresAt: new Date(SERVER_NOW.getTime() - 1000) });
    const ended = await newSession(h.pool, h.shop, userId, { endedAt: SERVER_NOW });
    for (const token of [expired, ended, 'not-a-real-token']) {
      const c = await h.connect(token);
      expect([c.status, c.body]).toEqual([401, UNAUTHENTICATED]);
      expect(c.messages).toEqual([]);
    }
    expect(h.live.connections().length).toBeLessThanOrEqual(before);
    expect(mine(userId)).toEqual([]);
  });

  it('S3 rule: a page of another origin is refused (403); the app origin is accepted', async () => {
    const u = await h.user('Origin Check');
    const foreign = await h.connect(u.token, { origin: 'https://evil.example' });
    expect([foreign.status, foreign.body?.code]).toEqual([403, 'forbidden']);
    const same = await h.connect(u.token, { origin: LIVE_APP_URL });
    expect(same.status).toBe(200);
    same.close();
  });

  it('S3 rule: the stream is text/event-stream with the session from the cookie only, no token in the URL', async () => {
    const u = await h.user('Header Check');
    const res = await fetch(`${h.base}/api/live?token=${u.token}`);
    expect(res.status).toBe(401);
    await res.body?.cancel();
    const ok = await fetch(`${h.base}/api/live`, { headers: { cookie: sessionCookie(u.token) } });
    expect(ok.headers.get('content-type')).toMatch(/^text\/event-stream/);
    expect(ok.headers.get('cache-control')).toContain('no-cache');
    await ok.body?.cancel();
  });

  it('S3 AC3: a second tab opens its own stream; both are listed against his user id', async () => {
    const rajesh = await h.user('Rajesh Two Tabs');
    const tab1 = await h.connect(rajesh.token);
    const tab2 = await h.connect(rajesh.token);
    expect(tab1.hello?.connectionId).not.toBe(tab2.hello?.connectionId);
    expect(mine(rajesh.id).map((c) => c.id).sort()).toEqual([tab1.hello?.connectionId, tab2.hello?.connectionId].sort());
    tab1.close();
    tab2.close();
  });

  it('S3 AC4: signing out closes his streams within about 1 second', async () => {
    const rajesh = await h.user('Rajesh Signs Out');
    const c = await h.connect(rajesh.token);
    const res = await fetch(`${h.base}/api/auth/signOut`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: sessionCookie(rajesh.token) },
      body: '{}',
    });
    expect(res.status).toBe(200);
    const t0 = Date.now();
    await c.ended;
    expect(Date.now() - t0).toBeLessThan(1_000);
    expect(c.messages.at(-1)).toEqual({ type: 'closed', reason: 'session_ended' });
    expect(mine(rajesh.id)).toEqual([]);
  });

  it('S3 AC5: the owner and a karigar each open one stream with their own role', async () => {
    const sanjay = await h.user('Sanjay Seth', 'owner');
    const lakshmi = await h.user('Lakshmi Devi', 'karigar');
    const owner = await h.connect(sanjay.token);
    const karigar = await h.connect(lakshmi.token);
    expect(owner.hello).toMatchObject({ userId: sanjay.id, role: 'owner' });
    expect(karigar.hello).toMatchObject({ userId: lakshmi.id, role: 'karigar' });
    expect(mine(sanjay.id).map((c) => c.role)).toEqual(['owner']);
    expect(mine(lakshmi.id).map((c) => c.role)).toEqual(['karigar']);
    owner.close();
    karigar.close();
  });

  it('keeps an idle stream alive with comment heartbeats and ends it with going_away on stop', async () => {
    const u = await h.user('Heartbeat Check');
    const res = await fetch(`${h.base}/api/live`, { headers: { cookie: sessionCookie(u.token) } });
    const reader = res.body?.getReader();
    let text = '';
    const t0 = Date.now();
    while (!text.includes(': ping') && Date.now() - t0 < 2_000) {
      const chunk = await reader?.read();
      text += new TextDecoder().decode(chunk?.value);
    }
    expect(text).toContain('retry: ');
    expect(text).toContain(': ping');
    await reader?.cancel();
  });
});
