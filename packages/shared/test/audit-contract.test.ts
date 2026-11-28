import { describe, expect, it } from 'vitest';
import {
  AUDIT_ACTIONS,
  AUDIT_EXEMPT_OPERATIONS,
  AUTH_OPERATION_AUDIT_KINDS,
  authContract,
  contract,
  OPERATION_AUDIT_KINDS,
  PLANNED_OPERATIONS,
  SETTING_KEYS,
  SETTING_MESSAGES,
  SETTING_VALUE_SCHEMAS,
} from '../src/index.js';

const maps = [
  ['contract', contract, OPERATION_AUDIT_KINDS],
  ['authContract', authContract, AUTH_OPERATION_AUDIT_KINDS],
] as const;

describe('state-changing operation lists (EP-06-S2 AC4, S7 AC6)', () => {
  it.each(maps)('%s: has an entry for every operation and no other', (_label, ops, kinds) => {
    expect(Object.keys(kinds).sort()).toEqual(Object.keys(ops).sort());
  });

  it.each(maps)('%s: an entry is null exactly when the operation is a read, a list or exempt with a reason', (_label, ops, kinds) => {
    const exempt = AUDIT_EXEMPT_OPERATIONS as Record<string, string | undefined>;
    for (const [name, def] of Object.entries(ops)) {
      const entry = (kinds as Record<string, readonly string[] | null>)[name];
      if (def.kind === 'read' || def.kind === 'list' || exempt[name]) expect(entry, name).toBeNull();
      else expect(entry?.length, name).toBeGreaterThan(0);
    }
  });

  it('exempts only commands, each with a reason', () => {
    for (const [name, reason] of Object.entries(AUDIT_EXEMPT_OPERATIONS)) {
      expect(contract[name as keyof typeof contract].kind, name).toBe('command');
      expect(reason?.length, name).toBeGreaterThan(0);
    }
  });
  it('declares only known audit kinds', () => {
    for (const kinds of [OPERATION_AUDIT_KINDS, AUTH_OPERATION_AUDIT_KINDS]) {
      for (const list of Object.values(kinds)) {
        for (const kind of list ?? []) expect(AUDIT_ACTIONS).toContain(kind);
      }
    }
  });

  it('markLeadLost writes lead_lost and setSetting writes setting_changed', () => {
    expect(OPERATION_AUDIT_KINDS.markLeadLost).toEqual(['lead_lost']);
    expect(OPERATION_AUDIT_KINDS.setSetting).toEqual(['setting_changed']);
  });
});

describe('metal pool operations (EP-18)', () => {
  it('the three creates write one pool kind each and the four reads write none', () => {
    expect(OPERATION_AUDIT_KINDS.createOpeningEntry).toEqual(['pool_opening_recorded']);
    expect(OPERATION_AUDIT_KINDS.createReturnEntry).toEqual(['pool_return_recorded']);
    expect(OPERATION_AUDIT_KINDS.createAdjustmentEntry).toEqual(['pool_adjusted']);
    for (const op of ['readPoolBalance', 'listPoolEntries', 'readCustodySummary', 'readGoldWithKarigar'] as const) {
      expect(OPERATION_AUDIT_KINDS[op], op).toBeNull();
    }
  });
});
describe('setSetting contract (EP-06-S8)', () => {
  it('declares the six settings keys, each with a value schema', () => {
    expect([...SETTING_KEYS]).toEqual([
      'pricingEnabled',
      'leadSlaHours',
      'requireEditToken',
      'notifyChannels',
      'lateLeadAudience',
      'autoSendWishes',
    ]);
    expect(Object.keys(SETTING_VALUE_SCHEMAS)).toEqual([...SETTING_KEYS]);
  });

  it('is a contract operation now, not a planned one', () => {
    expect(contract.setSetting.kind).toBe('command');
    expect(PLANNED_OPERATIONS as readonly string[]).not.toContain('setSetting');
  });

  it('refuses an unknown key and checks values by key', () => {
    expect(contract.setSetting.input.safeParse({ key: 'goldRate', value: 1 }).success).toBe(false);
    expect(SETTING_VALUE_SCHEMAS.leadSlaHours.safeParse(6).success).toBe(true);
    expect(SETTING_VALUE_SCHEMAS.leadSlaHours.safeParse(1.5).success).toBe(false);
    expect(SETTING_VALUE_SCHEMAS.pricingEnabled.safeParse('yes').success).toBe(false);
    expect(SETTING_VALUE_SCHEMAS.notifyChannels.safeParse({ whatsapp: true, app: true }).success).toBe(false);
    expect(SETTING_VALUE_SCHEMAS.lateLeadAudience.safeParse('everyone').success).toBe(false);
    expect(SETTING_MESSAGES.leadTimerMin).toBe('The lead timer must be at least 1 hour.');
  });
});
