/**
 * Reusable field schemas for the operation contract. Each gives the type and the runtime check
 * from one declaration.
 */
import { z } from 'zod';
import { gramsToUnits } from '../domain/weights.js';

/**
 * A weight sent as a decimal string of grams ("12.3456"). The handler receives integer units of
 * 0.0001 g. More than four decimals, stray characters or a JSON number are refused, never rounded.
 */
export const weightG = z.string().transform((text, ctx) => {
  const parsed = gramsToUnits(text);
  if (!parsed.ok) {
    ctx.addIssue({ code: 'custom', message: parsed.error });
    return z.NEVER;
  }
  return parsed.units;
});

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
