import { describe, expect, it } from 'vitest';
import {
  ENTITY_READ_PERMISSIONS,
  entityChannel,
  isLiveTopic,
  LIVE_CATALOGUE,
  type LiveCatalogue,
  type LiveCatalogueEntry,
  type LiveServerMessage,
  liveAudienceFor,
  liveEnvelopeSchema,
  liveMessageSeq,
  liveServerMessageSchema,
  OPERATION_RULES,
  parseChannel,
  roleChannel,
  roleMay,
  userChannel,
} from '../src/index.js';

const STAFF = roleChannel('staff');
const OWNER = roleChannel('owner');

/** A valid envelope: "Edit applied" for TAG-8841 at version 7 (EP-07-S2 AC1). */
const envelope = {
  seq: 1043,
  name: 'Edit applied',
  entityType: 'piece',
  entityId: 'TAG-8841',
  entityVersion: 7,
  emittedAt: '2026-11-21T10:00:00.000Z',
  audience: { channels: [userChannel('u-deepak'), STAFF] },
};

describe('live-event catalogue (EP-07-S11)', () => {
  it('S11 AC1: exactly the 10 names and audiences of PRODUCTION-SCOPE §1', () => {
    const audiences = Object.values(LIVE_CATALOGUE).map((e) => [
      e.name,
      e.audience({
        actorUserId: 'u-actor',
        proposerUserId: 'u-proposer',
        karigarUserId: 'u-karigar',
        parcelId: 'BATCH-2026-044',
        userId: 'u-target',
      } as never),
    ]);
    expect(audiences).toEqual([
      ['Piece billed by one staff member', { channels: [STAFF], exceptUserId: 'u-actor' }],
      ['Parcel stopped (mismatch or raised problem)', { channels: [OWNER] }],
      ['Edit proposed / token sent', { channels: [OWNER] }],
      ['Edit applied', { channels: [userChannel('u-proposer'), STAFF] }],
      ['Lead arrived / passed its SLA', { channels: [STAFF, OWNER] }],
      ['Karigar job status changed', { channels: [STAFF, OWNER, userChannel('u-karigar')] }],
      ['Parcel handed over by karigar', { channels: [STAFF] }],
      ['Tag saved on a shared parcel', { channels: ['parcel:BATCH-2026-044'], exceptUserId: 'u-actor' }],
      ['Metal pool changed', { channels: [STAFF, OWNER] }],
      ['User deactivated or role changed', { channels: [userChannel('u-target')] }],
    ]);
    // Each entry is keyed by its own topic.
    for (const [topic, e] of Object.entries(LIVE_CATALOGUE)) expect(e.topic).toBe(topic);
    // No role channel ever reaches a karigar; only their own job and account events do.
    const karigarRole = roleChannel('karigar');
    for (const [, audience] of audiences) expect((audience as { channels: string[] }).channels).not.toContain(karigarRole);
    // Without a linked karigar user or a proposer, the role channels remain.
    expect(liveAudienceFor('karigar_job.status_changed', { karigarUserId: null })).toEqual({ channels: [STAFF, OWNER] });
    expect(liveAudienceFor('edit.applied', { proposerUserId: null })).toEqual({ channels: [STAFF] });
  });

  it('S11 AC1: entity read permissions come from the one permission list', () => {
    for (const ops of Object.values(ENTITY_READ_PERMISSIONS)) {
      for (const op of ops) expect(Object.hasOwn(OPERATION_RULES, op)).toBe(true);
    }
    // A karigar may read only karigar job events (their own: readMyJob), never pieces, parcels,
    // edits, leads or the metal pool.
    const karigarReads = Object.entries(ENTITY_READ_PERMISSIONS)
      .filter(([, ops]) => (ops as readonly string[]).some((op) => roleMay('karigar', op)))
      .map(([entity]) => entity);
    expect(karigarReads).toEqual(['karigar_job']);
    expect(ENTITY_READ_PERMISSIONS.user).toEqual([]);
  });

  it('S2 rule: the envelope schema refuses an extra field', () => {
    expect(liveEnvelopeSchema.safeParse(envelope).success).toBe(true);
    expect(liveEnvelopeSchema.safeParse({ ...envelope, grossG: '48.6100' }).success).toBe(false);
    expect(liveEnvelopeSchema.safeParse({ ...envelope, audience: { ...envelope.audience, phone: 'x' } }).success).toBe(false);
    // emitted at is UTC, and the sequence and version are positive integers.
    expect(liveEnvelopeSchema.safeParse({ ...envelope, emittedAt: '2026-11-21T15:30:00+05:30' }).success).toBe(false);
    expect(liveEnvelopeSchema.safeParse({ ...envelope, seq: 0 }).success).toBe(false);
    expect(liveEnvelopeSchema.safeParse({ ...envelope, entityVersion: 1.5 }).success).toBe(false);
  });

  it('S2 AC3: no envelope field can carry weight, money, name or phone', () => {
    expect(Object.keys(liveEnvelopeSchema.shape).sort()).toEqual(
      ['audience', 'emittedAt', 'entityId', 'entityType', 'entityVersion', 'name', 'seq'].sort(),
    );
    expect(Object.keys(liveEnvelopeSchema.shape.audience.shape).sort()).toEqual(['channels', 'exceptUserId']);
    const keys = [...Object.keys(liveEnvelopeSchema.shape), ...Object.keys(liveEnvelopeSchema.shape.audience.shape)];
    for (const k of keys) expect(k).not.toMatch(/weight|gross|net|units|price|amount|money|rate|customer|phone/i);
  });

  it('S11 AC5: a G26 event is one more entry', () => {
    const released: LiveCatalogueEntry<{ parcelId: string }> = {
      topic: 'parcel.released',
      name: 'Parcel released into stock',
      entityType: 'parcel',
      audience: () => ({ channels: [STAFF, OWNER] }),
      refreshesBadges: true,
    };
    const extended: LiveCatalogue = { ...LIVE_CATALOGUE, 'parcel.released': released };
    expect(isLiveTopic('parcel.released')).toBe(false);
    expect(isLiveTopic('parcel.released', extended)).toBe(true);
    expect(liveAudienceFor('parcel.released', { parcelId: 'BATCH-2026-044' }, extended)).toEqual({ channels: [STAFF, OWNER] });
    expect(() => liveAudienceFor('parcel.released', {})).toThrow(/parcel\.released/);
  });
});

describe('live protocol channels and messages', () => {
  it('names and parses user, role and entity channels', () => {
    expect(parseChannel(userChannel('u-1'))).toEqual({ kind: 'user', userId: 'u-1' });
    expect(parseChannel(roleChannel('owner'))).toEqual({ kind: 'role', role: 'owner' });
    expect(parseChannel(entityChannel('parcel', 'BATCH-2026-044'))).toEqual({
      kind: 'entity',
      entity: 'parcel',
      code: 'BATCH-2026-044',
    });
    expect(parseChannel(entityChannel('karigar_job', 'JOB-0001'))).toEqual({
      kind: 'entity',
      entity: 'karigar_job',
      code: 'JOB-0001',
    });
    for (const bad of ['role:admin', 'piece:TAG-8841', 'user:', ':x', 'nochannel']) expect(parseChannel(bad)).toBeNull();
  });

  it('accepts the server messages, refuses extra fields, and gives the SSE id of each', () => {
    const hello: LiveServerMessage = { type: 'hello', connectionId: 'c-1', userId: 'u-1', role: 'staff', channels: [STAFF], seq: 7 };
    expect(liveServerMessageSchema.safeParse(hello).success).toBe(true);
    expect(liveServerMessageSchema.safeParse({ ...hello, token: 'x' }).success).toBe(false);
    expect(liveServerMessageSchema.safeParse({ type: 'closed', reason: 'access_changed' }).success).toBe(true);
    expect(liveServerMessageSchema.safeParse({ type: 'closed', reason: 'bored' }).success).toBe(false);
    expect(liveServerMessageSchema.safeParse({ type: 'subscribe', channel: 'role:staff' }).success).toBe(false);
    expect(liveMessageSeq(hello)).toBe(7);
    expect(liveMessageSeq({ type: 'refetch_all', seq: 9 })).toBe(9);
    expect(liveMessageSeq({ type: 'presence', parcelId: 'BATCH-2026-044', others: [] })).toBeNull();
    expect(liveMessageSeq({ type: 'closed', reason: 'going_away' })).toBeNull();
  });
});
