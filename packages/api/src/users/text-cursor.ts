/**
 * Keyset cursors for lists sorted by a text column, then id (a name or a code). Same encoding
 * as the timestamp cursor in pipeline/paging.ts: base64url JSON `[text, id]` of the last row
 * the caller received.
 */
import { z } from 'zod';
import { ValidationError } from '../pipeline/api-errors.js';
import { encodeCursor, INVALID_CURSOR_MESSAGE } from '../pipeline/paging.js';

type TextCursorKey = [text: string, id: string];

const textCursorSchema = z.tuple([z.string(), z.uuid()]);

export function encodeTextCursor(key: TextCursorKey): string {
  return encodeCursor(key);
}

export function decodeTextCursor(text: string): TextCursorKey {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(text, 'base64url').toString('utf8'));
  } catch {
    throw new ValidationError('cursor', INVALID_CURSOR_MESSAGE);
  }
  const parsed = textCursorSchema.safeParse(value);
  if (!parsed.success) throw new ValidationError('cursor', INVALID_CURSOR_MESSAGE);
  return parsed.data;
}
