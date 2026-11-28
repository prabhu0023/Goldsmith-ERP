/**
 * One declaration per operation: its input schema, result schema and the error codes it may
 * answer with. Who acts, when and for which shop are set by the server, so an input may not
 * declare `by`, `actor`, `at` or `time` (refused by the type and at runtime).
 */
import type { z } from 'zod';
import type { ErrorCode } from './error-codes.js';

/**
 * Request header the browser sends on a background refetch (a live-triggered or timed re-read).
 * With the value `1`, a read or list operation, and `readCurrentSession`, checks and row-locks
 * the session but does not extend its idle expiry, so an unattended tab still times out
 * (EP-04-S12). A create or command ignores it.
 */
export const BACKGROUND_REFRESH_HEADER = 'X-Background-Refresh';
export type OperationKind = 'create' | 'command' | 'read' | 'list';

/** Keys the server owns; never part of an operation input. */
export const SERVER_SET_KEYS = ['by', 'actor', 'at', 'time'] as const;

type NoServerKeys = { by?: never; actor?: never; at?: never; time?: never };

export interface OperationDef<
  Name extends string = string,
  Shape extends z.ZodRawShape = z.ZodRawShape,
  R extends z.ZodType = z.ZodType,
> {
  name: Name;
  kind: OperationKind;
  input: z.ZodObject<Shape>;
  result: R;
  errors: readonly ErrorCode[];
  /**
   * False for a call the browser makes on its own, not on a user action (the live channel's
   * operations, EP-07: badge reads, presence heartbeats, re-subscribing after a reconnect): the
   * server still checks and row-locks the session but does not extend its idle expiry, so an
   * unattended tab still times out (EP-04-S12). Unset: the call extends the session.
   */
  extendsSession?: false;
}

export type Contract = Record<string, OperationDef>;

export function defineOperation<Name extends string, Shape extends z.ZodRawShape & NoServerKeys, R extends z.ZodType>(
  def: OperationDef<Name, Shape, R>,
): OperationDef<Name, Shape, R> {
  for (const key of SERVER_SET_KEYS) {
    if (Object.hasOwn(def.input.shape, key)) {
      throw new Error(`Operation ${def.name} may not declare "${key}" in its input; the server sets it.`);
    }
  }
  return def;
}
