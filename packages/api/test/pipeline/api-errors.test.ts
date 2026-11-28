import { DomainError, ERROR_CODES } from '@goldsmith/shared';
import { describe, expect, it, vi } from 'vitest';
import { RowNotFoundError, StaleWriteError, VERSIONED_ENTITIES } from '../../src/db/versioned.js';
import {
  ApiError,
  ForbiddenError,
  HTTP_STATUS,
  INTERNAL_MESSAGE,
  NotFoundError,
  RateLimitedError,
  toErrorResponse,
  UnauthenticatedError,
  ValidationError,
} from '../../src/pipeline/api-errors.js';
import { leaksIn } from '../support/api-harness.js';

const noLog = () => {};

describe('toErrorResponse (EP-03-S4, S5)', () => {
  it('gives every error code one HTTP status', () => {
    expect(Object.keys(HTTP_STATUS).sort()).toEqual([...ERROR_CODES].sort());
    expect(HTTP_STATUS).toEqual({
      validation: 400,
      unauthenticated: 401,
      forbidden: 403,
      not_found: 404,
      conflict: 409,
      rule_refused: 422,
      pool_insufficient: 422,
      opening_exists: 422,
      rate_limited: 429,
      internal: 500,
    });
  });

  it('turns a DomainError into rule_refused with its sentence, exactly {code, message}', () => {
    const err = new DomainError('A converted lead cannot be marked lost.');
    const r = toErrorResponse(err, noLog);
    expect(r.status).toBe(422);
    expect(r.body).toEqual({ code: 'rule_refused', message: 'A converted lead cannot be marked lost.' });
    expect(Object.keys(r.body)).toEqual(['code', 'message']);
    expect(leaksIn(r.body)).toEqual([]);
  });

  it('hides an unexpected error behind a generic sentence and logs the original', () => {
    const log = vi.fn();
    const err = new Error('relation "pieces" does not exist at /Users/x/secret/path.ts:12');
    const r = toErrorResponse(err, log);
    expect(r).toEqual({ status: 500, body: { code: 'internal', message: INTERNAL_MESSAGE } });
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][1]).toBe(err);
    expect(leaksIn(r.body)).toEqual([]);
  });

  it('logs nothing for errors meant for the caller', () => {
    const log = vi.fn();
    toErrorResponse(new DomainError('No.'), log);
    toErrorResponse(new NotFoundError('Parcel', 'BATCH-2026-099'), log);
    expect(log).not.toHaveBeenCalled();
  });

  it('maps a stale write to conflict with the entity named in words', () => {
    const r = toErrorResponse(new StaleWriteError('Piece', 'uuid-1', 3), noLog);
    expect(r).toEqual({
      status: 409,
      body: { code: 'conflict', message: 'Someone else changed this piece. Reload and try again.' },
    });
    for (const entity of Object.values(VERSIONED_ENTITIES)) {
      const msg = toErrorResponse(new StaleWriteError(entity, 'x', 1), noLog).body.message;
      expect(msg).toMatch(/^Someone else changed this [a-z ]+\. Reload and try again\.$/);
    }
    expect(toErrorResponse(new StaleWriteError('KarigarJob', 'x', 1), noLog).body.message).toContain('this job.');
  });

  it('maps a missing row to not_found without the internal id (FU-002)', () => {
    const r = toErrorResponse(new RowNotFoundError('Lead', '8e0c5d2c-0000-4000-8000-000000000000'), noLog);
    expect(r).toEqual({ status: 404, body: { code: 'not_found', message: 'This lead was not found.' } });
  });

  it('answers each ApiError with its code, sentence and status; field only for validation', () => {
    const cases: Array<[ApiError, number, string]> = [
      [new ValidationError('customerName', 'customerName is required.'), 400, 'customerName is required.'],
      [new NotFoundError('Parcel', 'BATCH-2026-099'), 404, 'Parcel BATCH-2026-099 was not found.'],
      [new UnauthenticatedError(), 401, 'Sign in to continue.'],
      [new ForbiddenError(), 403, 'You are not allowed to do this.'],
      [new RateLimitedError(), 429, 'Too many requests. Please wait a minute and try again.'],
    ];
    for (const [err, status, message] of cases) {
      const r = toErrorResponse(err, noLog);
      expect(r.status).toBe(status);
      expect(r.body.message).toBe(message);
      expect(r.body.code).toBe(err.code);
      if (err.code === 'validation') expect(r.body.field).toBe('customerName');
      else expect(r.body).not.toHaveProperty('field');
    }
    expect(toErrorResponse(new ApiError('not_found', 'x', undefined, 'ignored'), noLog).body).toEqual({
      code: 'not_found',
      message: 'x',
    });
  });

  it('refuses an oversized or malformed body as validation on field body', () => {
    expect(toErrorResponse(Object.assign(new Error('too big'), { type: 'entity.too.large', status: 413 }), noLog)).toEqual({
      status: 413,
      body: { code: 'validation', message: 'The request is too large.', field: 'body' },
    });
    expect(
      toErrorResponse(Object.assign(new SyntaxError('Unexpected token'), { type: 'entity.parse.failed', status: 400 }), noLog),
    ).toEqual({
      status: 400,
      body: { code: 'validation', message: 'The request body is not valid JSON.', field: 'body' },
    });
  });
  it.each([
    ['charset.unsupported', 415, 'The request body must be JSON in UTF-8.'],
    ['encoding.unsupported', 415, 'The request body uses a content encoding the server does not accept.'],
    ['request.aborted', 400, 'The request body could not be read.'],
    ['request.size.invalid', 400, 'The request body could not be read.'],
  ])('answers the body-parser error %s (%i) as validation on field body, unlogged', (type, status, message) => {
    const log = vi.fn();
    expect(toErrorResponse(Object.assign(new Error('raw parser text'), { type, status }), log)).toEqual({
      status,
      body: { code: 'validation', message, field: 'body' },
    });
    expect(log).not.toHaveBeenCalled();
  });
  it('keeps a typed error with a 5xx status internal and logged', () => {
    const log = vi.fn();
    const r = toErrorResponse(Object.assign(new Error('stream encoding set'), { type: 'stream.encoding.set', status: 500 }), log);
    expect(r).toEqual({ status: 500, body: { code: 'internal', message: INTERNAL_MESSAGE } });
    expect(log).toHaveBeenCalledOnce();
  });
  it('treats a thrown non-Error as internal', () => {
    expect(toErrorResponse('just a string', noLog).body.code).toBe('internal');
    expect(toErrorResponse(null, noLog).body.code).toBe('internal');
  });
});
