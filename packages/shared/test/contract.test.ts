import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  assertCanMarkLost,
  CONTRACT_VERSION,
  contract,
  DomainError,
  defineOperation,
  ERROR_CODES,
  okResult,
  signedWeightG,
  weightG,
} from '../src/index.js';
import type { LeadState } from '../src/index.js';

/** Unwrap optional / nullable wrappers to the schema underneath. */
function unwrap(schema: z.ZodType): z.ZodType {
  let s = schema;
  while (s instanceof z.ZodOptional || s instanceof z.ZodNullable) s = s.unwrap() as z.ZodType;
  return s;
}

/** Every [key, schema] pair in an input, recursing into objects and arrays. */
function walk(schema: z.ZodType, out: Array<[string, z.ZodType]> = []): Array<[string, z.ZodType]> {
  const s = unwrap(schema);
  if (s instanceof z.ZodObject) {
    for (const [key, child] of Object.entries(s.shape as Record<string, z.ZodType>)) {
      out.push([key, child]);
      walk(child, out);
    }
  } else if (s instanceof z.ZodArray) {
    walk(s.element as z.ZodType, out);
  }
  return out;
}

const operations = Object.values(contract);

describe('operation contract (EP-03-S1)', () => {
  it('has a non-empty version', () => {
    expect(typeof CONTRACT_VERSION).toBe('string');
    expect(CONTRACT_VERSION.length).toBeGreaterThan(0);
  });

  it('never lets an input carry by / actor / at / time', () => {
    for (const op of operations) {
      const keys = walk(op.input).map(([k]) => k);
      for (const banned of ['by', 'actor', 'at', 'time']) expect(keys, op.name).not.toContain(banned);
    }
  });

  it('declares every weight field (…G) with weightG, or signedWeightG only for …DeltaG / …GapG', () => {
    for (const op of operations) {
      for (const [key, schema] of walk(op.input)) {
        if (!key.endsWith('G')) continue;
        const expected = /(DeltaG|GapG)$/.test(key) ? signedWeightG : weightG;
        expect(unwrap(schema), `${op.name}.${key}`).toBe(expected);
      }
    }
  });

  it('keeps money (…INR) nullable and unused by EP-03 operations', () => {
    for (const op of operations) {
      for (const [key, schema] of walk(op.input)) {
        if (key.endsWith('INR')) expect(schema.safeParse(null).success, `${op.name}.${key}`).toBe(true);
      }
      expect(walk(op.input).filter(([k]) => k.endsWith('INR')), op.name).toEqual([]);
    }
  });

  it('does not expose prototype-only actions such as rememberScale (EP-03-S3)', () => {
    expect('rememberScale' in contract).toBe(false);
  });

  it('lists the eight error codes', () => {
    expect([...ERROR_CODES]).toEqual([
      'validation',
      'unauthenticated',
      'forbidden',
      'not_found',
      'conflict',
      'rule_refused',
      'rate_limited',
      'internal',
    ]);
  });

  it('refuses an operation input that declares a server-set key', () => {
    const bad = z.object({ leadId: z.string(), by: z.string() });
    expect(() =>
      // @ts-expect-error by is server-set and refused by the type too
      defineOperation({ name: 'bad', kind: 'command', input: bad, result: okResult, errors: ['validation'] }),
    ).toThrow(/by/);
  });

  it('validates markLeadLost input and strips unknown fields', () => {
    const input = contract.markLeadLost.input;
    expect(input.safeParse({ leadId: '' }).success).toBe(false);
    expect(input.safeParse({}).success).toBe(false);
    expect(input.parse({ leadId: ' LD-2026-214 ', by: 'someone' })).toEqual({ leadId: 'LD-2026-214' });
  });
});

describe('weightG', () => {
  it('parses a four-decimal gram string to integer units', () => {
    expect(weightG.parse('12.3456')).toBe(123456);
  });

  it.each(['12.34567', '12,3a'])('refuses %s without rounding', (text) => {
    const r = weightG.safeParse(text);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Enter grams with up to four decimals, e.g. 12.3456');
  });

  it('refuses a JSON number', () => {
    expect(weightG.safeParse(12.34).success).toBe(false);
  });
  it.each(['0', '0.0000'])('accepts zero (%s)', (text) => {
    expect(weightG.parse(text)).toBe(0);
  });
  it.each(['-12.3456', '-0.0001', '-1'])('refuses the negative weight %s', (text) => {
    const r = weightG.safeParse(text);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Weight cannot be negative');
  });
  it('treats "-0" as zero, not as a negative weight', () => {
    expect(weightG.parse('-0.0000')).toBe(0);
  });
  it('names the field when used in an object', () => {
    const r = z.object({ grossG: weightG }).safeParse({ grossG: '-1.0000' });
    expect(r.error?.issues[0]?.path).toEqual(['grossG']);
  });
});
describe('signedWeightG', () => {
  it.each([
    ['-0.0400', -400],
    ['12.3456', 123456],
    ['0', 0],
  ])('parses %s to %i units', (text, units) => {
    expect(signedWeightG.parse(text)).toBe(units);
  });
  it.each(['-12.34567', '+1', '-', '1,2'])('refuses %s like weightG does', (text) => {
    const r = signedWeightG.safeParse(text);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('Enter grams with up to four decimals, e.g. 12.3456');
  });
  it('refuses a JSON number', () => {
    expect(signedWeightG.safeParse(-0.04).success).toBe(false);
  });
});

describe('assertCanMarkLost', () => {
  it('refuses a converted lead with a sentence', () => {
    expect(() => assertCanMarkLost('converted')).toThrow(DomainError);
    expect(() => assertCanMarkLost('converted')).toThrow('A converted lead cannot be marked lost.');
  });

  it.each<LeadState>(['opened', 'being_worked', 'needs_glance', 'lost'])('allows %s', (state) => {
    expect(() => assertCanMarkLost(state)).not.toThrow();
  });
});
