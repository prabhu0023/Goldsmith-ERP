/**
 * The one live event envelope (EP-07-S2). Every published event carries exactly these 7 fields:
 * sequence number, event name, entity type, entity id, entity version, emitted at (UTC) and
 * audience. It never carries a business value (no weight, money, customer name or phone): a
 * client refetches the record through a permission-checked read. The schema is strict, so an
 * envelope with an extra field is refused.
 */
import { z } from 'zod';

/** The kinds of record a live event can be about. */
export const LIVE_ENTITY_TYPES = ['piece', 'parcel', 'piece_edit', 'lead', 'karigar_job', 'metal_pool', 'user'] as const;
export type LiveEntityType = (typeof LIVE_ENTITY_TYPES)[number];

export const liveAudienceSchema = z
  .object({
    channels: z.array(z.string().min(1)),
    /** A user in the channels who must not get the event (the one who caused it). */
    exceptUserId: z.string().min(1).optional(),
  })
  .strict();
export type LiveAudience = z.infer<typeof liveAudienceSchema>;

export const liveEnvelopeSchema = z
  .object({
    /** Per-shop stream position, assigned by the server at publish time; never goes backwards. */
    seq: z.number().int().min(1),
    /** The catalogue name, e.g. "Edit applied". */
    name: z.string().min(1),
    entityType: z.enum(LIVE_ENTITY_TYPES),
    /** The human code (TAG-8841, BATCH-2026-044), or a user id for account events. */
    entityId: z.string().min(1),
    /** The row's version column after the change (EP-02-S14). */
    entityVersion: z.number().int().min(1),
    /** Server time, ISO 8601 in UTC (ends in Z). */
    emittedAt: z.iso.datetime(),
    audience: liveAudienceSchema,
  })
  .strict();
export type LiveEnvelope = z.infer<typeof liveEnvelopeSchema>;

/** The envelope before the publisher assigns its sequence number. */
export const liveEnvelopeDraftSchema = liveEnvelopeSchema.omit({ seq: true });
export type LiveEnvelopeDraft = z.infer<typeof liveEnvelopeDraftSchema>;
