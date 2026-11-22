/**
 * Who may open a live stream (EP-07-S3 AC2, S7 AC5, S10 AC3): the same session check as an API
 * request, from the gs_session cookie only, so no token is ever put in the URL. A request from a
 * page of another origin is refused before the session is looked at.
 */
import type { Request } from 'express';
import { ForbiddenError, UnauthenticatedError } from '../pipeline/api-errors.js';
import type { SessionResolver } from '../pipeline/session-resolver.js';
import type { LiveAuthResult } from './transport.js';

export function streamAuthenticator(
  sessions: SessionResolver,
  appUrl: string,
): (req: Request) => Promise<LiveAuthResult> {
  const appOrigin = new URL(appUrl).origin;
  return async (req) => {
    const origin = req.get('origin');
    if (origin !== undefined && origin !== appOrigin) {
      return { ok: false, error: new ForbiddenError('This page may not open the live channel.') };
    }
    const session = await sessions.resolve(req);
    return session ? { ok: true, session } : { ok: false, error: new UnauthenticatedError() };
  };
}
