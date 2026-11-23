/**
 * Every state change is audited in its own transaction (EP-06-S2 AC4). The registry wraps each
 * operation the shared OPERATION_AUDIT_KINDS marks as state-changing with `requireAudit`: the
 * handler runs inside an audit scope on its transaction client, and when it returns without
 * appending an entry (and without saying `auditNoChange`), or appended a kind it did not declare,
 * the wrapper throws. The pipeline then rolls the transaction back, answers `internal` and logs
 * the error, whose message names the operation.
 */
import type { Tx } from '../pipeline/operation-transaction.js';
import type { OperationCtx } from '../pipeline/registry.js';
import { closeAuditScope, openAuditScope } from './audit-writer.js';

type Queryable = Tx['client'];
type Run = (tx: Tx, ctx: OperationCtx, input: unknown) => Promise<unknown>;

const unchanged = new WeakSet<Queryable>();

/** Start recording the entries one operation appends on `client`. */
export function beginAuditScope(client: Queryable): void {
  unchanged.delete(client);
  openAuditScope(client);
}

/**
 * Say the operation found nothing to change (e.g. a setting set to the value it already has),
 * so it may return without an entry. It must not have written anything.
 */
export function auditNoChange(client: Queryable): void {
  unchanged.add(client);
}

/** `run`, refusing to return when it changed state without an entry of one of `kinds`. */
export function requireAudit(name: string, kinds: readonly string[], run: Run): Run {
  return async (tx, ctx, input) => {
    beginAuditScope(tx.client);
    let result: unknown;
    let written: ReturnType<typeof closeAuditScope>;
    let noChange: boolean;
    try {
      result = await run(tx, ctx, input);
    } finally {
      written = closeAuditScope(tx.client);
      noChange = unchanged.has(tx.client);
      unchanged.delete(tx.client);
    }
    const undeclared = written.find((entry) => !kinds.includes(entry.kind));
    if (undeclared) throw new Error(`Operation ${name} wrote audit kind ${undeclared.kind}, which it does not declare`);
    if (written.length === 0 && !noChange) throw new Error(`Operation ${name} changed state without an audit entry`);
    return result;
  };
}
