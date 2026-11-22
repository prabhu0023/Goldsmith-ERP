import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type AccountEmail, createAccountMailer, disabledMailer, StubMailer } from '../../src/auth/account-mail.js';
import { issueActivationLink } from '../../src/auth/activation.js';
import { createDevMailboxRouter } from '../../src/auth/dev-mailbox.js';
import { hashSecret } from '../../src/auth/session-store.js';
import { ConfigError, loadConfig } from '../../src/config.js';
import { runInTransaction } from '../../src/pipeline/operation-transaction.js';
import { describeDb } from '../db/db-test-helpers.js';
import { type Harness, newUser, SERVER_NOW, startHarness } from '../support/api-harness.js';
const env = {
  APP_URL: 'http://localhost:3000',
  SESSION_SECRET: 'test-only-session-secret-0123456789abcdef',
  API_PORT: '4999',
};
const mail = (values: Partial<AccountEmail> = {}): AccountEmail => ({
  to: 'rajesh@example.com',
  toMasked: 'r•••@example.com',
  subject: 'Set your JGD password',
  text: 'Open the link to set your password.',
  link: 'http://localhost:3000/activate#token=abc123',
  at: new Date('2026-11-21T10:00:00Z'),
  ...values,
});
describe('account email (EP-04-S4)', () => {
  it('the stub keeps the message and logs a line without the link or the address', async () => {
    const lines: string[] = [];
    const stub = new StubMailer({ mailboxUrl: 'http://localhost:4999/dev/mailbox', log: (l) => lines.push(l) });
    await stub.send(mail());
    expect(stub.messages()).toEqual([mail()]);
    expect(lines).toEqual([
      '[mail stub] Set your JGD password to r•••@example.com — read it at http://localhost:4999/dev/mailbox',
    ]);
    expect(lines[0]).not.toContain('token');
    expect(lines[0]).not.toContain('rajesh@');
  });
  it('the stub keeps only the last 50 messages', async () => {
    const stub = new StubMailer({ mailboxUrl: 'x', log: () => {} });
    for (let i = 0; i < 55; i++) await stub.send(mail({ subject: `m${i}` }));
    const kept = stub.messages();
    expect(kept).toHaveLength(50);
    expect(kept[0].subject).toBe('m5');
    expect(kept[49].subject).toBe('m54');
  });
  it('uses the stub in development and staging, and refuses to send in production when unset', async () => {
    expect(createAccountMailer(loadConfig({ ...env, APP_ENV: 'development' }), () => {})).toBeInstanceOf(StubMailer);
    expect(createAccountMailer(loadConfig({ ...env, APP_ENV: 'staging' }), () => {})).toBeInstanceOf(StubMailer);
    const prod = createAccountMailer(loadConfig({ ...env, APP_ENV: 'production' }), () => {});
    expect(prod).toBe(disabledMailer);
    await expect(prod.send(mail())).rejects.toThrow('Account email is disabled');
  });
  it('the dev mailbox serves the messages as JSON with the link, and as an escaped HTML page', async () => {
    const stub = new StubMailer({ mailboxUrl: 'x', log: () => {} });
    await stub.send(mail());
    await stub.send(mail({ subject: '<script>alert(1)</script>', link: 'http://localhost:3000/reset-password#token=a"b' }));
    const server: Server = express().use(createDevMailboxRouter(stub)).listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const json = await fetch(`${base}/dev/mailbox.json`);
      expect(json.status).toBe(200);
      const body = (await json.json()) as { messages: Array<Record<string, string>> };
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0]).toMatchObject({
        link: 'http://localhost:3000/activate#token=abc123',
        subject: 'Set your JGD password',
        at: '2026-11-21T10:00:00.000Z',
      });
      const page = await fetch(`${base}/dev/mailbox`);
      expect(page.headers.get('content-type')).toContain('text/html');
      const html = await page.text();
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).not.toContain('<script>');
      expect(html).toContain('token=a&quot;b');
      expect(html).toContain('r•••@example.com');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('the delivery mode is chosen by ACCOUNT_EMAIL_MODE (EP-04-S4 AC2, AC4)', () => {
  it('stub when set to stub outside production; disabled in production when unset; stub refused in production', () => {
    expect(createAccountMailer(loadConfig({ ...env, APP_ENV: 'staging', ACCOUNT_EMAIL_MODE: 'stub' }))).toBeInstanceOf(
      StubMailer,
    );
    expect(createAccountMailer(loadConfig({ ...env, APP_ENV: 'production' }))).toBe(disabledMailer);
    expect(() => loadConfig({ ...env, APP_ENV: 'production', ACCOUNT_EMAIL_MODE: 'stub' })).toThrow(ConfigError);
  });
});

describeDb('account email through the stub in staging (EP-04-S4 AC1, AC3)', () => {
  const consoleLines: string[] = [];
  const record = (...args: unknown[]) => {
    consoleLines.push(args.map(String).join(' '));
  };
  let h: Harness;
  let mailer: StubMailer;
  let rajesh: string;
  let token: string;

  beforeAll(async () => {
    for (const method of ['log', 'error', 'warn', 'info'] as const) vi.spyOn(console, method).mockImplementation(record);
    // The stub's console line goes to console.log, as in a running api.
    mailer = new StubMailer({ mailboxUrl: 'http://localhost:4001/dev/mailbox' });
    h = await startHarness({ appEnv: 'staging', auth: { mailer } });
    rajesh = await newUser(h.pool, h.shop, {
      name: 'Rajesh Verma',
      phone: '+91 98410 11111',
      email: 'rajesh@example.com',
      status: 'pending_activation',
    });
    await runInTransaction(
      h.pool,
      (tx) =>
        issueActivationLink(tx, {
          shopId: h.shop.shopId,
          userId: rajesh,
          actor: { kind: 'system' },
          at: SERVER_NOW,
          mailer,
          appUrl: 'http://localhost:3000',
        }),
      (message, err) => h.logged.push({ message, err }),
    );
    token = (mailer.messages().at(-1)?.link ?? '').split('#token=')[1];
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await h.close();
  });

  it('AC1: the mailbox shows the email to his masked address with the subject and the link', async () => {
    const res = await fetch(`${h.base}/dev/mailbox.json`);
    expect(res.status).toBe(200);
    const { messages } = (await res.json()) as { messages: Array<Record<string, string>> };
    expect(messages.at(-1)).toMatchObject({
      toMasked: 'r•••@example.com',
      subject: 'Set your JGD password',
      link: `http://localhost:3000/activate#token=${token}`,
    });
    const page = await (await fetch(`${h.base}/dev/mailbox`)).text();
    expect(page).toContain('r•••@example.com');
  });

  it('AC3: the link is only in the mailbox, never in the database, the audit log or the server log', async () => {
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const links = await h.pool.query<{ token_hash: string; row: string }>(
      'select token_hash, row_to_json(p)::text as row from password_links p where shop_id = $1',
      [h.shop.shopId],
    );
    expect(links.rows.map((r) => r.token_hash)).toEqual([hashSecret(token)]);
    for (const { row } of links.rows) expect(row).not.toContain(token);
    const audit = await h.pool.query<{ row: string }>(
      'select row_to_json(a)::text as row from audit_entries a where shop_id = $1',
      [h.shop.shopId],
    );
    expect(audit.rows.length).toBeGreaterThan(0);
    for (const { row } of audit.rows) expect(row).not.toContain(token);
    expect(JSON.stringify(h.logged.map((l) => [l.message, String(l.err)]))).not.toContain(token);
    expect(consoleLines).toContain(
      '[mail stub] Set your JGD password to r•••@example.com — read it at http://localhost:4001/dev/mailbox',
    );
    for (const line of consoleLines) expect(line).not.toContain(token);
  });

  it('the mailbox is not served when the mailer is disabled', async () => {
    const off = await startHarness({ appEnv: 'staging', auth: { mailer: disabledMailer } });
    try {
      expect((await fetch(`${off.base}/dev/mailbox`)).status).toBe(404);
      expect((await fetch(`${off.base}/dev/mailbox.json`)).status).toBe(404);
    } finally {
      await off.close();
    }
  });
});
