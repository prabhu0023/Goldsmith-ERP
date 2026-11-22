/**
 * The user operations (EP-05-S4 to S13). Owner only, by the central permission check; each
 * write locks the shop row first (see user-store.ts). createUser and resendActivation mail an
 * activation link, so they need the account mailer.
 */
import type { contract } from '@goldsmith/shared';
import type { AccountMailer } from '../auth/account-mail.js';
import type { ErrorLog } from '../pipeline/api-errors.js';
import type { Handlers } from '../pipeline/registry.js';
import { createUserHandler } from './create-user.js';
import { deactivateUser } from './deactivate-user.js';
import { linkKarigar } from './link-karigar.js';
import { listUsers } from './list-users.js';
import { reactivateUser } from './reactivate-user.js';
import { resendActivationHandler } from './resend-activation.js';
import { unlockUser } from './unlock-user.js';
import { updateUserProfile } from './update-user-profile.js';
import { updateUserRole } from './update-user-role.js';

export interface UserHandlerDeps {
  mailer: AccountMailer;
  /** Base of the activation link. */
  appUrl: string;
  /** Where a failed send is logged. */
  log?: ErrorLog;
}

export function createUserHandlers(deps: UserHandlerDeps): Handlers<typeof contract> {
  return {
    createUser: createUserHandler(deps),
    resendActivation: resendActivationHandler(deps),
    updateUserProfile,
    updateUserRole,
    deactivateUser,
    reactivateUser,
    unlockUser,
    linkKarigar,
    listUsers,
  };
}
