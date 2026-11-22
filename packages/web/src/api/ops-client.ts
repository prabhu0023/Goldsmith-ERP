import type { ErrorCode, OperationInput, OperationName, OperationResult } from '@goldsmith/shared';
/** The answer of one operation call: the result, or the error envelope the web shows as is. */
export type OpsAnswer<N extends OperationName> =
  | { ok: true; data: OperationResult<N> }
  | { ok: false; code: ErrorCode; message: string; field?: string };
const NETWORK_MESSAGE = 'Cannot reach the server. Check the connection and try again.';
/**
 * Calls `POST /api/ops/<op>` on the same origin, so the session cookie travels with it. A create
 * passes one idempotency key per form so that a resend cannot add the record twice (EP-03-S8).
 */
export async function opsCall<N extends OperationName>(
  op: N,
  body: OperationInput<N>,
  opts: { idempotencyKey?: string } = {},
): Promise<OpsAnswer<N>> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  let res: Response;
  try {
    res = await fetch(`/api/ops/${op}`, { method: 'POST', credentials: 'same-origin', headers, body: JSON.stringify(body) });
  } catch {
    return { ok: false, code: 'internal', message: NETWORK_MESSAGE };
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (res.ok) return { ok: true, data: json as OperationResult<N> };
  const err = (json ?? {}) as { code?: ErrorCode; message?: string; field?: string };
  return {
    ok: false,
    code: err.code ?? 'internal',
    message: err.message ?? NETWORK_MESSAGE,
    ...(err.field ? { field: err.field } : {}),
  };
}
