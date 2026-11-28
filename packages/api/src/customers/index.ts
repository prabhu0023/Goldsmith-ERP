/**
 * The customer operations (EP-17). Staff and owner may add, edit, list, read, match and record
 * consent; only the owner erases (the central permission check, which also refuses a karigar
 * before any validation). `recordConsentEvent` and `findCustomerByPhone` are the server functions
 * EP-12, EP-28 and EP-29 call.
 */
import type { contract } from '@goldsmith/shared';
import type { Handlers } from '../pipeline/registry.js';
import { createCustomer } from './create-customer.js';
import { eraseCustomer } from './erase-customer.js';
import { findCustomerByPhoneHandler } from './find-customer-by-phone.js';
import { listCustomers } from './list-customers.js';
import { readCustomer } from './read-customer.js';
import { recordConsent } from './record-consent.js';
import { updateCustomer } from './update-customer.js';

export { findCustomerByPhone } from './customer-store.js';
export { recordConsentEvent } from './record-consent.js';

export const customerHandlers: Handlers<typeof contract> = {
  createCustomer,
  updateCustomer,
  listCustomers,
  readCustomer,
  findCustomerByPhone: findCustomerByPhoneHandler,
  recordConsent,
  eraseCustomer,
};
