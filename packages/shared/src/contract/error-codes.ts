/**
 * The error codes every API operation can answer with (EP-03-S4). The api maps each to one HTTP
 * status; the web shows `message` as is.
 */
export const ERROR_CODES = [
  'validation',
  'unauthenticated',
  'forbidden',
  'not_found',
  'conflict',
  'rule_refused',
  'rate_limited',
  'internal',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
/** The body of every refused request. `field` is set only for `validation`. No stack traces. */
export interface ApiErrorBody {
  code: ErrorCode;
  /** A sentence fit to show a person. */
  message: string;
  field?: string;
}
