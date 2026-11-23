/**
 * The edit token sweep (EP-10-S8). Every minute, tokens sent more than TOKEN_TTL_MS (10 minutes)
 * ago and not used are marked expired at the moment they ran out. The check at use (shared
 * checkToken) refuses an old token even before the sweep runs. The audit entry names the token
 * reference, never the token value. The SQL only touches unexpired rows, so it needs no key.
 */
import { TOKEN_TTL_MS } from '@goldsmith/shared';
import { writeJobAudit } from '../job-audit.js';
import type { JobDefinition } from '../job-definition.js';

const LABEL = 'token sweep';

export const editTokenExpiryJob: JobDefinition = {
  name: 'edit-token-expiry',
  label: LABEL,
  schedule: { kind: 'every', minutes: 1 },
  maxAttempts: 3,
  async handler(tx, ctx) {
    const { rows } = await tx.client.query<{ code: string; token_ref: string | null; expired_at: Date }>(
      `update piece_edits set expired_at = token_issued_at + $3::integer * interval '1 millisecond'
        where shop_id = $1 and status = 'token_sent' and expired_at is null and token_issued_at < $2
        returning code, token_ref, expired_at`,
      [ctx.shop.shopId, new Date(ctx.now.getTime() - TOKEN_TTL_MS), TOKEN_TTL_MS],
    );
    rows.sort((a, b) => a.code.localeCompare(b.code));
    for (const edit of rows) {
      await writeJobAudit(tx.client, ctx.shop, LABEL, {
        kind: 'edit_token_expired',
        at: ctx.now,
        summary: `Edit token for ${edit.code} expired`,
        detail: `token ref ${edit.token_ref ?? 'none'}`,
        reference: edit.code,
        tokenReference: edit.token_ref,
        before: { expiredAt: null },
        after: { expiredAt: edit.expired_at.toISOString() },
      });
    }
  },
};
