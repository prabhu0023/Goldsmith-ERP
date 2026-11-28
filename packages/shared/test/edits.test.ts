/**
 * Edit approval token (EP-40-S4, FR-40-5): six digits, ten minutes, no real clock.
 * Test names never print a token value; a failed assertion shows the comparison only.
 */
import { describe, expect, it } from 'vitest';
import { checkToken, formatToken, makeToken, type PieceEdit, TOKEN_TTL_MS, tokenValid } from '../src/index.js';
const ISSUED_AT = 1_700_000_000_000;
const SECOND = 1000;
function edit(token: string | null, tokenIssuedAt: number | null = ISSUED_AT): PieceEdit {
  return {
    id: 'ED-1',
    pieceId: 'TAG-8841',
    field: 'grossG',
    from: 48.65,
    to: 48.66,
    reason: 'Re-weighed',
    proposedBy: 'staff',
    proposedAt: ISSUED_AT - 1000,
    status: 'agreed',
    token,
    tokenIssuedAt,
    decidedAt: null,
  } as unknown as PieceEdit;
}
describe('makeToken', () => {
  it('is always six digits for counters 0 to 5000', () => {
    for (let seq = 0; seq <= 5000; seq++) {
      const t = makeToken(seq);
      expect(/^\d{6}$/.test(t), `counter ${seq} gave a token that is not six digits`).toBe(true);
      expect(Number(t) >= 100000 && Number(t) <= 999999, `counter ${seq} is out of range`).toBe(true);
    }
  });
  it('gives the same token for the same counter and different tokens for the next counters', () => {
    expect(makeToken(7)).toBe(makeToken(7));
    expect(new Set([0, 1, 2, 3, 4].map(makeToken)).size).toBe(5);
  });
  it('formats a token as two groups of three digits', () => {
    expect(formatToken('480913')).toBe('480 913');
  });
});
describe('checkToken (ten-minute life)', () => {
  const token = makeToken(3);
  it('lives ten minutes', () => {
    expect(TOKEN_TTL_MS).toBe(10 * 60 * SECOND);
  });
  it('is ok 9 minutes 59 seconds after issue', () => {
    const now = ISSUED_AT + 9 * 60 * SECOND + 59 * SECOND;
    expect(checkToken(edit(token), token, now)).toBe('ok');
    expect(tokenValid(edit(token), token, now)).toBe(true);
  });
  it('is ok at exactly ten minutes and expired at 10 minutes 1 second', () => {
    expect(checkToken(edit(token), token, ISSUED_AT + TOKEN_TTL_MS)).toBe('ok');
    const late = ISSUED_AT + 10 * 60 * SECOND + SECOND;
    expect(checkToken(edit(token), token, late)).toBe('expired');
    expect(tokenValid(edit(token), token, late)).toBe(false);
  });
  it('reports expired before wrong when an old token is typed wrongly', () => {
    expect(checkToken(edit(token), '000000', ISSUED_AT + TOKEN_TTL_MS + SECOND)).toBe('expired');
  });
  it('is wrong for a different code', () => {
    const other = makeToken(4);
    expect(other).not.toBe(token);
    expect(checkToken(edit(token), other, ISSUED_AT + SECOND)).toBe('wrong');
    expect(tokenValid(edit(token), other, ISSUED_AT + SECOND)).toBe(false);
  });
  it('is none when no token is set', () => {
    expect(checkToken(edit(null, null), token, ISSUED_AT)).toBe('none');
    expect(checkToken(edit(token, null), token, ISSUED_AT)).toBe('none');
    expect(checkToken(edit(null, ISSUED_AT), token, ISSUED_AT)).toBe('none');
  });
  it('ignores spaces in the typed code', () => {
    const spaced = formatToken(token);
    expect(spaced).not.toBe(token);
    expect(checkToken(edit(token), spaced, ISSUED_AT + SECOND)).toBe('ok');
    expect(checkToken(edit(token), ` ${token.slice(0, 2)}  ${token.slice(2)} `, ISSUED_AT + SECOND)).toBe('ok');
  });
});
