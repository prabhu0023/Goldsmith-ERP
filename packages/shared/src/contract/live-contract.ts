/**
 * The live channel's operations (EP-07-S4, S8). D3 is decided: Server-Sent Events, so the stream
 * is one-way and the browser asks for everything else through `POST /api/ops/:operation` like any
 * other call (session, permission list, one transaction). `connectionId` is the stream's id from
 * its `hello` message; a stream of another user, or one that is not open on this server, answers
 * not_found.
 *
 * Presence (S8): a client calls joinParcelPresence when a parcel screen opens and again every few
 * seconds as its heartbeat; an entry whose heartbeats stop expires on the server. leaveParcelPresence
 * on leaving the screen. Joining also subscribes the stream to `parcel:<code>`, where the presence
 * lists travel.
 */
import { z } from 'zod';
import { okResult } from './contract-fields.js';
import { defineOperation } from './define-operation.js';
import { ERROR_CODES } from './error-codes.js';

const connectionId = z.uuid();
const channel = z.string().trim().min(1).max(200);
const parcelId = z.string().trim().min(1).max(100);

export const liveOperations = {
  subscribeLiveChannel: defineOperation({
    name: 'subscribeLiveChannel',
    kind: 'command',
    input: z.object({ connectionId, channel }),
    result: okResult,
    errors: ERROR_CODES,
  }),
  unsubscribeLiveChannel: defineOperation({
    name: 'unsubscribeLiveChannel',
    kind: 'command',
    input: z.object({ connectionId, channel }),
    result: okResult,
    errors: ERROR_CODES,
  }),
  joinParcelPresence: defineOperation({
    name: 'joinParcelPresence',
    kind: 'command',
    input: z.object({ connectionId, parcelId }),
    result: z.object({
      ok: z.literal(true),
      /** The others who have the parcel open, never the caller. */
      others: z.array(z.object({ userId: z.string(), name: z.string() })),
    }),
    errors: ERROR_CODES,
  }),
  leaveParcelPresence: defineOperation({
    name: 'leaveParcelPresence',
    kind: 'command',
    input: z.object({ connectionId, parcelId }),
    result: okResult,
    errors: ERROR_CODES,
  }),
} as const;
