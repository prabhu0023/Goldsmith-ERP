/**
 * The central server-side permission check (EP-05-S2). The operation router runs it for every
 * operation right after it requires a session, before input validation and before the
 * transaction. The rules are the shared permission list; an operation without a rule is refused.
 */
import { refusalFor, roleMay } from '@goldsmith/shared';
import { ForbiddenError } from '../pipeline/api-errors.js';
import type { PermissionCheck } from '../pipeline/hooks.js';

export const matrixPermissionCheck: PermissionCheck = (operation, actor) => {
  if (!roleMay(actor.role, operation)) throw new ForbiddenError(refusalFor(operation));
};
