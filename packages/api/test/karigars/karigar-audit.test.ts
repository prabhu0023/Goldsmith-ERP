/** Every karigar change is audited in its own transaction (EP-16-S13). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTransaction } from '../../src/db/transaction.js';
import { updateKarigarWastage } from '../../src/karigars/update-karigar-wastage.js';
import type { OperationCtx } from '../../src/pipeline/registry.js';
import { describeDb } from '../db/db-test-helpers.js';
import { SERVER_NOW } from '../support/api-harness.js';
import {
  auditEntries,
  KARIGAR_AUDIT_KINDS,
  type KarigarHarness,
  karigarRow,
  startKarigarHarness,
} from './karigar-test-helpers.js';

describeDb('karigar audit (EP-16-S13)', () => {
  let h: KarigarHarness;
  beforeAll(async () => {
    h = await startKarigarHarness();
  });
  afterAll(async () => {
    await h?.close();
  });

  it('AC1: an add writes one entry with the actor, the server time, the entity and the stored fields', async () => {
    const res = await h.asOwner('onboardKarigar', {
      name: 'Ravi Achari',
      phone: '98400 50505',
      email: 'ravi.achari@example.com',
      specialties: ['Temple', 'Kundan'],
      wastageBp: 90,
    });
    expect(res.body.id).toBe('KG-05');
    const entries = await auditEntries(h, ['karigar_onboarded']);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actor_id: h.ownerId,
      actor_name: 'Sanjay Seth',
      entity_type: 'karigar',
      entity_id: 'KG-05',
      reference: 'KG-05',
      before_value: null,
    });
    expect(entries[0].at).toEqual(SERVER_NOW);
    expect(entries[0].after_value).toMatchObject({ name: 'Ravi Achari', wastageBp: 90, status: 'active' });
  });

  it('AC2: a wastage change writes one entry with before 80 and after 100', async () => {
    const kg = await karigarRow(h, 'KG-02');
    await h.asOwner('updateKarigarWastage', { karigarId: 'KG-02', version: kg.version, wastageBp: 100 });
    const entries = await auditEntries(h, ['karigar_wastage_changed']);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ entity_id: 'KG-02', before_value: { wastageBp: 80 }, after_value: { wastageBp: 100 } });
  });

  it('AC3: a change that rolls back leaves neither the new value nor an entry', async () => {
    const kg = await karigarRow(h, 'KG-01');
    const audits = (await auditEntries(h)).length;
    const ctx: OperationCtx = {
      by: { id: h.ownerId, name: 'Sanjay Seth', role: 'owner' },
      at: SERVER_NOW,
      shop: h.shop,
    };
    await expect(
      withTransaction(h.pool, async (client) => {
        const tx = { client, afterCommit: () => {} };
        await updateKarigarWastage(tx, ctx, { karigarId: 'KG-01', version: kg.version, wastageBp: 110 });
        const inside = await client.query('select wastage_bp from karigars where id = $1', [kg.id]);
        expect(inside.rows[0].wastage_bp).toBe(110);
        throw new Error('fails after the row was updated');
      }),
    ).rejects.toThrow('fails after the row was updated');
    expect(await karigarRow(h, 'KG-01')).toEqual(kg);
    expect((await auditEntries(h)).length).toBe(audits);
  });

  it('AC4: a refused request leaves no karigar entry', async () => {
    const before = (await auditEntries(h, KARIGAR_AUDIT_KINDS)).length;
    const refused = await h.call(
      'onboardKarigar',
      { name: 'Nope', phone: '98400 60606', email: 'n@example.com', specialties: ['Temple'], wastageBp: 90 },
      { session: h.session },
    );
    expect(refused.status).toBe(403);
    const invalid = await h.asOwner('onboardKarigar', {
      name: 'Nope',
      phone: '98400 60606',
      email: 'n@example.com',
      specialties: ['Temple'],
      wastageBp: 150,
    });
    expect(invalid.status).toBe(422);
    expect((await auditEntries(h, KARIGAR_AUDIT_KINDS)).length).toBe(before);
  });

  it('AC5: the security log filtered by entity KG-02 lists its karigar entries with before and after', async () => {
    const kg = await karigarRow(h, 'KG-02');
    await h.asOwner('updateKarigarDetails', {
      karigarId: 'KG-02',
      version: kg.version,
      name: 'Mahesh Soni',
      phone: '98400 20202',
      email: 'kg-02@example.com',
      workshopLocation: 'Jaipur',
      specialties: ['Kundan', 'Polki'],
    });
    const list = await h.asOwner('listAuditEntries', { entity: 'KG-02' });
    expect(list.status).toBe(200);
    const items = list.body.items as Array<{ id: string; kind: string }>;
    expect(items.map((i) => i.kind).sort()).toEqual(['karigar_edited', 'karigar_wastage_changed']);
    const entryOf = async (kind: string) =>
      (await h.asOwner('readAuditEntry', { id: items.find((i) => i.kind === kind)?.id })).body.entry;
    expect(await entryOf('karigar_wastage_changed')).toMatchObject({ before: { wastageBp: 80 }, after: { wastageBp: 100 } });
    expect(await entryOf('karigar_edited')).toMatchObject({
      before: { workshopLocation: null },
      after: { workshopLocation: 'Jaipur' },
    });
  });

  describe('personal data in entries', () => {
    it('masks the phone and email in the stored before and after values', async () => {
      const entries = await auditEntries(h, ['karigar_onboarded']);
      const text = JSON.stringify(entries[0].after_value);
      expect(text).not.toContain('9840050505');
      expect(text).not.toContain('ravi.achari@example.com');
    });
  });
});
