/**
 * The karigar operations (EP-16). The writes, the directory and the scorecard are owner only; the picker is staff and owner; the profile is the karigar's own. All by the central permission check.
 * `assertKarigarActive` and `readAllowanceInForce` are for the job and parcel operations of later epics.
 */
import type { contract } from '@goldsmith/shared';
import type { Handlers } from '../pipeline/registry.js';
import type { UserHandlerDeps } from '../users/index.js';
import { createLinkKarigarAccount } from './link-karigar-account.js';
import { listKarigarPicker } from './list-karigar-picker.js';
import { listKarigars } from './list-karigars.js';
import { onboardKarigar } from './onboard-karigar.js';
import { readKarigarScorecard } from './read-karigar-scorecard.js';
import { readMyKarigarProfile } from './read-my-karigar-profile.js';
import { updateKarigarDetails } from './update-karigar-details.js';
import { updateKarigarStatus } from './update-karigar-status.js';
import { updateKarigarWastage } from './update-karigar-wastage.js';

export { assertKarigarActive, readAllowanceInForce } from './active-check.js';

export function createKarigarHandlers(deps: UserHandlerDeps): Handlers<typeof contract> {
  return {
    onboardKarigar,
    updateKarigarDetails,
    updateKarigarWastage,
    updateKarigarStatus,
    linkKarigarAccount: createLinkKarigarAccount(deps),
    listKarigars,
    listKarigarPicker,
    readKarigarScorecard,
    readMyKarigarProfile,
  };
}
