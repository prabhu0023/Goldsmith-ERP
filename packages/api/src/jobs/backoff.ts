/** Retry delays (EP-10-S3): 30 s, 1 min, 2 min, ... doubling, never more than 15 minutes. */
export const BACKOFF_BASE_MS = 30_000;
export const BACKOFF_MAX_MS = 15 * 60_000;

/** Delay before the retry that follows failed attempt `attempt` (1 = the first try). */
export const backoffDelayMs = (attempt: number): number =>
  Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_MAX_MS);
