import { describe, expect, it } from 'vitest';
import { createActionController } from '../../query/action-controller';
import { createConnectionStore } from '../../query/connection';
import { createQueryClient, defineQuery } from '../../query/query-client';
import { fail, fakeApi, fakeTimers, flush, networkFail, ok } from '../../query/test-support';
import { renderAs } from '../../test-support/render-as';
import { createUser, OnboardStaff } from './OnboardStaff';
import { StaffDirectory } from './StaffDirectory';
import { addUserRefusal, type UserRow } from './user-rows';
const row = (over: Partial<UserRow>): UserRow => ({
  id: 'u1',
  name: 'Deepak Rao',
  phone: '+919003071145',
  email: 'deepak@example.com',
  role: 'staff',
  status: 'pending_activation',
  karigarId: null,
  lockedUntil: null,
  lockedUntilLocal: null,
  version: 1,
  ...over,
});
/** A cache whose first listUsers read has been answered (or failed) before the screen renders. */
async function cacheAfter(answer: ReturnType<typeof ok>) {
  const fake = fakeApi();
  const clock = fakeTimers();
  const queries = createQueryClient({ api: fake.api, now: clock.now, timers: clock.timers });
  fake.on('listUsers', () => answer);
  queries.subscribe(defineQuery({ op: 'listUsers', input: {} }), () => {});
  await flush();
  return queries;
}
describe('people screens (EP-05-S4, S11, EP-08-S18)', () => {
  it('S18 AC3: while the read is pending the owner sees loading and no empty state', () => {
    const html = renderAs('Sanjay Seth', 'owner', <StaffDirectory />);
    expect(html).toContain('Loading the staff list…');
    expect(html).toContain('role="status"');
    expect(html).toContain('Add a staff member');
    expect(html).not.toContain('No staff yet');
    expect(html).not.toContain('Only the owner sees the staff list.');
  });
  it('S3 AC3: a finished read with no rows shows the empty sentence', async () => {
    const queries = await cacheAfter(ok({ ok: true, items: [], nextCursor: null, pageSize: 50 }));
    const html = renderAs('Sanjay Seth', 'owner', <StaffDirectory />, { queries });
    expect(html).toContain('No staff yet. Add the first person.');
    expect(html).not.toContain('Loading the staff list');
  });
  it('S9 AC2: the rows from the server show with their role, status and actions', async () => {
    const owner = row({ id: 'u0', name: 'Sanjay Seth', role: 'owner', status: 'active' });
    const queries = await cacheAfter(ok({ ok: true, items: [owner, row({})], nextCursor: null, pageSize: 50 }));
    const html = renderAs('Sanjay Seth', 'owner', <StaffDirectory />, { queries });
    for (const text of ['Sanjay Seth', 'Deepak Rao', 'Awaiting activation', 'Resend activation link', 'Deactivate']) expect(html).toContain(text);
    expect(html).not.toContain('No staff yet');
  });
  it('S4 AC1: an unreachable server says the list could not be loaded and offers Try again', async () => {
    const queries = await cacheAfter(networkFail());
    const html = renderAs('Sanjay Seth', 'owner', <StaffDirectory />, { queries });
    expect(html).toContain('The staff list could not be loaded.');
    expect(html).toContain('Try again');
    expect(html).not.toContain('No staff yet');
  });
  it('a refused read shows no Try again', async () => {
    const queries = await cacheAfter(fail('forbidden', 'Your role may not run this.'));
    const html = renderAs('Sanjay Seth', 'owner', <StaffDirectory />, { queries });
    expect(html).toContain('You may not see this.');
    expect(html).not.toContain('Try again');
  });
  it('the owner sees the add form with email, three roles and the submit button', () => {
    const html = renderAs('Sanjay Seth', 'owner', <OnboardStaff />);
    expect(html).toContain('Email');
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    for (const label of ['>Staff<', '>Karigar<', '>Owner<']) expect(html).toContain(label);
    expect(html).toContain('Add this staff member');
    expect(html).not.toContain('Working…');
  });
  it('S11 AC1: while the connection is down the submit is disabled and says why', () => {
    const connection = createConnectionStore({ windowLike: null });
    connection.setLiveStatus('reconnecting');
    const html = renderAs('Sanjay Seth', 'owner', <OnboardStaff />, { connection });
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Add this staff member<|<button[^>]*disabled=""[^>]*type="submit"[^>]*>Add this staff member</);
    expect(html).toContain('Reconnecting to the server. Try again when the connection is back.');
  });
  it('a staff member sees the owner-only sentences', () => {
    expect(renderAs('Rajesh Verma', 'staff', <StaffDirectory />)).toContain('Only the owner sees the staff list.');
    const form = renderAs('Rajesh Verma', 'staff', <OnboardStaff />);
    expect(form).toContain('Only the owner can add staff or change a role.');
    expect(form).not.toContain('Add this staff member');
  });
  it('the session permissions decide, not the role alone', () => {
    const html = renderAs('Sanjay Seth', 'owner', <StaffDirectory />, { permissions: [] });
    expect(html).toContain('Only the owner sees the staff list.');
  });
});

describe('adding a user, with the real createUser action (S5 AC2, S7, S18 AC2, AC5)', () => {
  const listUsers = defineQuery({ op: 'listUsers', input: {} });
  const newPerson = { name: 'Deepak Rao', phone: '+919003071145', email: 'deepak@example.com', role: 'staff' as const };
  async function setup() {
    const fake = fakeApi();
    const clock = fakeTimers();
    const queries = createQueryClient({ api: fake.api, now: clock.now, timers: clock.timers });
    let rows: UserRow[] = [];
    fake.on('listUsers', () => ok({ ok: true, items: rows, nextCursor: null, pageSize: 50 }));
    queries.subscribe(listUsers, () => {});
    await flush();
    const controller = createActionController({ def: createUser, api: fake.api, queries, newKey: () => 'key-1' });
    return { fake, queries, controller, setRows: (next: UserRow[]) => (rows = next) };
  }
  it('S7 and S18 AC2: after the user is added the staff list is read again and shows them', async () => {
    const { fake, queries, controller, setRows } = await setup();
    fake.on('createUser', () => {
      setRows([row({})]);
      return ok({ ok: true });
    });
    expect((await controller.run(newPerson)).ok).toBe(true);
    await flush();
    expect(fake.callsOf('listUsers')).toHaveLength(2);
    expect(queries.getSnapshot(listUsers).data).toMatchObject({ items: [{ name: 'Deepak Rao' }] });
  });
  it('S5 AC2 and S18 AC5: a duplicate phone is refused on the phone field, with nothing read again', async () => {
    const { fake, controller } = await setup();
    const sentence = 'That phone number already belongs to a user.';
    fake.on('createUser', () => fail('validation', sentence, { field: 'phone' }));
    expect(await controller.run(newPerson)).toMatchObject({ ok: false, code: 'validation', field: 'phone' });
    expect(addUserRefusal(controller.getSnapshot().refusal)).toEqual({ field: 'phone', message: sentence });
    expect(fake.callsOf('listUsers')).toHaveLength(1);
  });
});
