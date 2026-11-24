/**
 * The live-event catalogue (EP-07-S11, PRODUCTION-SCOPE §1). Each entry is keyed by its outbox
 * topic and fixes the event's name, entity type and audience; an emitting service function only
 * names the topic and the registry routes it. Holds were removed from v1, so there is no "piece
 * held" event. A further event (README gap G26, e.g. "Parcel released into stock") is one more
 * entry: code that reads the catalogue takes it as a parameter, so the transport needs no change.
 *
 * After routing, every receiver is still filtered by its permissions (EP-07-S5): the entity
 * type's read permissions below are operation names from the one permission list.
 */
import type { PermissionName } from '../permissions/permissions.js';
import type { LiveAudience, LiveEntityType } from './live-envelope.js';
import { entityChannel, roleChannel, userChannel } from './live-protocol.js';

export interface LiveCatalogueEntry<P = Record<string, unknown>> {
  topic: string;
  /** The exact name in PRODUCTION-SCOPE §1; the envelope's `name`. */
  name: string;
  entityType: LiveEntityType;
  /** The channels (and the excluded user) the event goes to, from the emitter's facts. */
  audience(params: P): LiveAudience;
  /** Whether the event can change a rail badge count (EP-07-S9). */
  refreshesBadges: boolean;
}

/** Any catalogue: the shared one, or the shared one plus a proposed entry. */
export type LiveCatalogue = Readonly<Record<string, LiveCatalogueEntry<never>>>;

/** No audience facts needed: the audience is fixed roles. */
type NoParams = Partial<Record<never, never>>;

const entry = <P>(e: LiveCatalogueEntry<P>): LiveCatalogueEntry<P> => e;

const STAFF = roleChannel('staff');
const OWNER = roleChannel('owner');

/** The one shop-wide metal pool's entity id (D7: one shop, one pool). */
export const METAL_POOL_ENTITY_ID = 'metal-pool';

export const LIVE_CATALOGUE = {
  'piece.billed': entry<{ actorUserId: string }>({
    topic: 'piece.billed',
    name: 'Piece billed by one staff member',
    entityType: 'piece',
    audience: ({ actorUserId }) => ({ channels: [STAFF], exceptUserId: actorUserId }),
    refreshesBadges: true,
  }),
  'parcel.stopped': entry<NoParams>({
    topic: 'parcel.stopped',
    name: 'Parcel stopped (mismatch or raised problem)',
    entityType: 'parcel',
    audience: () => ({ channels: [OWNER] }),
    refreshesBadges: true,
  }),
  'edit.proposed': entry<NoParams>({
    topic: 'edit.proposed',
    name: 'Edit proposed / token sent',
    entityType: 'piece_edit',
    audience: () => ({ channels: [OWNER] }),
    refreshesBadges: true,
  }),
  'edit.applied': entry<{ proposerUserId: string | null }>({
    topic: 'edit.applied',
    name: 'Edit applied',
    entityType: 'piece',
    audience: ({ proposerUserId }) => ({
      channels: proposerUserId === null ? [STAFF] : [userChannel(proposerUserId), STAFF],
    }),
    refreshesBadges: true,
  }),
  'lead.alert': entry<NoParams>({
    topic: 'lead.alert',
    name: 'Lead arrived / passed its SLA',
    entityType: 'lead',
    audience: () => ({ channels: [STAFF, OWNER] }),
    refreshesBadges: true,
  }),
  'karigar_job.status_changed': entry<{ karigarUserId: string | null }>({
    topic: 'karigar_job.status_changed',
    name: 'Karigar job status changed',
    entityType: 'karigar_job',
    audience: ({ karigarUserId }) => ({
      channels: karigarUserId === null ? [STAFF, OWNER] : [STAFF, OWNER, userChannel(karigarUserId)],
    }),
    refreshesBadges: false,
  }),
  'parcel.handed_over': entry<NoParams>({
    topic: 'parcel.handed_over',
    name: 'Parcel handed over by karigar',
    entityType: 'parcel',
    audience: () => ({ channels: [STAFF] }),
    refreshesBadges: true,
  }),
  'tag.saved': entry<{ actorUserId: string; parcelId: string }>({
    topic: 'tag.saved',
    name: 'Tag saved on a shared parcel',
    entityType: 'piece',
    audience: ({ actorUserId, parcelId }) => ({ channels: [entityChannel('parcel', parcelId)], exceptUserId: actorUserId }),
    refreshesBadges: false,
  }),
  'metal_pool.changed': entry<NoParams>({
    topic: 'metal_pool.changed',
    name: 'Metal pool changed',
    entityType: 'metal_pool',
    audience: () => ({ channels: [STAFF, OWNER] }),
    refreshesBadges: false,
  }),
  'user.access_changed': entry<{ userId: string }>({
    topic: 'user.access_changed',
    name: 'User deactivated or role changed',
    entityType: 'user',
    audience: ({ userId }) => ({ channels: [userChannel(userId)] }),
    refreshesBadges: false,
  }),
} as const satisfies LiveCatalogue;

export type LiveTopic = keyof typeof LIVE_CATALOGUE;

/** The audience facts an emitter supplies for `topic` (e.g. the billing user for piece.billed). */
export type LiveAudienceParams<T extends LiveTopic> = Parameters<(typeof LIVE_CATALOGUE)[T]['audience']>[0];

/** Whether `topic` is in the catalogue (the shared one unless another is given). */
export function isLiveTopic(topic: string, catalogue: LiveCatalogue = LIVE_CATALOGUE): boolean {
  return Object.hasOwn(catalogue, topic);
}

/** The catalogue entry for `topic`, or undefined. */
export function liveEntryFor(topic: string, catalogue: LiveCatalogue = LIVE_CATALOGUE): LiveCatalogueEntry<never> | undefined {
  return Object.hasOwn(catalogue, topic) ? catalogue[topic] : undefined;
}

/** The audience the catalogue gives `topic` for the emitter's facts; throws for an unknown topic. */
export function liveAudienceFor(topic: string, params: object, catalogue: LiveCatalogue = LIVE_CATALOGUE): LiveAudience {
  const found = liveEntryFor(topic, catalogue);
  if (!found) throw new Error(`Unknown live event "${topic}": it is not in the live-event catalogue`);
  return found.audience(params as never);
}

/**
 * The operations whose permission lets a role read an entity type's events, from the one
 * permission list (`OPERATION_RULES`): a receiver whose role may run none of them gets no event
 * about that entity. A karigar's `readMyJob` covers only their own jobs (karigar scope). `user`
 * events go to that user only, so no operation grants them.
 */
export const ENTITY_READ_PERMISSIONS = {
  piece: ['stockOut'],
  parcel: ['saveTag'],
  piece_edit: ['proposeEdit'],
  lead: ['markLeadLost'],
  karigar_job: ['createOrderCopyAndJob', 'readMyJob'],
  metal_pool: ['createOrderCopyAndJob'],
  user: [],
} as const satisfies Record<LiveEntityType, readonly PermissionName[]>;
