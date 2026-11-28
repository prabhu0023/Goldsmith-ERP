/**
 * One error format (EP-03-S4, S5). Every refused request answers `{ code, message, field? }`;
 * `field` only for `validation`. Only DomainError and ApiError sentences reach a person; any
 * other exception is logged on the server and answered with a generic sentence, so no stack
 * trace, file path or database text ever leaves the server.
 */
import { type ApiErrorBody, AUTH_MESSAGES, DomainError, type ErrorCode } from '@goldsmith/shared';
import { RowNotFoundError, StaleWriteError } from '../db/versioned.js';

/** One HTTP status per error code. */
export const HTTP_STATUS: Record<ErrorCode, number> = {
  validation: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rule_refused: 422,
  rate_limited: 429,
  internal: 500,
};

export const INTERNAL_MESSAGE = 'Something went wrong on the server. Please try again.';

/** An error the pipeline answers as is: its message is a sentence fit to show a person. */
export class ApiError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    status?: number,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status ?? HTTP_STATUS[code];
  }
}

export class ValidationError extends ApiError {
  constructor(field: string, message: string, status?: number) {
    super('validation', message, status, field);
    this.name = 'ValidationError';
  }
}

/** "Parcel BATCH-2026-099 was not found." (the prototype `need()` sentence). */
export class NotFoundError extends ApiError {
  constructor(entity: string, code: string) {
    super('not_found', `${entity} ${code} was not found.`);
    this.name = 'NotFoundError';
  }
}

export class UnauthenticatedError extends ApiError {
  constructor() {
    super('unauthenticated', 'Sign in to continue.');
    this.name = 'UnauthenticatedError';
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'You are not allowed to do this.') {
    super('forbidden', message);
    this.name = 'ForbiddenError';
  }
}

export class RateLimitedError extends ApiError {
  constructor() {
    super('rate_limited', 'Too many requests. Please wait a minute and try again.');
    this.name = 'RateLimitedError';
  }
}

/** Sign-in and reset requests over the per-phone or per-device limit (EP-04-S9). */
export class AuthRateLimitedError extends ApiError {
  constructor() {
    super('rate_limited', AUTH_MESSAGES.rateLimited);
    this.name = 'AuthRateLimitedError';
  }
}

/** How a versioned entity is named in a sentence. */
const NOUNS: Record<string, string> = {
  Piece: 'piece',
  Parcel: 'parcel',
  Lead: 'lead',
  LeadItem: 'lead item',
  KarigarJob: 'job',
  PieceEdit: 'edit',
  MetalPool: 'metal pool',
  User: 'user',
  Customer: 'customer',
};

const nounOf = (entity: string): string => NOUNS[entity] ?? 'record';

export interface ErrorResponse {
  status: number;
  body: ApiErrorBody;
}

export type ErrorLog = (message: string, err: unknown) => void;

/** Sentences for the body-parser error types a client can cause; any other 4xx type gets BODY_UNREADABLE. */
const BODY_MESSAGES: Record<string, string> = {
  'entity.too.large': 'The request is too large.',
  'entity.parse.failed': 'The request body is not valid JSON.',
  'charset.unsupported': 'The request body must be JSON in UTF-8.',
  'encoding.unsupported': 'The request body uses a content encoding the server does not accept.',
};
const BODY_UNREADABLE = 'The request body could not be read.';

/**
 * A body-parser (express.json) error carries a string `type` and an HTTP `status`. Every one with
 * a 4xx status is the caller's mistake: answer `validation` on field `body` with that status
 * (400, 413, 415, ...) and do not log it. Anything else is not a body error.
 */
function bodyParserError(err: unknown): ErrorResponse | undefined {
  if (err === null || typeof err !== 'object') return undefined;
  const { type, status } = err as { type?: unknown; status?: unknown };
  if (typeof type !== 'string' || typeof status !== 'number' || status < 400 || status > 499) return undefined;
  return { status, body: { code: 'validation', message: BODY_MESSAGES[type] ?? BODY_UNREADABLE, field: 'body' } };
}

/** Map any thrown value to the status and body sent to the caller; unexpected errors go to `log`. */
export function toErrorResponse(err: unknown, log: ErrorLog): ErrorResponse {
  if (err instanceof ApiError) {
    const body: ApiErrorBody = { code: err.code, message: err.message };
    if (err.code === 'validation' && err.field !== undefined) body.field = err.field;
    return { status: err.status, body };
  }
  if (err instanceof DomainError) {
    return { status: HTTP_STATUS.rule_refused, body: { code: 'rule_refused', message: err.message } };
  }
  if (err instanceof StaleWriteError) {
    return {
      status: HTTP_STATUS.conflict,
      body: { code: 'conflict', message: `Someone else changed this ${nounOf(err.entity)}. Reload and try again.` },
    };
  }
  if (err instanceof RowNotFoundError) {
    return {
      status: HTTP_STATUS.not_found,
      body: { code: 'not_found', message: `This ${nounOf(err.entity)} was not found.` },
    };
  }
  const bodyError = bodyParserError(err);
  if (bodyError) return bodyError;
  log('[api] unexpected error', err);
  return { status: HTTP_STATUS.internal, body: { code: 'internal', message: INTERNAL_MESSAGE } };
}
