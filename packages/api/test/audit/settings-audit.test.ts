/**
 * Set Setting is audited (EP-06-S8 AC1-AC4, S3 AC3): one `setting_changed` entry per change with
 * the key's old and new value, none for a refused value or a value equal to the stored one.
 */
import { SETTING_KEYS, type SettingKey } from '@goldsmith/shared';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { describeDb } from '../db/db-test-helpers.js';
import { refused, startUsersHarness, type UsersHarness } from '../users/user-test-helpers.js';

interface EntryRow {
  id: string;
  actor_name: string;
  actor_role: string;
  kind: string;
  entity_type: string;
  entity_id: string;
  reference: string | null;
  summary: string;
  before_value: unknown;
  after_value: unknown;
}

/** The prototype defaults every new shop starts with (migration 0010). */
const DEFAULTS = `pricing_enabled = false, lead_sla_hours = 8, require_edit_token = true, notify_whatsapp = true,
  notify_app = true, notify_email = false, late_lead_audience = 'staff_then_owner', auto_send_wishes = false`;

/** A value different from the default for each key. */
const CHANGED: Record<SettingKey, unknown> = {
  pricingEnabled: true,
  leadSlaHours: 6,
  requireEditToken: false,
  notifyChannels: { whatsapp: true, app: true, email: true },
  lateLeadAudience: 'owner_only',
  autoSendWishes: true,
};

describeDb('setSetting is audited (EP-06-S8)', () => {
  let h: UsersHarness;
  let seen: Set<string>;

  beforeAll(async () => {
    h = await startUsersHarness();
  });

  afterAll(async () => {
    await h?.close();
  });

  const allEntries = async (): Promise<EntryRow[]> =>
    (
      await h.pool.query<EntryRow>(
        `select id, actor_name, actor_role, kind, entity_type, entity_id, reference, summary, before_value, after_value
           from audit_entries where shop_id = $1 order by at, id`,
        [h.shop.shopId],
      )
    ).rows;
  /** The entries written since the test began. */
  const newEntries = async () => (await allEntries()).filter((e) => !seen.has(e.id));
  const set = (key: string, value: unknown) => h.asOwner('setSetting', { key, value });

  beforeEach(async () => {
    await h.pool.query(`update settings set ${DEFAULTS} where shop_id = $1`, [h.shop.shopId]);
    seen = new Set((await allEntries()).map((e) => e.id));
  });

  it('AC1: turning pricing on writes one entry, owner as actor, false before and true after', async () => {
    expect(await set('pricingEnabled', true)).toEqual({ status: 200, body: { ok: true } });
    expect(await newEntries()).toEqual([
      {
        id: expect.any(String),
        actor_name: 'Sanjay Seth',
        actor_role: 'owner',
        kind: 'setting_changed',
        entity_type: 'setting',
        entity_id: 'pricingEnabled',
        reference: 'pricingEnabled',
        summary: 'Rule changed: pricingEnabled',
        before_value: { pricingEnabled: false },
        after_value: { pricingEnabled: true },
      },
    ]);
    const { rows } = await h.pool.query('select pricing_enabled from settings where shop_id = $1', [h.shop.shopId]);
    expect(rows[0].pricing_enabled).toBe(true);
  });

  it('AC2: the lead timer 4 h -> 6 h records 4 before and 6 after', async () => {
    await h.pool.query('update settings set lead_sla_hours = 4 where shop_id = $1', [h.shop.shopId]);
    expect((await set('leadSlaHours', 6)).status).toBe(200);
    expect(await newEntries()).toEqual([
      expect.objectContaining({ before_value: { leadSlaHours: 4 }, after_value: { leadSlaHours: 6 } }),
    ]);
  });

  it('AC3: a lead timer of 0 is refused with the sentence and writes nothing', async () => {
    expect(await set('leadSlaHours', 0)).toEqual(refused('The lead timer must be at least 1 hour.'));
    expect(await newEntries()).toEqual([]);
    const { rows } = await h.pool.query('select lead_sla_hours from settings where shop_id = $1', [h.shop.shopId]);
    expect(rows[0].lead_sla_hours).toBe(8);
  });

  it.each(SETTING_KEYS)('AC4: changing %s writes exactly one setting_changed entry', async (key) => {
    expect(await set(key, CHANGED[key])).toEqual({ status: 200, body: { ok: true } });
    const entries = await newEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: 'setting_changed',
      entity_type: 'setting',
      entity_id: key,
      after_value: { [key]: CHANGED[key] },
    });
  });

  it('S3 AC3: turning on email alerts stores the whole channel list before and after', async () => {
    expect((await set('notifyChannels', { whatsapp: true, app: true, email: true })).status).toBe(200);
    expect(await newEntries()).toEqual([
      expect.objectContaining({
        before_value: { notifyChannels: { whatsapp: true, app: true, email: false } },
        after_value: { notifyChannels: { whatsapp: true, app: true, email: true } },
      }),
    ]);
    const { rows } = await h.pool.query('select notify_whatsapp, notify_app, notify_email from settings where shop_id = $1', [
      h.shop.shopId,
    ]);
    expect(rows[0]).toEqual({ notify_whatsapp: true, notify_app: true, notify_email: true });
  });

  it('the value already stored answers ok and writes no entry', async () => {
    expect(await set('leadSlaHours', 8)).toEqual({ status: 200, body: { ok: true } });
    expect(await set('notifyChannels', { whatsapp: true, app: true, email: false })).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(await newEntries()).toEqual([]);
  });

  it('a value of the wrong shape is refused as validation on field value, with no entry', async () => {
    const res = await set('pricingEnabled', 'yes');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'validation', field: 'value' });
    expect((await set('lateLeadAudience', 'everyone')).status).toBe(400);
    expect((await set('leadSlaHours', 1.5)).status).toBe(400);
    expect(await newEntries()).toEqual([]);
  });

  it('staff may not change a rule', async () => {
    expect(await h.call('setSetting', { key: 'pricingEnabled', value: true }, { session: h.session })).toEqual({
      status: 403,
      body: { code: 'forbidden', message: 'Only the owner can change the rules.' },
    });
    expect(await newEntries()).toEqual([]);
  });
});
