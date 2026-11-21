import type { AuthInput, AuthOperationName, AuthResult, ErrorCode } from '@goldsmith/shared';
/** The answer of one sign-in call: the result, or the error envelope the web shows as is. */
export type AuthAnswer<N extends AuthOperationName> =
  | { ok: true; data: AuthResult<N> }
  | { ok: false; code: ErrorCode; message: string; field?: string };
const NETWORK_MESSAGE = 'Cannot reach the server. Check the connection and try again.';
/** Calls `POST /api/auth/<op>` on the same origin, so the session cookie travels with it. */
export async function authCall<N extends AuthOperationName>(op: N, body: AuthInput<N>): Promise<AuthAnswer<N>> {
  let res: Response;
  try {
    res = await fetch(`/api/auth/${op}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, code: 'internal', message: NETWORK_MESSAGE };
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (res.ok) return { ok: true, data: json as AuthResult<N> };
  const err = (json ?? {}) as { code?: ErrorCode; message?: string; field?: string };
  return {
    ok: false,
    code: err.code ?? 'internal',
    message: err.message ?? NETWORK_MESSAGE,
    ...(err.field ? { field: err.field } : {}),
  };
}
