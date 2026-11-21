/**
 * Account email: activation and reset links (EP-04-S4). One interface; EP-11-S12 adds a real
 * sender behind it. Until then:
 *   * `stub` (development and staging) keeps the last 50 messages in this process's memory,
 *     readable at /dev/mailbox. They are never written to the database (S4 AC3) and the link is
 *     never logged: the console line names the subject and the masked address only.
 *   * `disabled` (production, until a real sender exists) refuses to send. Mail goes out after
 *     the commit without being awaited, so the operation still answers `{ ok: true }` and the
 *     failure is only logged ("[api] account email failed"): until EP-11-S12 no activation or
 *     reset email reaches anyone in production (docs/followups.md).
 *     config.ts refuses ACCOUNT_EMAIL_MODE=stub in production.
 */
import type { Config } from '../config.js';
export interface AccountEmail {
  to: string;
  /** The address as it may be shown or logged, e.g. "r•••@example.com". */
  toMasked: string;
  subject: string;
  text: string;
  link: string;
  at: Date;
}
export interface AccountMailer {
  send(mail: AccountEmail): Promise<void>;
}
export type MailLog = (line: string) => void;
/** Messages kept by the stub; older ones are dropped. */
export const STUB_MAILBOX_SIZE = 50;
export class StubMailer implements AccountMailer {
  private readonly kept: AccountEmail[] = [];
  constructor(private readonly options: { mailboxUrl: string; log?: MailLog }) {}
  async send(mail: AccountEmail): Promise<void> {
    this.kept.push({ ...mail });
    if (this.kept.length > STUB_MAILBOX_SIZE) this.kept.splice(0, this.kept.length - STUB_MAILBOX_SIZE);
    (this.options.log ?? console.log)(`[mail stub] ${mail.subject} to ${mail.toMasked} — read it at ${this.options.mailboxUrl}`);
  }
  /** Kept messages, oldest first. */
  messages(): AccountEmail[] {
    return this.kept.map((m) => ({ ...m }));
  }
}
export const disabledMailer: AccountMailer = {
  async send() {
    throw new Error('Account email is disabled: no sender is configured for this environment');
  },
};
export function createAccountMailer(config: Pick<Config, 'accountEmailMode' | 'port'>, log?: MailLog): AccountMailer {
  if (config.accountEmailMode === 'stub') {
    return new StubMailer({ mailboxUrl: `http://localhost:${config.port}/dev/mailbox`, log });
  }
  return disabledMailer;
}
