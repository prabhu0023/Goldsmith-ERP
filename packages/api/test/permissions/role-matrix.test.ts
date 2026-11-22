/**
 * The central permission check over the production app (EP-05-S2): every registered contract
 * operation, for every role, is refused exactly when the permission list says so, with the
 * list's sentence; with no session every operation answers unauthenticated first (AC5).
 */
import { contract, ROLE_IDS, refusalFor, roleMay } from '@goldsmith/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { StubMailer } from '../../src/auth/account-mail.js';
import { createFileHandlers } from '../../src/files/file-handlers.js';
import { createOperationRegistry } from '../../src/pipeline/registry.js';
import { createServiceHandlers } from '../../src/services/index.js';
import { describeDb } from '../db/db-test-helpers.js';
import { type Harness, newSession, newUser, startHarness } from '../support/api-harness.js';

const OPERATIONS = Object.keys(contract);
const CASES = OPERATIONS.flatMap((op) => ROLE_IDS.map((role) => [op, role] as const));

it('registers every contract operation in production (with file storage configured)', () => {
  const handlers = {
    ...createServiceHandlers({
      mailer: new StubMailer({ mailboxUrl: 'http://localhost/dev/mailbox', log: () => {} }),
      appUrl: 'http://localhost:3000',
    }),
    ...createFileHandlers({ linkSecret: 'test-only-session-secret-0123456789abcdef', ttlSeconds: 300, log: () => {} }),
  };
  const registry = createOperationRegistry(contract, handlers);
  expect(OPERATIONS.filter((op) => registry.get(op) === undefined)).toEqual([]);
});

describeDb('role matrix over the production app (EP-05-S2)', () => {
  let h: Harness;
  const sessions: Partial<Record<(typeof ROLE_IDS)[number], string>> = {};

  beforeAll(async () => {
    h = await startHarness({ production: true });
    sessions.staff = h.session;
    sessions.owner = await newSession(h.pool, h.shop, await newUser(h.pool, h.shop, { name: 'Sanjay Seth', role: 'owner' }));
    sessions.karigar = await newSession(
      h.pool,
      h.shop,
      await newUser(h.pool, h.shop, { name: 'Lakshmi Devi', role: 'karigar' }),
    );
  });

  afterAll(async () => {
    await h?.close();
  });

  it.each(CASES)('%s as %s: refused exactly when the list says so', async (op, role) => {
    const res = await h.call(op, {}, { session: sessions[role] });
    if (roleMay(role, op)) {
      expect(res.status, JSON.stringify(res.body)).not.toBe(403);
    } else {
      expect(res).toEqual({ status: 403, body: { code: 'forbidden', message: refusalFor(op) } });
    }
  });

  it.each(OPERATIONS)('AC5: %s with no session answers unauthenticated', async (op) => {
    expect(await h.call(op, {})).toEqual({
      status: 401,
      body: { code: 'unauthenticated', message: 'Sign in to continue.' },
    });
  });
});
