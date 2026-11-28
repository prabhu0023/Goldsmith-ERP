import { contract, LIVE_CATALOGUE, type LiveEnvelope, type LiveTopic } from '@goldsmith/shared';
import { describe, expect, it } from 'vitest';
import { EVENT_QUERIES, PLANNED_READS, queriesForEvent, QUERY_REFS, REAL_READS, topicOfEvent } from './event-query-map';

/** The 10 events of PRODUCTION-SCOPE section 1, by name. */
const PRODUCTION_SCOPE_NAMES = [
  'Piece billed by one staff member',
  'Parcel stopped (mismatch or raised problem)',
  'Edit proposed / token sent',
  'Edit applied',
  'Lead arrived / passed its SLA',
  'Karigar job status changed',
  'Parcel handed over by karigar',
  'Tag saved on a shared parcel',
  'Metal pool changed',
  'User deactivated or role changed',
];
const me = { userId: 'u-me' };
const topics = Object.keys(LIVE_CATALOGUE) as LiveTopic[];
const envelope = (topic: LiveTopic, over: Partial<LiveEnvelope> = {}): LiveEnvelope => ({
  seq: 1,
  name: LIVE_CATALOGUE[topic].name,
  entityType: LIVE_CATALOGUE[topic].entityType,
  entityId: 'TAG-8841',
  entityVersion: 2,
  emittedAt: '2026-11-21T10:00:00.000Z',
  audience: { channels: ['role:staff'] },
  ...over,
});
const opsOf = (topic: LiveTopic, over?: Partial<LiveEnvelope>) => queriesForEvent(envelope(topic, over), me).map((r) => r.op);

describe('event to query map (S8 AC2)', () => {
  it('has an entry for every LIVE_CATALOGUE topic and no other', () => {
    expect(Object.keys(EVENT_QUERIES).sort()).toEqual(Object.keys(LIVE_CATALOGUE).sort());
  });

  it('a topic missing from the map is a type error', () => {
    // @ts-expect-error every LiveTopic needs an entry
    const incomplete: typeof EVENT_QUERIES = { 'piece.billed': () => [] };
    expect(Object.keys(incomplete)).toHaveLength(1);
  });

  it('covers all 10 PRODUCTION-SCOPE section 1 names, and each is found by name', () => {
    const names = topics.map((t) => LIVE_CATALOGUE[t].name);
    for (const name of PRODUCTION_SCOPE_NAMES) {
      expect(names).toContain(name);
      expect(topicOfEvent({ name })).toBeDefined();
    }
    expect(topicOfEvent({ name: 'Something unknown' })).toBeUndefined();
    expect(queriesForEvent({ ...envelope('piece.billed'), name: 'Something unknown' }, me)).toEqual([]);
  });

  it('every read named is a real contract operation or a planned read, and the planned ones are not yet real', () => {
    for (const op of REAL_READS) expect(Object.hasOwn(contract, op)).toBe(true);
    for (const op of PLANNED_READS) expect(Object.hasOwn(contract, op)).toBe(false);
    const known = new Set<string>(Object.keys(QUERY_REFS));
    for (const topic of topics) for (const op of opsOf(topic)) expect(known.has(op)).toBe(true);
  });

  it('S8 AC3: piece billed refetches stock lists, stock totals, Today, sale lists, suggestions and the badges', () => {
    expect(opsOf('piece.billed')).toEqual(['listInStockPieces', 'readStockTotals', 'readTodayCards', 'listSales', 'listSuggestions', 'readRailBadges']);
  });

  it('S16 AC2: exactly the topics that refresh badges name readRailBadges', () => {
    for (const topic of topics) {
      expect(opsOf(topic).includes('readRailBadges'), topic).toBe(LIVE_CATALOGUE[topic].refreshesBadges);
    }
  });

  it('S8 AC4: parcel stopped names the parcel, Decisions and Today reads', () => {
    expect(opsOf('parcel.stopped')).toEqual(expect.arrayContaining(['readParcel', 'listDecisions', 'readTodayCards']));
  });

  it('edit applied refetches that piece by its tag', () => {
    expect(queriesForEvent(envelope('edit.applied'), me)[0]).toEqual({ op: 'readPiece', input: { tagNo: 'TAG-8841' } });
  });

  it('the other events follow epic section 11', () => {
    expect(opsOf('edit.proposed')).toEqual(expect.arrayContaining(['listDecisions', 'readPiece']));
    expect(opsOf('lead.alert')).toEqual(expect.arrayContaining(['listLeads', 'readTodayCards', 'listDecisions']));
    expect(opsOf('karigar_job.status_changed')).toEqual(expect.arrayContaining(['readJob', 'listDecisions', 'readMyJob', 'listKarigars', 'readKarigarScorecard']));
    expect(opsOf('parcel.handed_over')).toEqual(expect.arrayContaining(['listParcels', 'readTodayCards']));
    expect(opsOf('tag.saved')).toEqual(['readParcel']);
    expect(opsOf('metal_pool.changed')).toEqual(['readMetalPool', 'listKarigars', 'readKarigarScorecard']);
  });

  it('S15 AC5: another user\'s change refetches the user list; the signed-in user\'s own access event refetches nothing', () => {
    expect(opsOf('user.access_changed', { entityId: 'u-other' })).toEqual(['listUsers']);
    expect(opsOf('user.access_changed', { entityId: me.userId })).toEqual([]);
  });

  it('S9 AC2: user list changed refetches the user list', () => {
    expect(opsOf('user.list_changed', { entityId: 'u-new' })).toEqual(['listUsers']);
  });
});
