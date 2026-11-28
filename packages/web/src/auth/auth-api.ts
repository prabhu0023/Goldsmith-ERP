import { type AuthInput, type AuthOperationName, type AuthResult, BACKGROUND_REFRESH_HEADER } from '@goldsmith/shared';
import { type HttpFailure, postJson } from '../api/http';

/** The answer of one sign-in call: the result, or the error envelope the web shows as is. */
export type AuthAnswer<N extends AuthOperationName> = { ok: true; data: AuthResult<N> } | HttpFailure;

/**
 * Calls `POST /api/auth/<op>` on the same origin, so the session cookie travels with it. There is
 * no session-ended hook here: a wrong password is also a 401. `background` marks the live
 * client's own session check, which the server must not count as activity (EP-04-S12).
 */
export function authCall<N extends AuthOperationName>(
  op: N,
  body: AuthInput<N>,
  opts: { background?: boolean } = {},
): Promise<AuthAnswer<N>> {
  return postJson<AuthResult<N>>(`/api/auth/${op}`, body, {
    headers: opts.background ? { [BACKGROUND_REFRESH_HEADER]: '1' } : {},
  });
}
