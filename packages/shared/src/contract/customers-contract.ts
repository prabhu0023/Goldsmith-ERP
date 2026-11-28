/**
 * The customer operations (EP-17). Spread into `contract`, so they go through
 * `POST /api/ops/:operation` and the central permission check like every other operation.
 * `customerId` is the customer code ("CU-009"). Birthdays and anniversaries cross the contract as
 * a day and a month; the handler checks the pair and that the date exists, so the person gets the
 * exact sentence (CUSTOMER_MESSAGES). Create and update refuse any field they do not name
 * (`optedIn`, `status`, `budgetINR`, `spentINR`, `id`).
 */
import { z } from 'zod';
import { CUSTOMER_GROUPS, STAFF_CONSENT_SOURCES } from '../domain/customer-rules.js';
import { createdResult, okResult, pageInput, pageResult } from './contract-fields.js';
import { defineOperation } from './define-operation.js';
import { ERROR_CODES } from './error-codes.js';

const customerId = z.string().trim().min(1);
const version = z.number().int().min(1);
const group = z.enum(CUSTOMER_GROUPS);
const consentSource = z.enum(STAFF_CONSENT_SOURCES);
/** A birthday or anniversary as typed: both parts, or neither (the handler checks). */
const dayMonthInput = z.object({ day: z.number().int().optional(), month: z.number().int().optional() });
const dayMonthResult = z.object({ day: z.number().int(), month: z.number().int() });
/** The fields staff type; the same for add and edit. A text field left out is stored as empty. */
const customerFields = {
  name: z.string(),
  phone: z.string(),
  city: z.string().nullish(),
  address: z.string().nullish(),
  group,
  dob: dayMonthInput.nullish(),
  anniversary: dayMonthInput.nullish(),
  notes: z.string().nullish(),
};
/** Grams as a four-decimal string, built from integer units. */
const grams = z.string();

export const customerOperations = {
  createCustomer: defineOperation({
    name: 'createCustomer',
    kind: 'create',
    input: z.object({ ...customerFields, optInSource: consentSource.optional() }).strict(),
    result: createdResult,
    errors: ERROR_CODES,
  }),
  updateCustomer: defineOperation({
    name: 'updateCustomer',
    kind: 'command',
    input: z.object({ customerId, version, ...customerFields }).strict(),
    result: okResult,
    errors: ERROR_CODES,
  }),
  listCustomers: defineOperation({
    name: 'listCustomers',
    kind: 'list',
    input: z.object({ ...pageInput, search: z.string().optional(), group: group.optional() }),
    result: pageResult(
      z.object({
        id: z.string(),
        name: z.string(),
        phone: z.string(),
        city: z.string().nullable(),
        group,
        optedIn: z.boolean(),
        pieceCount: z.number().int(),
        takenHomeG: grams,
      }),
    ),
    errors: ERROR_CODES,
  }),
  readCustomer: defineOperation({
    name: 'readCustomer',
    kind: 'read',
    input: z.object({ customerId }),
    result: z.object({
      ok: z.literal(true),
      customer: z.object({
        id: z.string(),
        name: z.string(),
        phone: z.string(),
        city: z.string().nullable(),
        address: z.string().nullable(),
        group,
        dob: dayMonthResult.nullable(),
        anniversary: dayMonthResult.nullable(),
        notes: z.string().nullable(),
        optedIn: z.boolean(),
        /** Newest first. `recordedBy` is the staff member's name, null for System. */
        consent: z.array(
          z.object({
            kind: z.enum(['opt_in', 'opt_out']),
            source: z.enum(['counter', 'whatsapp_reply', 'form', 'import']),
            at: z.string(),
            atLocal: z.string(),
            recordedBy: z.string().nullable(),
          }),
        ),
        /** Newest first, then by tag. */
        history: z.array(
          z.object({
            tag: z.string().nullable(),
            name: z.string().nullable(),
            pureG: z.string().nullable(),
            on: z.string().nullable(),
          }),
        ),
        pieceCount: z.number().int(),
        takenHomeG: grams,
        version: z.number().int(),
        /** Sockets for EP-42: always null while pricing is off. */
        budgetINR: z.null(),
        spentINR: z.null(),
      }),
    }),
    errors: ERROR_CODES,
  }),
  findCustomerByPhone: defineOperation({
    name: 'findCustomerByPhone',
    kind: 'read',
    input: z.object({ phone: z.string() }),
    result: z.object({
      ok: z.literal(true),
      customer: z
        .object({ id: z.string(), name: z.string(), city: z.string().nullable(), group })
        .nullable(),
    }),
    errors: ERROR_CODES,
  }),
  recordConsent: defineOperation({
    name: 'recordConsent',
    kind: 'command',
    input: z.object({ customerId, kind: z.enum(['opt_in', 'opt_out']), source: consentSource }),
    result: z.object({ ok: z.literal(true), optedIn: z.boolean(), recorded: z.boolean() }),
    errors: ERROR_CODES,
  }),
  eraseCustomer: defineOperation({
    name: 'eraseCustomer',
    kind: 'command',
    input: z.object({
      customerId,
      version,
      /** Empty is refused by the handler with its own sentence. */
      deletionRequestRef: z.string().trim().max(64),
      reason: z.string().trim().max(200),
    }),
    result: okResult,
    errors: ERROR_CODES,
  }),
} as const;
