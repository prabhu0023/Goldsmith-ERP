/**
 * Request validation at the trust boundary (EP-03-S2). The body is parsed with the operation's
 * contract schema; unknown fields are stripped, so they never reach the service function. The
 * first problem is returned as `validation` naming the field.
 */
import type { z } from 'zod';
import { ValidationError } from './api-errors.js';

/** The raw value at `path` in the body, or undefined when any step is missing. */
function valueAt(body: unknown, path: readonly PropertyKey[]): unknown {
  let v: unknown = body;
  for (const key of path) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Record<PropertyKey, unknown>)[key];
  }
  return v;
}

export function parseInput<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = issue?.path ?? [];
  const field = path.length > 0 ? path.map(String).join('.') : 'body';
  const message =
    path.length > 0 && valueAt(body, path) === undefined
      ? `${field} is required.`
      : `${field} is not valid: ${issue?.message ?? 'invalid value'}`;
  throw new ValidationError(field, message);
}
