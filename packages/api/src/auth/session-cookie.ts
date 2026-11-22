/**
 * The session cookie (EP-04-S5, S11): `gs_session=<token>; Path=/; HttpOnly; SameSite=Lax`, plus
 * `Secure` outside development. No Max-Age: it is a browser-session cookie and the server decides
 * when the session expires. HttpOnly keeps scripts from reading it.
 */
import type { Request, Response } from 'express';

/** The value of cookie `name` in the request, or undefined. */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0 || part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

const attributes = (secure: boolean) => `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;

export const SESSION_COOKIE = 'gs_session';

export function setSessionCookie(res: Response, token: string, { secure }: { secure: boolean }): void {
  res.append('Set-Cookie', `${SESSION_COOKIE}=${token}; ${attributes(secure)}`);
}

export function clearSessionCookie(res: Response, { secure }: { secure: boolean }): void {
  res.append('Set-Cookie', `${SESSION_COOKIE}=; ${attributes(secure)}; Max-Age=0`);
}
