/**
 * Set Setting (EP-06-S8): the owner changes one shop rule. The value is parsed with the key's
 * shared schema; the lead timer must be at least one hour. The shop's settings row is locked,
 * and a value equal to the stored one changes nothing and writes no entry. Otherwise the
 * column(s) are updated and one `setting_changed` entry records the key's old and new value.
 */
import {
  type contract,
  DomainError,
  SETTING_MESSAGES,
  SETTING_VALUE_SCHEMAS,
  type SettingKey,
  type Settings,
} from '@goldsmith/shared';
import { auditChange, changedFields } from '../audit/audit-writer.js';
import { auditNoChange } from '../audit/audited-operation.js';
import { ValidationError } from '../pipeline/api-errors.js';
import type { Handler } from '../pipeline/registry.js';

interface SettingsRow {
  pricing_enabled: boolean;
  lead_sla_hours: number;
  require_edit_token: boolean;
  notify_whatsapp: boolean;
  notify_app: boolean;
  notify_email: boolean;
  late_lead_audience: Settings['lateLeadAudience'];
  auto_send_wishes: boolean;
}

function settingsOf(row: SettingsRow): Settings {
  return {
    pricingEnabled: row.pricing_enabled,
    leadSlaHours: row.lead_sla_hours,
    requireEditToken: row.require_edit_token,
    notifyChannels: { whatsapp: row.notify_whatsapp, app: row.notify_app, email: row.notify_email },
    lateLeadAudience: row.late_lead_audience,
    autoSendWishes: row.auto_send_wishes,
  };
}

/** The columns a key's value is stored in. */
function columnsFor(key: SettingKey, value: unknown): Partial<SettingsRow> {
  switch (key) {
    case 'pricingEnabled':
      return { pricing_enabled: value as boolean };
    case 'leadSlaHours':
      return { lead_sla_hours: value as number };
    case 'requireEditToken':
      return { require_edit_token: value as boolean };
    case 'notifyChannels': {
      const channels = value as Settings['notifyChannels'];
      return { notify_whatsapp: channels.whatsapp, notify_app: channels.app, notify_email: channels.email };
    }
    case 'lateLeadAudience':
      return { late_lead_audience: value as Settings['lateLeadAudience'] };
    case 'autoSendWishes':
      return { auto_send_wishes: value as boolean };
  }
}

function parseValue(key: SettingKey, value: unknown): unknown {
  const parsed = SETTING_VALUE_SCHEMAS[key].safeParse(value);
  if (parsed.success) return parsed.data;
  if (value === undefined) throw new ValidationError('value', 'value is required.');
  throw new ValidationError('value', `value is not valid: ${parsed.error.issues[0]?.message ?? 'invalid value'}`);
}

export const setSetting: Handler<typeof contract.setSetting> = async (tx, ctx, input) => {
  const { key } = input;
  const value = parseValue(key, input.value);
  if (key === 'leadSlaHours' && (value as number) < 1) throw new DomainError(SETTING_MESSAGES.leadTimerMin);
  const { rows } = await tx.client.query<SettingsRow>(
    `select pricing_enabled, lead_sla_hours, require_edit_token, notify_whatsapp, notify_app, notify_email,
            late_lead_audience, auto_send_wishes
       from settings where shop_id = $1 for update`,
    [ctx.shop.shopId],
  );
  if (!rows[0]) throw new Error(`Shop ${ctx.shop.shopId} has no settings row`);
  const before = { [key]: settingsOf(rows[0])[key] };
  const after = { [key]: value };
  if (Object.keys(changedFields(before, after).after ?? {}).length === 0) {
    auditNoChange(tx.client);
    return { ok: true };
  }
  const columns = Object.entries(columnsFor(key, value));
  await tx.client.query(
    `update settings set ${columns.map(([column], i) => `${column} = $${i + 2}`).join(', ')} where shop_id = $1`,
    [ctx.shop.shopId, ...columns.map(([, v]) => v)],
  );
  await auditChange(tx, ctx, {
    kind: 'setting_changed',
    entityType: 'setting',
    entityId: key,
    ref: key,
    summary: `Rule changed: ${key}`,
    before,
    after,
  });
  return { ok: true };
};
