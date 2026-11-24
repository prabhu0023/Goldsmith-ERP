import { describe, expect, it } from 'vitest';
import { createLiveEntityCache, type LiveEntityType, unitsToGrams } from '../src/index.js';

interface PieceRecord {
  tagNo: string;
  version: number;
  status: 'in_stock' | 'billed';
  grossUnits: number;
}

/** A stand-in for the permission-checked piece read (EP-22): the server's current rows. */
function server(rows: PieceRecord[]) {
  const fetches: string[] = [];
  return {
    rows,
    fetches,
    fetchEntity: async (_type: LiveEntityType, id: string) => {
      fetches.push(id);
      const row = rows.find((r) => r.tagNo === id);
      return row ? { ...row } : null;
    },
  };
}

const pieceEvent = (entityId: string, entityVersion: number) => ({ entityType: 'piece' as const, entityId, entityVersion });

describe('EP-07 live entity cache', () => {
  it('S2 AC4: holding TAG-8841 at version 7, a late event for version 6 causes no refetch and keeps version 7', async () => {
    const s = server([{ tagNo: 'TAG-8841', version: 7, status: 'in_stock', grossUnits: 486100 }]);
    const cache = createLiveEntityCache({ fetchEntity: s.fetchEntity });
    cache.put('piece', 'TAG-8841', { tagNo: 'TAG-8841', version: 7, status: 'in_stock', grossUnits: 486100 });
    expect(await cache.apply(pieceEvent('TAG-8841', 6))).toBe(false);
    expect(await cache.apply(pieceEvent('TAG-8841', 7))).toBe(false);
    expect(s.fetches).toEqual([]);
    expect(cache.get('piece', 'TAG-8841')?.version).toBe(7);
  });

  it('S2 AC5: after "Edit applied" the stock screen shows the gross weight from the refetched piece, 48.6100 g', async () => {
    const s = server([{ tagNo: 'TAG-8841', version: 6, status: 'in_stock', grossUnits: 486500 }]);
    const cache = createLiveEntityCache({ fetchEntity: s.fetchEntity });
    cache.put('piece', 'TAG-8841', { ...s.rows[0] });
    // The edit commits on the server: gross 48.6500 g -> 48.6100 g, version 7.
    s.rows[0] = { tagNo: 'TAG-8841', version: 7, status: 'in_stock', grossUnits: 486100 };
    const changed: string[] = [];
    cache.onChange((_t, id, rec) => changed.push(`${id}@${rec?.version}`));
    expect(await cache.apply(pieceEvent('TAG-8841', 7))).toBe(true);
    expect(s.fetches).toEqual(['TAG-8841']);
    const shown = `${unitsToGrams(cache.get('piece', 'TAG-8841')?.grossUnits ?? 0)} g`;
    expect(shown).toBe('48.6100 g');
    expect(changed).toEqual(['TAG-8841@7']);
  });

  it('two events for the same record while a fetch runs lead to one fetch when it already brought the newer version', async () => {
    const s = server([{ tagNo: 'TAG-8841', version: 9, status: 'in_stock', grossUnits: 486100 }]);
    const cache = createLiveEntityCache({ fetchEntity: s.fetchEntity });
    await Promise.all([cache.apply(pieceEvent('TAG-8841', 8)), cache.apply(pieceEvent('TAG-8841', 9))]);
    expect(s.fetches).toEqual(['TAG-8841']);
    expect(cache.get('piece', 'TAG-8841')?.version).toBe(9);
  });

  it('S11 AC4: "Piece billed" for TAG-8841 takes it off Rajesh\'s available list after the refetch', async () => {
    const s = server([
      { tagNo: 'TAG-8841', version: 1, status: 'in_stock', grossUnits: 486500 },
      { tagNo: 'TAG-8842', version: 1, status: 'in_stock', grossUnits: 120000 },
    ]);
    const cache = createLiveEntityCache({ fetchEntity: s.fetchEntity });
    for (const r of s.rows) cache.put('piece', r.tagNo, { ...r });
    const available = () =>
      cache
        .values('piece')
        .filter((p) => p.status === 'in_stock')
        .map((p) => p.tagNo);
    expect(available()).toEqual(['TAG-8841', 'TAG-8842']);
    s.rows[0] = { ...s.rows[0], version: 2, status: 'billed' };
    await cache.apply(pieceEvent('TAG-8841', 2));
    expect(available()).toEqual(['TAG-8842']);
  });

  it('a record the read no longer returns is removed', async () => {
    const s = server([]);
    const cache = createLiveEntityCache({ fetchEntity: s.fetchEntity });
    cache.put('piece', 'TAG-0001', { tagNo: 'TAG-0001', version: 1, status: 'in_stock', grossUnits: 1 });
    await cache.apply(pieceEvent('TAG-0001', 2));
    expect(cache.get('piece', 'TAG-0001')).toBeUndefined();
  });
});
