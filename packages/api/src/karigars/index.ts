/**
 * The karigar operations (EP-16). The four writes are owner only, by the central permission check.
 * `assertKarigarActive` and `readAllowanceInForce` are for the job and parcel operations of later epics.
 */
import type { contract } from '@goldsmith/shared';
import type { Handlers } from '../pipeline/registry.js';
import type { UserHandlerDeps } from '../users/index.js';
import { onboardKarigar } from './onboard-karigar.js';
import { updateKarigarDetails } from './update-karigar-details.js';
import { updateKarigarStatus } from './update-karigar-status.js';
import { updateKarigarWastage } from './update-karigar-wastage.js';

export { assertKarigarActive, readAllowanceInForce } from './active-check.js';

export function createKarigarHandlers(_deps: UserHandlerDeps): Handlers<typeof contract> {
  return { onboardKarigar, updateKarigarDetails, updateKarigarWastage, updateKarigarStatus };
}
