/**
 * No secret reaches the audit log (EP-06-S4 AC1, AC2): run sign-in, activation and password reset
 * through the production app, write an edit entry that names its token by reference, then scan
 * every column of every entry of the shop for the passwords, link tokens and the edit code.
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import { appendAudit } from '../../src/audit/audit-writer.js';
import { withTransaction } from '../../src/db/transaction.js';
import { describeDb } from '../db/db-test-helpers.js';
import { addPieceEdit } from '../jobs/job-test-helpers.js';
import { SERVER_NOW } from '../support/api-harness.js';
import { activationToken, PASSWORD, signIn, startUsersHarness, type UsersHarness } from '../users/user-test-helpers.js';

/** The 6-digit code the owner would be sent for the edit; only its reference may be stored. */
const EDIT_CODE = '482913';
const WRONG_PASSWORD = 'not-the-password-71';
const ACTIVATION_PASSWORD = 'Meena-sets-2026';
const RESET_PASSWORD = 'Meena-resets-2027';
const MEENA = { name: 'Meena Iyer', phone: '+91 98410 66666', email: 'meena.iyer@example.com', role: 'staff' };

describeDb('no secrets in the audit log (EP-06-S4)', () => {
  let h: UsersHarness;
  const secrets: string[] = [PASSWORD, WRONG_PASSWORD, ACTIVATION_PASSWORD, RESET_PASSWORD, EDIT_CODE];
  let editTokenRef: string;

  /** The token in the newest email to `to`. */
  const linkToken = (to: string): string => {
    const mail = h.mailer
      .messages()
      .filter((m) => m.to === to)
      .at(-1);
    return (mail?.link ?? '').split('#token=')[1] ?? '';
  };

  beforeAll(async () => {
    h = await startUsersHarness();
    // Sign-in, wrong and right.
    expect((await signIn(h, '+91 98410 33333', WRONG_PASSWORD)).status).toBe(401);
    expect((await signIn(h, '+91 98410 33333')).status).toBe(200);
    // Add a user, who activates with the link and a new password.
    expect((await h.asOwner('createUser', MEENA)).status).toBe(200);
    const activation = activationToken(h, MEENA.email);
    secrets.push(activation);
    expect((await h.auth('activateAccount', { token: activation, password: ACTIVATION_PASSWORD })).status).toBe(200);
    // She forgets it and resets it.
    expect((await h.auth('requestPasswordReset', { phone: MEENA.phone })).status).toBe(200);
    const reset = linkToken(MEENA.email);
    expect(reset).not.toBe(activation);
    secrets.push(reset);
    expect((await h.auth('resetPassword', { token: reset, password: RESET_PASSWORD })).status).toBe(200);
    // An edit applied with its code: the entry holds the token's record id, never the code.
    const editId = await addPieceEdit(h.pool, h.shop, { code: 'ED-301', tagNo: 'TAG-8841', tokenRef: 'tokref-ed301' });
    editTokenRef = (await h.pool.query<{ token_ref: string }>('select token_ref from piece_edits where id = $1', [editId]))
      .rows[0].token_ref;
    await withTransaction(h.pool, (client) =>
      appendAudit(client, {
        shopId: h.shop.shopId,
        at: SERVER_NOW,
        actor: { kind: 'user', id: h.ownerId, name: 'Sanjay Seth', role: 'owner' },
        kind: 'edit_applied',
        entityId: 'ED-301',
        ref: 'TAG-8841',
        summary: 'Edit ED-301 applied to TAG-8841',
        reason: 'Scale re-checked',
        tokenReference: editTokenRef,
        before: { grossG: 486500, code: EDIT_CODE },
        after: { grossG: 486100, token: EDIT_CODE },
      }),
    );
  });

  afterAll(async () => {
    await h?.close();
  });

  it('S4 AC2: no column of any entry holds a password, a link token or the edit code', async () => {
    const { rows } = await h.pool.query<{ kind: string; row: string }>(
      'select kind, row_to_json(a)::text as row from audit_entries a where shop_id = $1',
      [h.shop.shopId],
    );
    expect(rows.map((r) => r.kind)).toEqual(
      expect.arrayContaining([
        'sign_in_failed',
        'signed_in',
        'user_added',
        'activation_link_sent',
        'password_set',
        'password_reset_requested',
        'password_reset',
        'edit_applied',
      ]),
    );
    for (const { kind, row } of rows) {
      for (const secret of secrets) expect(row.includes(secret), `${kind} holds a secret`).toBe(false);
    }
  });

  it('S4 AC1: the edit entry keeps the token reference and the weights, and no 6-digit token', async () => {
    const { rows } = await h.pool.query<Record<string, unknown>>(
      `select entity_type, entity_id, kind, summary, detail, reason, reference, token_reference, before_value, after_value
         from audit_entries where shop_id = $1 and kind = 'edit_applied'`,
      [h.shop.shopId],
    );
    expect(rows).toEqual([
      expect.objectContaining({
        entity_type: 'edit',
        entity_id: 'ED-301',
        token_reference: editTokenRef,
        before_value: { grossG: 486500 },
        after_value: { grossG: 486100 },
      }),
    ]);
    const text = JSON.stringify(rows[0]).replaceAll('486500', '').replaceAll('486100', '');
    expect(text).not.toMatch(/\d{6}/);
  });
});
