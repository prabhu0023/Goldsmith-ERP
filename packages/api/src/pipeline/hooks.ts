/**
 * Pipeline hooks later epics fill in: the rate limiter (EP-03-S11, values in EP-39) and the
 * permission check (EP-03-S3 rule, rules in EP-05). The defaults allow everything.
 */
import type { Actor } from '@goldsmith/shared';

/** What the rate limiter sees: never the request body. */
export interface RateLimitInfo {
  operation: string;
  /** The caller's user id when signed in, else null. */
  userId: string | null;
  clientAddress: string;
}

export type RateLimiter = (info: RateLimitInfo) => { allowed: boolean } | Promise<{ allowed: boolean }>;

export const allowAllRateLimiter: RateLimiter = () => ({ allowed: true });

/** Runs after the actor is set, before the service function. Throw ForbiddenError to refuse. */
export type PermissionCheck = (operation: string, actor: Actor) => void | Promise<void>;

export const allowAllPermissions: PermissionCheck = () => {};
