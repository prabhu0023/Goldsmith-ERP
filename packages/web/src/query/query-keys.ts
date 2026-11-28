/**
 * Cache keys (EP-08-S2 AC5). A read is identified by its operation and its input, so two inputs
 * (BATCH-2026-043 and BATCH-2026-044) are two entries that never overwrite each other.
 */

/** JSON with object keys sorted and undefined members dropped, so equal inputs give equal text. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value)) ?? 'null';
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => sortKeys(v) ?? null);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

export const keyOf = (op: string, input?: unknown): string => `${op}:${stableStringify(input ?? {})}`;

/**
 * Names the cached reads an event or an action affects. A missing `input` matches every entry of
 * the operation. `op` is a plain string so a read planned for a later epic can be named before its
 * contract operation exists.
 */
export interface QueryRef {
  op: string;
  input?: unknown;
}

/** Whether `ref` names the entry (`op`, `key`). */
export const refMatches = (ref: QueryRef, op: string, key: string): boolean =>
  ref.op === op && (ref.input === undefined || keyOf(ref.op, ref.input) === key);
