/**
 * Public surface of @goldsmith/shared: pure domain rules and types, no React, no I/O.
 * web uses these for instant feedback; api uses the same code as the authority.
 */
export * from './contract/auth-contract.js';
export * from './contract/contract.js';
export * from './contract/contract-fields.js';
export * from './contract/define-operation.js';
export * from './contract/error-codes.js';
export * from './domain/clock.js';
export * from './domain/domain-error.js';
export * from './domain/edits.js';
export * from './domain/job-timers.js';
export * from './domain/leads.js';
export * from './domain/match.js';
export * from './domain/shop-time.js';
export * from './domain/sign-in-rules.js';
export * from './domain/weights.js';
export * from './types/jewellery.js';
