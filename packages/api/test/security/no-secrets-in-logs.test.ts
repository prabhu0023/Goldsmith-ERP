/**
 * No secret in logs, error reports or stored messages (EP-40-S11 AC1, AC2, AC5). Runs account
 * creation and activation, a wrong and a right sign-in, forgot-password and reset, and a
 * validation failure whose body holds a password. It then scans, flow by flow, everything the
 * server logged, everything written to console.*, every HTTP error body, and the outbox and job
 * run rows, for each password, link token and six-digit code used. The link inside the stub
 * mailbox is the one place a link token is allowed (it is the email) and is not scanned.
 * Log redaction (EP-37-S2) and the WhatsApp message store (EP-12-S11) are not built yet, so
 * S11 AC3 and AC4 are follow-ups (docs/followups.md).
 */
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { describeDb } from '../db/db-test-helpers.js';
import { activationToken, PASSWORD, signIn, startUsersHarness, type UsersHarness, userRow } from '../users/user-test-helpers.js';
const WRONG_PASSWORD = 'not-the-password-71';
const ACTIVATION_PASSWORD = 'Meena-sets-2026';
const RESET_PASSWORD = 'Meena-resets-2027';
const REJECTED_PASSWORD = 'bad-body-pass-1';
const MEENA = { name: 'Meena Iyer', phone: '+91 98410 66666', email: 'meena.iyer@example.com', role: 'staff' };
interface Flow {
  name: string;
  /** What the flow let the server say: HTTP bodies, as text. */
  bodies: string[];
  /** Secrets that must appear nowhere this test scans. */
  secrets: string[];
}
describeDb('no secrets in logs, error reports or stored messages (EP-40-S11)', () => {
  let h: UsersHarness;
  const flows: Flow[] = [];
  const consoleText: string[] = [];
  const spies: Array<ReturnType<typeof vi.spyOn>> = [];
  const text = (v: unknown): string => {
    if (v instanceof Error) return `${v.name}: ${v.message}\n${v.stack ?? ''}`;
    if (typeof v === 'string') return v;
    try {
      return JSON.stringify(v, (_k, x) => (x instanceof Error ? `${x.name}: ${x.message}\n${x.stack ?? ''}` : x));
    } catch {
      return String(v);
    }
  };
  const flow = (name: string, secrets: string[], ...answers: Array<{ body: unknown }>): void => {
    flows.push({ name, secrets, bodies: answers.map((a) => text(a.body)) });
  };
  beforeAll(async () => {
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      spies.push(
        vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
          consoleText.push(args.map(text).join(' '));
        }),
      );
    }
    h = await startUsersHarness();
    // Sign-in, wrong then right.
    flow('sign-in', [WRONG_PASSWORD, PASSWORD], await signIn(h, '+91 98410 33333', WRONG_PASSWORD), await signIn(h, '+91 98410 33333'));
    // Add a user, who activates with the link and a new password.
    const created = await h.asOwner('createUser', MEENA);
    expect(created.status).toBe(200);
    const activation = activationToken(h, MEENA.email);
    const activated = await h.auth('activateAccount', { token: activation, password: ACTIVATION_PASSWORD });
    expect(activated.status).toBe(200);
    flow('create and activate', [ACTIVATION_PASSWORD, activation], created, activated);
    // She forgets the password and resets it.
    const asked = await h.auth('requestPasswordReset', { phone: MEENA.phone });
    const reset = (h.mailer.messages().filter((m) => m.to === MEENA.email).at(-1)?.link ?? '').split('#token=')[1] ?? '';
    expect(reset).not.toBe('');
    const done = await h.auth('resetPassword', { token: reset, password: RESET_PASSWORD });
    expect(done.status).toBe(200);
    flow('forgot and reset', [RESET_PASSWORD, reset], asked, done);
    // A request refused for its shape, with a password in the body.
    const bad = await h.auth('activateAccount', { token: '', password: REJECTED_PASSWORD });
    expect(bad.status).toBe(400);
    const badSignIn = await h.auth('signIn', { phone: '', password: REJECTED_PASSWORD });
    expect(badSignIn.status).toBe(400);
    flow('validation failure with a password in the body', [REJECTED_PASSWORD], bad, badSignIn);
    // Her access changes: the outbox gets an access event, which must carry no secret.
    const meena = (await h.pool.query<{ id: string }>('select id from users where shop_id = $1 and email = $2', [h.shop.shopId, MEENA.email])).rows[0].id;
    const deactivated = await h.asOwner('deactivateUser', { userId: meena, version: (await userRow(h, meena)).version, reason: 'Left the shop' });
    expect(deactivated.status).toBe(200);
    flow('deactivate', [ACTIVATION_PASSWORD, RESET_PASSWORD], deactivated);
  }, 60_000);
  afterAll(async () => {
    for (const spy of spies) spy.mockRestore();
    await h?.close();
  });
  const stored = async (): Promise<string[]> => {
    const outbox = await h.pool.query<{ t: string }>('select row_to_json(o)::text as t from outbox_events o where shop_id = $1', [
      h.shop.shopId,
    ]);
    const runs = await h.pool.query<{ t: string }>(
      'select coalesce(error_text, \'\') as t from job_runs where shop_id = $1',
      [h.shop.shopId],
    );
    const pending = await h.pool.query<{ t: string }>('select row_to_json(p)::text as t from pending_jobs p where shop_id = $1', [
      h.shop.shopId,
    ]);
    return [...outbox.rows, ...runs.rows, ...pending.rows].map((r) => r.t);
  };
  it('ran every flow and captured something to scan', async () => {
    expect(flows.map((f) => f.name)).toEqual([
      'sign-in',
      'create and activate',
      'forgot and reset',
      'validation failure with a password in the body',
      'deactivate',
    ]);
    expect(flows.every((f) => f.bodies.length > 0)).toBe(true);
    expect((await stored()).length).toBeGreaterThan(0);
  });
  it('S11 AC1: nothing the server logged or wrote to the console holds a password, link token or code', () => {
    const logged = h.logged.map((l) => `${l.message} ${text(l.err)}`);
    for (const f of flows) {
      for (const secret of f.secrets) {
        expect(logged.some((l) => l.includes(secret)), `${f.name}: server log holds a secret`).toBe(false);
        expect(consoleText.some((l) => l.includes(secret)), `${f.name}: console output holds a secret`).toBe(false);
      }
    }
  });
  it('S11 AC2: no HTTP answer echoes a password or a link token', () => {
    for (const f of flows) {
      for (const secret of f.secrets) {
        for (const body of f.bodies) expect(body.includes(secret), `${f.name}: an answer holds a secret`).toBe(false);
      }
    }
  });
  it('S11 AC5: the outbox, pending jobs and job run errors hold no password, link token or code', async () => {
    const rows = await stored();
    for (const f of flows) {
      for (const secret of f.secrets) {
        expect(rows.some((r) => r.includes(secret)), `${f.name}: a stored row holds a secret`).toBe(false);
      }
    }
  });
  it('keeps the link token only in the mailbox email, which is the email itself', () => {
    const links = h.mailer.messages().map((m) => m.link);
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const f of flows.filter((x) => x.name === 'create and activate' || x.name === 'forgot and reset')) {
      expect(links.some((l) => f.secrets.some((s) => l.includes(s))), f.name).toBe(true);
    }
  });
  it('control: the console spy and the scan would catch a leaked password', () => {
    console.warn(`control line ${REJECTED_PASSWORD}`);
    expect(consoleText.some((l) => l.includes(REJECTED_PASSWORD))).toBe(true);
  });
});
