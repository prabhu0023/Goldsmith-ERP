/**
 * The dev mailbox (EP-04-S4): the stub mailer's messages, links included, for development and
 * staging only. app.ts mounts it only for a StubMailer outside production.
 *   GET /dev/mailbox       an HTML page, every value escaped
 *   GET /dev/mailbox.json  { messages: [{ at, to, toMasked, subject, text, link }] }, oldest first
 */
import express, { type Router } from 'express';
import type { StubMailer } from './account-mail.js';
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
export function createDevMailboxRouter(mailer: StubMailer): Router {
  const router = express.Router();
  router.get('/dev/mailbox.json', (_req, res) => {
    res.set('cache-control', 'no-store').json({
      messages: mailer.messages().map((m) => ({ ...m, at: m.at.toISOString() })),
    });
  });
  router.get('/dev/mailbox', (_req, res) => {
    const rows = mailer
      .messages()
      .reverse()
      .map(
        (m) =>
          `<tr><td>${escapeHtml(m.at.toISOString())}</td><td>${escapeHtml(m.toMasked)}</td>` +
          `<td>${escapeHtml(m.subject)}</td><td><a href="${escapeHtml(m.link)}">${escapeHtml(m.link)}</a></td></tr>`,
      )
      .join('\n');
    res
      .set('cache-control', 'no-store')
      .type('html')
      .send(
        `<!doctype html><html><head><meta charset="utf-8"><title>Dev mailbox</title></head><body>` +
          `<h1>Dev mailbox</h1><p>Account emails kept in memory by the stub mailer, newest first.</p>` +
          `<table><thead><tr><th>At</th><th>To</th><th>Subject</th><th>Link</th></tr></thead>` +
          `<tbody>\n${rows}\n</tbody></table></body></html>`,
      );
  });
  return router;
}
