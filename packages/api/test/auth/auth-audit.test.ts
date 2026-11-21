import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { redactSecrets, writeAuthAudit } from '../../src/auth/auth-audit.js';
import { maskEmail, maskPhone } from '../../src/auth/mask.js';
import { runInTransaction } from '../../src/pipeline/operation-transaction.js';
import { describeDb, newShop, testPool } from '../db/db-test-helpers.js';
describe('masking (EP-04-S14)', () => {
  it('masks a phone to its last five digits', () => {
    expect(maskPhone('+91 98410 11111')).toBe('+91 ••••• 11111');
    expect(maskPhone('+919841011111')).toBe('+91 ••••• 11111');
    expect(maskPhone(maskPhone('+919841011111'))).toBe('+91 ••••• 11111');
  });
  it('masks an email to its first letter and domain', () => {
    expect(maskEmail('rajesh@example.com')).toBe('r•••@example.com');
    expect(maskEmail(maskEmail('rajesh@example.com'))).toBe('r•••@example.com');
  });
});
describe('redactSecrets (EP-04-S14)', () => {
  it('removes password, token, link, secret and code keys at any depth and masks phones and emails', () => {
    const redacted = redactSecrets({
      entity: 'user',
      entityId: 'u-1',
      password: 'gold2026!',
      newPasswordHash: '$scrypt$...',
      nested: { sessionToken: 't', resetLink: 'http://x/#token=t', SECRET: 's', otpCode: '1234', kept: 1 },
      list: [{ token: 't', phone: '+919841011111' }],
      phone: '+91 98410 11111',
      email: 'rajesh@example.com',
    });
    expect(redacted).toEqual({
      entity: 'user',
      entityId: 'u-1',
      nested: { kept: 1 },
      list: [{ phone: '+91 ••••• 11111' }],
      phone: '+91 ••••• 11111',
      email: 'r•••@example.com',
    });
  });
});
describeDb('writeAuthAudit (EP-04-S14)', () => {
  let pool: pg.Pool;
  beforeAll(() => {
    pool = testPool();
  });
  afterAll(async () => {
    await pool.end();
  });
  const addUser = async (shopId: string) =>
    (
      await pool.query<{ id: string }>(
        `insert into users (shop_id, name, phone, email, role, status)
         values ($1, 'Rajesh Verma', '+91 98410 11111', 'rajesh@example.com', 'staff', 'active') returning id`,
        [shopId],
      )
    ).rows[0].id;
  const entries = async (shopId: string) =>
    (
      await pool.query(
        'select actor_id, actor_name, actor_role, kind, summary, detail from audit_entries where shop_id = $1 order by at',
        [shopId],
      )
    ).rows;
  it('writes a user entry with a redacted detail', async () => {
    const { shopId } = await newShop(pool);
    const userId = await addUser(shopId);
    await writeAuthAudit(pool, {
      shopId,
      at: new Date('2026-11-21T10:00:00Z'),
      actor: { kind: 'user', id: userId, name: 'Rajesh Verma', role: 'staff' },
      action: 'signed_in',
      summary: 'Rajesh Verma signed in',
      detail: { entity: 'session', entityId: 's-1', role: 'staff', deviceLabel: 'Chrome', token: 'secret-value' },
    });
    const [row] = await entries(shopId);
    expect(row).toMatchObject({ actor_id: userId, actor_name: 'Rajesh Verma', actor_role: 'staff', kind: 'signed_in' });
    expect(JSON.parse(row.detail)).toEqual({ entity: 'session', entityId: 's-1', role: 'staff', deviceLabel: 'Chrome' });
  });
  it('stores system and setup actors with no user', async () => {
    const { shopId } = await newShop(pool);
    const at = new Date('2026-11-21T10:00:00Z');
    await writeAuthAudit(pool, {
      shopId,
      at,
      actor: { kind: 'system' },
      action: 'sessions_ended',
      summary: 'Sessions ended',
      detail: { entity: 'user', entityId: 'u-1', count: 2 },
    });
    await writeAuthAudit(pool, {
      shopId,
      at,
      actor: { kind: 'setup' },
      action: 'first_owner_created',
      summary: 'First owner created',
      detail: { entity: 'user', entityId: 'u-1', email: 'sanjay@example.com' },
    });
    const rows = await entries(shopId);
    expect(rows.map((r) => [r.actor_id, r.actor_name, r.actor_role]).sort()).toEqual([
      [null, 'Setup', 'setup'],
      [null, 'System', 'system'],
    ]);
    expect(rows.map((r) => JSON.parse(r.detail).email).filter(Boolean)).toEqual(['s•••@example.com']);
  });
  it('S14 AC4: an entry written in a transaction that then fails is rolled back', async () => {
    const { shopId } = await newShop(pool);
    const userId = await addUser(shopId);
    await expect(
      runInTransaction(
        pool,
        async (tx) => {
          await writeAuthAudit(tx.client, {
            shopId,
            at: new Date(),
            actor: { kind: 'user', id: userId, name: 'Rajesh Verma', role: 'staff' },
            action: 'signed_out',
            summary: 'Rajesh Verma signed out',
            detail: { entity: 'session', entityId: 's-1' },
          });
          throw new Error('fails after the audit write');
        },
        () => {},
      ),
    ).rejects.toThrow('fails after the audit write');
    expect(await entries(shopId)).toEqual([]);
  });
});
