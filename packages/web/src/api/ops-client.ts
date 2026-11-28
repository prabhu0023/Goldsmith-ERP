import type { OperationInput, OperationName } from '@goldsmith/shared';
import { type ApiAnswer, type ApiClient, createApiClient } from './api-client';

/** Kept until the screens move to the typed client and the query layer (EP-08 items 18 and 19). */
export type OpsAnswer<N extends OperationName> = ApiAnswer<N>;

/** The module-level client the screens use today; it has no session-ended hook. */
const defaultClient: ApiClient = createApiClient();

/** The same client, for the data hooks when no provider gives them one (the sign-in screens). */
export const defaultApiClient: ApiClient = defaultClient;

/**
 * Calls `POST /api/ops/<op>` on the same origin, so the session cookie travels with it. A create
 * passes one idempotency key per form so that a resend cannot add the record twice (EP-03-S8);
 * without a key, none is sent (the typed client, api-client.ts, makes one for every action).
 */
export function opsCall<N extends OperationName>(
  op: N,
  body: OperationInput<N>,
  opts: { idempotencyKey?: string } = {},
): Promise<OpsAnswer<N>> {
  return defaultClient.call(op, body, { idempotencyKey: opts.idempotencyKey ?? false });
}
