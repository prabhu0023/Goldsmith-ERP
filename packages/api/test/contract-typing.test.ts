import type { OperationArgs, OperationInput, OperationResult } from '@goldsmith/shared';
import { describe, expect, it } from 'vitest';

describe('contract types (EP-03-S1 AC1, AC2)', () => {
  it('types markLeadLost input, handler args and result from the one declaration', () => {
    const input: OperationInput<'markLeadLost'> = { leadId: 'LD-2026-213', reason: 'Customer went elsewhere.' };
    const args: OperationArgs<'markLeadLost'> = { leadId: 'LD-2026-213' };
    const result: OperationResult<'markLeadLost'> = { ok: true };
    // @ts-expect-error a renamed field (id instead of leadId) does not compile
    const renamed: OperationInput<'markLeadLost'> = { id: 'x' };
    expect([input.leadId, args.leadId, result.ok, renamed]).toEqual(['LD-2026-213', 'LD-2026-213', true, { id: 'x' }]);
  });
});
