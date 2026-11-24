/**
 * The live channel's message protocol (EP-07-S3, S4, S7, S8). D3 is decided by the owner:
 * Server-Sent Events over plain HTTP. The server pushes these messages on one long-lived
 * `GET /api/live` stream (`event: <type>`, `data: <JSON>`); a message that moves the client's
 * stream position also carries `id: <seq>`, so the browser's own `Last-Event-ID` reconnect resumes
 * from it. The browser talks back with ordinary contract operations (live-contract.ts): entity
 * channel subscriptions and parcel presence, the presence join doubling as its heartbeat.
 * Channel names: `user:<userId>`, `role:<role>` and the entity channels `parcel:<code>` and
 * `karigar_job:<code>`.
 */
import { z } from 'zod';
import type { RoleId } from '../types/jewellery.js';
import { liveEnvelopeSchema } from './live-envelope.js';

export const LIVE_ENTITY_CHANNELS = ['parcel', 'karigar_job'] as const;
export type LiveEntityChannel = (typeof LIVE_ENTITY_CHANNELS)[number];

export const userChannel = (userId: string): string => `user:${userId}`;
export const roleChannel = (role: RoleId): string => `role:${role}`;
export const entityChannel = (kind: LiveEntityChannel, code: string): string => `${kind}:${code}`;

export type ParsedChannel =
  | { kind: 'user'; userId: string }
  | { kind: 'role'; role: RoleId }
  | { kind: 'entity'; entity: LiveEntityChannel; code: string };

const ROLES: readonly string[] = ['owner', 'staff', 'karigar'];
const ENTITY_CHANNELS: readonly string[] = LIVE_ENTITY_CHANNELS;

/** The channel's kind and key, or null for a name that is not a channel. */
export function parseChannel(channel: string): ParsedChannel | null {
  const colon = channel.indexOf(':');
  if (colon <= 0 || colon === channel.length - 1) return null;
  const kind = channel.slice(0, colon);
  const key = channel.slice(colon + 1);
  if (kind === 'user') return { kind: 'user', userId: key };
  if (kind === 'role') return ROLES.includes(key) ? { kind: 'role', role: key as RoleId } : null;
  if (ENTITY_CHANNELS.includes(kind)) return { kind: 'entity', entity: kind as LiveEntityChannel, code: key };
  return null;
}

/** The stream endpoint; the gs_session cookie authenticates it (no token in the URL). */
export const LIVE_STREAM_PATH = '/api/live';

/** Why the server ended a stream (the last message before it ends). */
export const LIVE_CLOSE_REASONS = [
  /** The session was signed out, expired or ended: sign in again. */
  'session_ended',
  /** The user was deactivated or their role changed. */
  'access_changed',
  /** The server is shutting down: reconnect. */
  'going_away',
] as const;
export type LiveCloseReason = (typeof LIVE_CLOSE_REASONS)[number];

const role = z.enum(['owner', 'staff', 'karigar']);
const seq = z.number().int().min(0);

export const livePresenceOtherSchema = z.object({ userId: z.string(), name: z.string() }).strict();
export type LivePresenceOther = z.infer<typeof livePresenceOtherSchema>;

export const liveServerMessageSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('hello'),
      /** Names this stream in the live operations (subscribe, presence). */
      connectionId: z.string(),
      userId: z.string(),
      role,
      channels: z.array(z.string()),
      /** The stream position the connection starts after. */
      seq,
    })
    .strict(),
  z.object({ type: z.literal('event'), event: liveEnvelopeSchema }).strict(),
  /** Too far behind (or ahead) to replay: refetch every screen's data, then continue from `seq`. */
  z.object({ type: z.literal('refetch_all'), seq }).strict(),
  /** The missed events have been replayed up to `seq`. */
  z.object({ type: z.literal('replayed'), seq }).strict(),
  z
    .object({
      type: z.literal('presence'),
      parcelId: z.string(),
      others: z.array(livePresenceOtherSchema),
    })
    .strict(),
  /** The server ends the stream after this message. */
  z.object({ type: z.literal('closed'), reason: z.enum(LIVE_CLOSE_REASONS) }).strict(),
]);
export type LiveServerMessage = z.infer<typeof liveServerMessageSchema>;
export type LiveServerMessageType = LiveServerMessage['type'];

/**
 * The stream position a message moves the client to (its SSE `id`), or null for a message that
 * does not move it (presence, closed).
 */
export function liveMessageSeq(msg: LiveServerMessage): number | null {
  switch (msg.type) {
    case 'hello':
    case 'refetch_all':
    case 'replayed':
      return msg.seq;
    case 'event':
      return msg.event.seq;
    default:
      return null;
  }
}
