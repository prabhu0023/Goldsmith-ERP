/**
 * The channels a stream joins on open (EP-07-S4 AC1-2, S6). They come from the session, never
 * from the client: staff and owner get their user and role channel; a karigar gets only the user
 * channel, where their own jobs' events arrive (the catalogue addresses a job's karigar by user).
 */
import { type RoleId, roleChannel, userChannel } from '@goldsmith/shared';

export function baseChannels(userId: string, role: RoleId): string[] {
  return role === 'karigar' ? [userChannel(userId)] : [userChannel(userId), roleChannel(role)];
}
