/**
 * Find Customer by phone (EP-17-S10): the one active customer who holds the phone, or none.
 * A phone with fewer than 10 digits is none, not an error. Read only; returns id, name, city and
 * group and nothing else.
 */
import type { contract } from '@goldsmith/shared';
import type { Handler } from '../pipeline/registry.js';
import { findCustomerByPhone } from './customer-store.js';

export const findCustomerByPhoneHandler: Handler<typeof contract.findCustomerByPhone> = async (tx, ctx, input) => ({
  ok: true,
  customer: await findCustomerByPhone(tx.client, ctx.shop, input.phone),
});
