/**
 * Validation column of the operation coverage manifest (EP-40-S5 AC3): every production operation
 * whose input has a required field answers `validation` for an empty body, naming a field of its
 * input, when called as a role the permission list lets in. Operations whose input is all
 * optional or empty are listed so a new required field moves them into the loop.
 */
import { authContract, contract, OPERATION_RULES, type OperationName, type RoleId } from '@goldsmith/shared';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { describeDb } from '../db/db-test-helpers.js';
import { type Harness, newSession, newUser, startHarness } from '../support/api-harness.js';
type Schema = { safeParse(v: unknown): { success: boolean }; shape: Record<string, unknown> };
const needsInput = (schema: Schema): boolean => !schema.safeParse({}).success;
const OPS = (Object.keys(contract) as OperationName[]).filter((op) => needsInput(contract[op].input as unknown as Schema));
const AUTH_OPS = Object.keys(authContract).filter((op) =>
  needsInput((authContract as Record<string, { input: unknown }>)[op].input as Schema),
);
/** Operations that accept an empty body, so there is no validation refusal to record. */
const NO_REQUIRED_INPUT = [
  ...(Object.keys(contract) as OperationName[]).filter((op) => !OPS.includes(op)),
  ...Object.keys(authContract).filter((op) => !AUTH_OPS.includes(op)),
].sort();
it('lists the operations with no required input, so a new required field joins the loop', () => {
  expect(NO_REQUIRED_INPUT).toEqual([
    'listAuditEntries',
    'listJobRuns',
    'listMyJobs',
    'listUsers',
    'readCurrentSession',
    'readRailBadges',
    'signOut',
  ]);
});
describeDb('empty body is a validation refusal for every operation with required input (EP-40-S5 AC3)', () => {
  let h: Harness;
  const sessions: Partial<Record<RoleId, string>> = {};
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
  it.each(OPS)('%s: an empty body names a missing field', async (op) => {
    const role = OPERATION_RULES[op].roles[0] as RoleId;
    const res = await h.call(op, {}, { session: sessions[role] });
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.code).toBe('validation');
    expect(Object.keys((contract[op].input as unknown as Schema).shape)).toContain(res.body.field);
  });
  it.each(AUTH_OPS)('%s (sign-in operation): an empty body names a missing field', async (op) => {
    const res = await h.auth(op, {});
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.code).toBe('validation');
    expect(Object.keys(((authContract as Record<string, { input: unknown }>)[op].input as Schema).shape)).toContain(
      res.body.field,
    );
  });
  it.each(['listJobRuns', 'listUsers', 'listAuditEntries'])('%s: a page size of 0 and a bad filter are validation refusals', async (op) => {
    const bad: Record<string, unknown> = { listJobRuns: { result: 'bogus' }, listUsers: {}, listAuditEntries: { actorRole: 'bogus' } };
    for (const body of [{ pageSize: 0 }, { pageSize: 'many' }, bad[op]]) {
      if (Object.keys(body as object).length === 0) continue;
      const res = await h.call(op, body, { session: sessions.owner });
      expect(res.status, `${op} ${JSON.stringify(body)}: ${JSON.stringify(res.body)}`).toBe(400);
      expect(res.body.code).toBe('validation');
    }
  });
});
