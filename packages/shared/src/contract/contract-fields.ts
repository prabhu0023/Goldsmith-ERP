/**
 * Reusable field schemas for the operation contract. Each gives the type and the runtime check
 * from one declaration.
 */
import { z } from 'zod';
import { gramsToUnits } from '../domain/weights.js';

/** Parse a gram string to units; `allowNegative` decides whether a leading "-" is accepted. */
function gramsField(allowNegative: boolean) {
  return z.string().transform((text, ctx) => {
    const parsed = gramsToUnits(text);
    if (!parsed.ok) {
      ctx.addIssue({ code: 'custom', message: parsed.error });
      return z.NEVER;
    }
    if (!allowNegative && parsed.units < 0) {
      ctx.addIssue({ code: 'custom', message: 'Weight cannot be negative' });
      return z.NEVER;
    }
    return parsed.units;
  });
}

/**
 * A weight sent as a decimal string of grams ("12.3456"). The handler receives integer units of
 * 0.0001 g. Zero is allowed; a negative value, more than four decimals, stray characters or a
 * JSON number are refused, never rounded. Every gross, stone or net weight uses this.
 */
export const weightG = gramsField(false);

/**
 * A signed weight ("-0.0400" -> -400 units) for a field that is a difference, never a stock
 * figure: a ledger delta or a gap between two weighings. Otherwise the same rules as `weightG`.
 * Only fields whose key ends in `DeltaG` or `GapG` may use it (the contract tests enforce this).
 */
export const signedWeightG = gramsField(true);

/** Money socket: nullable rupees. No EP-03 operation uses it. */
export const moneyINR = z.number().nullable();

/** Result of a command that changes something and returns nothing else. */
export const okResult = z.object({ ok: z.literal(true) });

/** Result of a create: the new record's id. */
export const createdResult = z.object({ ok: z.literal(true), id: z.string() });

/** Paging fields for list operations. */
export const pageInput = {
  cursor: z.string().optional(),
  pageSize: z.number().int().min(1).optional(),
};

/** One page of a list result. `nextCursor` is null on the last page. */
export function pageResult<T extends z.ZodType>(item: T) {
  return z.object({
    ok: z.literal(true),
    items: z.array(item),
    nextCursor: z.string().nullable(),
    pageSize: z.number().int(),
  });
}
