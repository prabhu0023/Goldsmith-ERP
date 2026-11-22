import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { describeDb, newShop } from '../db/db-test-helpers.js';
import { type Harness, newUser, SERVER_NOW, startHarness } from '../support/api-harness.js';

const SANJAY = { name: 'Sanjay Seth', phone: '+91 98410 33333', email: 'sanjay@jgd-jewellers.example' };
const EXISTS = { status: 422, body: { code: 'rule_refused', message: 'The first owner has already been created.' } };

describeDb('create the first owner once (EP-04-S1)', () => {
  let h: Harness;
  /** The installation's shop for the next call: a new shop with no owner per test. */
  let shopId: string;

  beforeAll(async () => {
    h = await startHarness({ poolSize: 12, auth: { installationShop: async () => shopId } });
  });

  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    shopId = (await newShop(h.pool, 'First owner shop')).shopId;
  });

  const create = async (body: unknown) => {
    const res = await h.auth('createFirstOwner', body);
    return { status: res.status, body: res.body };
  };
  const usersOf = async () =>
    (
      await h.pool.query(
        'select name, phone, phone_e164, email, role, status, password_hash from users where shop_id = $1',
        [shopId],
      )
    ).rows;

  it('AC1: creates one pending owner with no password and sets the first-owner marker', async () => {
    expect(await create(SANJAY)).toEqual({ status: 200, body: { ok: true } });
    expect(await usersOf()).toEqual([
      {
        name: 'Sanjay Seth',
        phone: '+919841033333',
        phone_e164: '+919841033333',
        email: 'sanjay@jgd-jewellers.example',
        role: 'owner',
        status: 'pending_activation',
        password_hash: null,
      },
    ]);
    const marker = await h.pool.query(
      `select m.created_at, u.name from shop_first_owners m join users u on u.id = m.user_id where m.shop_id = $1`,
      [shopId],
    );
    expect(marker.rows).toEqual([{ created_at: SERVER_NOW, name: 'Sanjay Seth' }]);
  });

  it('AC2: a second call is refused with the exact sentence and writes no user', async () => {
    await create(SANJAY);
    expect(await create({ name: 'Someone Else', phone: '+91 98410 44444', email: 'else@example.com' })).toEqual(EXISTS);
    expect((await usersOf()).map((u) => u.name)).toEqual(['Sanjay Seth']);
  });

  it('is refused when the shop already has an owner or setup is complete', async () => {
    const owned = await newShop(h.pool, 'Owned shop');
    shopId = owned.shopId;
    await newUser(h.pool, owned, { name: 'Existing Owner', role: 'owner' });
    expect(await create(SANJAY)).toEqual(EXISTS);
    shopId = (await newShop(h.pool, 'Set-up shop')).shopId;
    await h.pool.query('update shops set setup_completed_at = $2 where id = $1', [shopId, SERVER_NOW]);
    expect(await create(SANJAY)).toEqual(EXISTS);
    expect(await usersOf()).toEqual([]);
  });

  it('AC3: two calls at the same moment create exactly one owner; the other is refused', async () => {
    const answers = await Promise.all([
      create(SANJAY),
      create({ name: 'Sanjay Seth Two', phone: '+91 98410 55555', email: 'two@example.com' }),
    ]);
    expect(answers.map((a) => a.status).sort()).toEqual([200, 422]);
    expect(answers.find((a) => a.status === 422)).toEqual(EXISTS);
    expect((await usersOf()).filter((u) => u.role === 'owner')).toHaveLength(1);
    const markers = await h.pool.query('select 1 from shop_first_owners where shop_id = $1', [shopId]);
    expect(markers.rowCount).toBe(1);
  });

  it.each([
    ['phone', { ...SANJAY, phone: '98410' }],
    ['email', { ...SANJAY, email: 'sanjay@' }],
  ])('AC4: an invalid %s answers validation on that field and writes no user', async (field, body) => {
    const res = await create(body);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'validation', field });
    expect(await usersOf()).toEqual([]);
  });

  it('AC5: mails the activation link to the owner; until it is used, sign-in gives the wrong-password answer', async () => {
    const before = h.mailer.messages().length;
    await create(SANJAY);
    const sent = h.mailer.messages().slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: 'sanjay@jgd-jewellers.example',
      toMasked: 's•••@jgd-jewellers.example',
      subject: 'Set your JGD password',
    });
    expect(sent[0].link).toMatch(/^http:\/\/localhost:3000\/activate#token=[A-Za-z0-9_-]{43}$/);
    const signIn = await h.auth('signIn', { phone: '+91 98410 33333', password: 'gold2026!' });
    expect({ status: signIn.status, body: signIn.body }).toEqual({
      status: 401,
      body: { code: 'unauthenticated', message: 'Phone number or password is wrong.' },
    });
  });

  it('audits first_owner_created and activation_link_sent with actor setup and masked values', async () => {
    await create(SANJAY);
    const { rows } = await h.pool.query<{ actor_id: string | null; actor_name: string; actor_role: string; kind: string; detail: string }>(
      'select actor_id, actor_name, actor_role, kind, detail from audit_entries where shop_id = $1 order by kind',
      [shopId],
    );
    expect(rows.map((r) => [r.kind, r.actor_role, r.actor_name, r.actor_id])).toEqual([
      ['activation_link_sent', 'setup', 'Setup', null],
      ['first_owner_created', 'setup', 'Setup', null],
    ]);
    const created = JSON.parse(rows[1].detail);
    expect(created).toMatchObject({
      entity: 'user',
      name: 'Sanjay Seth',
      role: 'owner',
      phone: '+91 ••••• 33333',
      email: 's•••@jgd-jewellers.example',
    });
    const text = JSON.stringify(rows);
    expect(text).not.toContain('98410 33333');
    expect(text).not.toContain('9841033333');
    expect(text).not.toContain('sanjay@');
  });
});
