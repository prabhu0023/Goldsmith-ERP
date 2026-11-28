import { describe, expect, it } from 'vitest';
import {
  gramsToUnits,
  isOverPool,
  ledgerMatchesBalance,
  POOL_ENTRY_KINDS,
  POOL_MESSAGES,
  POOL_REF_TYPES,
  poolBalanceAfter,
  returnRoomUnits,
  unitsToGrams,
} from '../src/index.js';

const units = (g: string): number => {
  const r = gramsToUnits(g);
  if (!r.ok) throw new Error(r.error);
  return r.units;
};

describe('metal pool rules (EP-18)', () => {
  it('lists the five entry kinds and two reference types', () => {
    expect([...POOL_ENTRY_KINDS]).toEqual(['opening', 'issued', 'returned', 'recovered', 'adjustment']);
    expect([...POOL_REF_TYPES]).toEqual(['job', 'piece']);
  });

  it('uses the exact refusal sentence', () => {
    expect(POOL_MESSAGES.insufficient).toBe('The metal pool does not have that much gold to issue.');
  });

  it('adds integer units: 812.5800 g less 162.4000 g is 650.1800 g', () => {
    expect(unitsToGrams(poolBalanceAfter(units('812.58'), -units('162.4')))).toBe('650.1800');
  });

  it('takes 60.0000 g twice from 100.0000 g: the first leaves 40.0000 g, the second is refused', () => {
    const after = poolBalanceAfter(units('100'), -units('60'));
    expect(unitsToGrams(after)).toBe('40.0000');
    expect(() => poolBalanceAfter(after, -units('60'))).toThrow(POOL_MESSAGES.insufficient);
  });

  it('allows an entry that leaves exactly zero', () => {
    expect(poolBalanceAfter(units('150'), -units('150'))).toBe(0);
  });

  it('refuses figures that are not whole units', () => {
    expect(() => poolBalanceAfter(0.1, 0.2)).toThrow(RangeError);
    expect(() => poolBalanceAfter(10, 1.5)).toThrow(RangeError);
    expect(() => poolBalanceAfter(Number.MAX_SAFE_INTEGER, 1)).toThrow(RangeError);
  });

  it('computes the room left to return, never below zero', () => {
    expect(returnRoomUnits(units('95'), units('20'))).toBe(units('75'));
    expect(returnRoomUnits(units('95'), units('95'))).toBe(0);
    expect(returnRoomUnits(units('95'), units('100'))).toBe(0);
  });

  it('compares the ledger sum with the balance exactly', () => {
    expect(ledgerMatchesBalance(8125800, 8125800)).toBe(true);
    expect(ledgerMatchesBalance(8125800, 8125801)).toBe(false);
    expect(ledgerMatchesBalance(0.5, 0.5)).toBe(false);
  });

  it('warns only for a valid weight above the balance', () => {
    expect(isOverPool(units('150'), '162.4')).toBe(true);
    expect(isOverPool(units('150'), '150')).toBe(false);
    expect(isOverPool(units('150'), '10')).toBe(false);
    expect(isOverPool(units('150'), '')).toBe(false);
    expect(isOverPool(units('150'), '1.23456')).toBe(false);
  });
});
