/**
 * The live channel's message protocol (EP-07-S3, S4, S7, S8). Transport-neutral: the same
 * messages travel over WebSocket today (D3, pending owner confirmation) and could travel over
 * Server-Sent Events plus POSTs. Channel names: `user:<userId>`, `role:<role>` and the entity
 * channels `parcel:<code>` and `karigar_job:<code>`.
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

/** WebSocket close codes the server uses. */
export const LIVE_CLOSE = {
  /** The session was signed out, expired or ended: sign in again. */
  session_ended: 4401,
  /** The user was deactivated or their role changed. */
  access_changed: 4403,
  /** The server is shutting down: reconnect. */
  going_away: 1001,
} as const;

const channel = z.string().min(1).max(200);
const parcelId = z.string().min(1).max(100);

export const liveClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe'), channel }).strict(),
  z.object({ type: z.literal('unsubscribe'), channel }).strict(),
  z.object({ type: z.literal('presence_join'), parcelId }).strict(),
  z.object({ type: z.literal('presence_leave'), parcelId }).strict(),
  z.object({ type: z.literal('heartbeat') }).strict(),
]);
export type LiveClientMessage = z.infer<typeof liveClientMessageSchema>;
export type LiveClientMessageType = LiveClientMessage['type'];

const role = z.enum(['owner', 'staff', 'karigar']);

export const liveServerMessageSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('hello'),
      connectionId: z.string(),
      userId: z.string(),
      role,
      channels: z.array(z.string()),
      /** The stream position the connection starts after. */
      seq: z.number().int().min(0),
    })
    .strict(),
  z.object({ type: z.literal('event'), event: liveEnvelopeSchema }).strict(),
  /** Too far behind (or ahead) to replay: refetch every screen's data, then continue from `seq`. */
  z.object({ type: z.literal('refetch_all'), seq: z.number().int().min(0) }).strict(),
  /** The missed events have been replayed up to `seq`. */
  z.object({ type: z.literal('replayed'), seq: z.number().int().min(0) }).strict(),
  z
    .object({
      type: z.literal('presence'),
      parcelId: z.string(),
      others: z.array(z.object({ userId: z.string(), name: z.string() }).strict()),
    })
    .strict(),
  z.object({ type: z.literal('subscribed'), channel: z.string() }).strict(),
  z.object({ type: z.literal('unsubscribed'), channel: z.string() }).strict(),
  z
    .object({
      type: z.literal('refused'),
      /** The client message type refused, or 'message' for one that could not be read. */
      request: z.enum(['subscribe', 'unsubscribe', 'presence_join', 'presence_leave', 'heartbeat', 'message']),
      code: z.enum(['forbidden', 'not_found', 'validation']),
      channel: z.string().optional(),
    })
    .strict(),
]);
export type LiveServerMessage = z.infer<typeof liveServerMessageSchema>;
