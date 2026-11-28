/**
 * Which cached reads a live event affects (EP-08-S8, S9, S15 AC5; epic section 11). An event
 * carries ids and versions only, never a value, so the client refetches the reads named here
 * (BR-08-5). `EVENT_QUERIES` is typed over `LiveTopic`: adding a topic to LIVE_CATALOGUE fails
 * the typecheck until the new event is mapped.
 *
 * Names of reads that screens of later epics will own are listed in PLANNED_READS. A planned name
 * matches nothing until a screen caches a read under it, so the mapping is ready the day it does.
 */
import type { LiveEnvelope, LiveTopic, OperationName } from '@goldsmith/shared';
import { LIVE_CATALOGUE } from '@goldsmith/shared';
import type { QueryRef } from './query-keys';

/** Reads that exist in the contract today. */
export const REAL_READS = [
  'readRailBadges',
  'listUsers',
  'readPiece',
  'readMyJob',
  'listKarigars',
  'listKarigarPicker',
  'readKarigarScorecard',
  'readMyKarigarProfile',
] as const satisfies readonly OperationName[];

/**
 * Reads the epic names that have no contract operation yet; the epic that adds each is in the
 * comment. Rename here if the operation gets another name.
 */
export const PLANNED_READS = [
  'listInStockPieces', // EP-22 stock and piece lifecycle
  'readStockTotals', // EP-22
  'readTodayCards', // EP-31 staff Today home
  'listSales', // EP-26 stock-out
  'listSuggestions', // EP-31
  'readParcel', // EP-21 parcel intake and tagging
  'listParcels', // EP-21
  'listDecisions', // EP-32 owner Decisions home
  'listLeads', // EP-28 leads inbox
  'readJob', // EP-19 order copy and karigar jobs
  'readKarigarJobs', // EP-20 karigar portal
  'readMetalPool', // EP-18 metal pool ledger
] as const;

export type ReadName = (typeof REAL_READS)[number] | (typeof PLANNED_READS)[number];

/** A ref matching every cached entry of each read. */
export const QUERY_REFS = Object.fromEntries([...REAL_READS, ...PLANNED_READS].map((op) => [op, { op }])) as {
  [K in ReadName]: { op: K };
};

const R = QUERY_REFS;
/** The piece an event is about, for an open piece drawer. */
const thePiece = (e: LiveEnvelope): QueryRef => ({ op: 'readPiece', input: { tagNo: e.entityId } });

export interface EventMe {
  userId: string;
}

export const EVENT_QUERIES: Record<LiveTopic, (e: LiveEnvelope, me: EventMe) => QueryRef[]> = {
  'piece.billed': () => [R.listInStockPieces, R.readStockTotals, R.readTodayCards, R.listSales, R.listSuggestions, R.readRailBadges],
  'parcel.stopped': () => [R.readParcel, R.listParcels, R.listDecisions, R.readTodayCards, R.readRailBadges],
  'edit.proposed': () => [R.listDecisions, R.readPiece, R.readRailBadges],
  'edit.applied': (e) => [thePiece(e), R.listInStockPieces, R.readStockTotals, R.readRailBadges],
  'lead.alert': () => [R.listLeads, R.readTodayCards, R.listDecisions, R.readRailBadges],
  'karigar_job.status_changed': () => [R.readJob, R.readKarigarJobs, R.readMyJob, R.listDecisions, R.listKarigars, R.readKarigarScorecard],
  'parcel.handed_over': () => [R.listParcels, R.readTodayCards, R.readRailBadges],
  'tag.saved': () => [R.readParcel],
  'metal_pool.changed': () => [R.readMetalPool, R.listKarigars, R.readKarigarScorecard],
  // The signed-in user's own access ended: nothing to refetch, the bridge ends the session. For
  // another user (not sent today: the audience is that user) the owner's list is stale.
  'user.access_changed': (e, me) => (e.entityId === me.userId ? [] : [R.listUsers]),
  'user.list_changed': () => [R.listUsers],
};

const TOPIC_BY_NAME: ReadonlyMap<string, LiveTopic> = new Map(
  (Object.keys(LIVE_CATALOGUE) as LiveTopic[]).map((topic) => [LIVE_CATALOGUE[topic].name, topic]),
);

/** The catalogue topic of an event, found by its name; undefined for a name the catalogue lacks. */
export const topicOfEvent = (e: Pick<LiveEnvelope, 'name'>): LiveTopic | undefined => TOPIC_BY_NAME.get(e.name);

/** The reads `e` affects; [] for an event the catalogue does not know. */
export function queriesForEvent(e: LiveEnvelope, me: EventMe): QueryRef[] {
  const topic = topicOfEvent(e);
  return topic ? EVENT_QUERIES[topic](e, me) : [];
}
