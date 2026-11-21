import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { describe, expect, it } from 'vitest';
import { type AccountEmail, createAccountMailer, disabledMailer, StubMailer } from '../../src/auth/account-mail.js';
import { createDevMailboxRouter } from '../../src/auth/dev-mailbox.js';
import { loadConfig } from '../../src/config.js';
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
