import { contract, okResult, signedWeightG, weightG } from '@goldsmith/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createOperationRegistry } from '../../src/pipeline/registry.js';
import { handlers as productionHandlers } from '../../src/services/index.js';
import { createFixtureHandlers, testContract } from '../support/fixture-operations.js';

function unwrap(schema: z.ZodType): z.ZodType {
  let s = schema;
  while (s instanceof z.ZodOptional || s instanceof z.ZodNullable) s = s.unwrap() as z.ZodType;
  return s;
}

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

describe('operation registry (EP-03-S1 rule)', () => {
  it('refuses at startup a handler the contract does not declare', () => {
    const stray = { rememberScale: async () => okResult.parse({ ok: true }) };
    expect(() => createOperationRegistry(contract, stray)).toThrow(
      'Operation rememberScale is not declared in the contract',
    );
  });

  it('does not treat inherited object keys as declared operations', () => {
    expect(() => createOperationRegistry(contract, { toString: async () => ({ ok: true }) })).toThrow(
      'Operation toString is not declared in the contract',
    );
    expect(createOperationRegistry(contract, {}).get('toString')).toBeUndefined();
  });

  it('registers the production handlers and the test fixtures against their contracts', () => {
    expect(() => createOperationRegistry(contract, productionHandlers)).not.toThrow();
    const registry = createOperationRegistry(testContract, createFixtureHandlers());
    expect(registry.get('createLead')?.def).toBe(testContract.createLead);
    expect(registry.get('noSuchOperation')).toBeUndefined();
  });

  it('keeps by / actor / at / time out of every test operation input, and weights on weightG (signedWeightG only for …DeltaG / …GapG)', () => {
    for (const op of Object.values(testContract)) {
      for (const [key, schema] of walk(op.input)) {
        expect(['by', 'actor', 'at', 'time'], `${op.name}.${key}`).not.toContain(key);
        if (key.endsWith('G')) {
          const expected = /(DeltaG|GapG)$/.test(key) ? signedWeightG : weightG;
          expect(unwrap(schema), `${op.name}.${key}`).toBe(expected);
        }
      }
    }
  });
});
