import { describe, expect, it } from 'vitest';
import {
  AUDIT_ACTION_ENTITY,
  AUDIT_ACTION_LABELS,
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  AUDIT_GROUP_IDS,
  AUDIT_GROUPS,
  auditActorLabel,
  auditFieldRows,
  fmtAuditTime,
  formatAuditValue,
  isWeightKey,
  kindsOfGroup,
  TRANSITION_AUDIT_KINDS,
  weightChangeText,
} from '../src/index.js';

describe('audit action list', () => {
  it('EP-06-S7 AC1: has one kind for each transition not audited today, and none for releaseHold', () => {
    expect(Object.keys(TRANSITION_AUDIT_KINDS).sort()).toEqual(
      [
        'createLead',
        'confirmLead',
        'startWorkingLead',
        'markLeadLost',
        'routeLeadItemToStock',
        'createOrderCopyAndJob',
        'acceptJob',
        'startJob',
        'markJobReady',
        'handOver',
        'recordParcelArrival',
        'saveTag',
        'qcTick',
        'releaseParcel',
        'ownerRecheckTag',
        'raiseProblem',
        'proposeEdit',
        'ownerAgreeEdit',
        'requestScrap',
        'onboardCustomer',
        'onboardKarigar',
        'onboardStaff',
        'sendWishes',
        'sendBroadcast',
        'upsertScale',
      ].sort(),
    );
    expect(TRANSITION_AUDIT_KINDS).not.toHaveProperty('releaseHold');
    const kinds = Object.values(TRANSITION_AUDIT_KINDS);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const kind of kinds) expect(AUDIT_ACTIONS).toContain(kind);
    expect(TRANSITION_AUDIT_KINDS.markLeadLost).toBe('lead_lost');
    expect(TRANSITION_AUDIT_KINDS.handOver).toBe('job_handed_over');
  });
  it('EP-06-S7 AC2: keeps the 10 prototype kinds with the same names', () => {
    for (const kind of [
      'edit_applied',
      'edit_refused',
      'loss_accepted',
      'parcel_sent_back',
      'parcel_last_digit',
      'problem_cleared',
      'scrap_marked',
      'scrap_declined',
      'stock_out',
      'setting_changed',
    ]) {
      expect(AUDIT_ACTIONS).toContain(kind);
    }
    expect(AUDIT_ACTION_LABELS.edit_applied).toBe('Edit applied');
    expect(AUDIT_ACTION_LABELS.setting_changed).toBe('Rule changed');
  });
  it('kinds are unique, use only a-z and _, and each has a label and an entity type', () => {
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
    expect(AUDIT_ACTIONS).toHaveLength(57);
    for (const kind of AUDIT_ACTIONS) {
      expect(kind).toMatch(/^[a-z_]+$/);
      expect(AUDIT_ACTION_LABELS[kind]).toBeTruthy();
      expect(AUDIT_ENTITY_TYPES).toContain(AUDIT_ACTION_ENTITY[kind]);
    }
    for (const type of AUDIT_ENTITY_TYPES) expect(type).toMatch(/^[a-z_]+$/);
    expect(AUDIT_ENTITY_TYPES).not.toContain('invoice');
  });
});

describe('audit groups', () => {
  it('EP-06-S10 AC5: each kind is in at most one group, and the groups are the prototype ones', () => {
    expect(AUDIT_GROUPS.map((g) => g.id)).toEqual([...AUDIT_GROUP_IDS]);
    const seen = AUDIT_GROUPS.filter((g) => g.id !== 'all').flatMap((g) => g.kinds);
    expect(new Set(seen).size).toBe(seen.length);
    expect(kindsOfGroup('edits')).toEqual(['edit_applied', 'edit_refused']);
    expect(kindsOfGroup('rules')).toEqual(['setting_changed']);
    expect(kindsOfGroup('all')).toEqual(AUDIT_ACTIONS);
    expect(seen).not.toContain('lead_lost');
  });
});

describe('audit values', () => {
  it('EP-06-S5 AC2: shows weights in grams to four decimals, and the change', () => {
    expect(isWeightKey('grossG')).toBe(true);
    expect(isWeightKey('lossG')).toBe(true);
    expect(isWeightKey('tagNo')).toBe(false);
    expect(formatAuditValue('grossG', 486500)).toBe('48.6500 g');
    expect(formatAuditValue('grossG', 486100)).toBe('48.6100 g');
    expect(weightChangeText(486500, 486100)).toBe('48.6500 g → 48.6100 g (-0.0400 g)');
    expect(weightChangeText(486100, 486500)).toBe('48.6100 g → 48.6500 g (+0.0400 g)');
  });
  it('formats nothing, lists and objects', () => {
    expect(formatAuditValue('note', null)).toBe('—');
    expect(formatAuditValue('state', 'lost')).toBe('lost');
    expect(formatAuditValue('notifyChannels', { whatsapp: true, email: false })).toBe('whatsapp: true, email: false');
    expect(auditFieldRows({ grossG: 486500, note: null }, { grossG: 486100, state: 'lost' })).toEqual([
      { field: 'grossG', label: 'Gross weight', before: '48.6500 g', after: '48.6100 g' },
      { field: 'note', label: 'Note', before: '—', after: '—' },
      { field: 'state', label: 'State', before: '—', after: 'lost' },
    ]);
    expect(auditFieldRows(null, { phone: '+91 ••••• 71145' })).toEqual([
      { field: 'phone', label: 'phone', before: '—', after: '+91 ••••• 71145' },
    ]);
  });
});

describe('audit actor and time', () => {
  it('EP-06-S9 AC2: an entry at 09:02 UTC shows 14:32 IST and "Sanjay Seth (owner)"', () => {
    expect(fmtAuditTime('2026-11-22T09:02:00.000Z')).toBe('22 Nov 2026, 14:32 IST');
    expect(fmtAuditTime(Date.parse('2026-03-01T18:30:00.000Z'))).toBe('2 Mar 2026, 00:00 IST');
    expect(auditActorLabel({ actorName: 'Sanjay Seth', actorRole: 'owner' })).toBe('Sanjay Seth (owner)');
  });
  it('EP-06-S11 AC3: a System actor shows as "Scheduler (System)"', () => {
    expect(auditActorLabel({ actorName: 'Scheduler', actorRole: 'system' })).toBe('Scheduler (System)');
    expect(auditActorLabel({ actorName: 'System (SLA breach job)', actorRole: 'system' })).toBe('SLA breach job (System)');
  });
});
