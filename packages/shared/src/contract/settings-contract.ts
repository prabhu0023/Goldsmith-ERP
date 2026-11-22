/**
 * Set Setting (EP-06-S8): the owner changes one shop rule. The six keys and the shape of each
 * value are declared once here; the api parses `value` with the key's schema.
 */
import { z } from 'zod';
import type { Settings } from '../types/jewellery.js';
import { okResult } from './contract-fields.js';
import { defineOperation } from './define-operation.js';
import { ERROR_CODES } from './error-codes.js';

export const SETTING_KEYS = [
  'pricingEnabled',
  'leadSlaHours',
  'requireEditToken',
  'notifyChannels',
  'lateLeadAudience',
  'autoSendWishes',
] as const satisfies readonly (keyof Settings)[];

export type SettingKey = (typeof SETTING_KEYS)[number];

/** The largest value the settings table's integer column holds. */
const MAX_INT = 2_147_483_647;

export const SETTING_VALUE_SCHEMAS = {
  pricingEnabled: z.boolean(),
  leadSlaHours: z.number().int().max(MAX_INT),
  requireEditToken: z.boolean(),
  notifyChannels: z.object({ whatsapp: z.boolean(), app: z.boolean(), email: z.boolean() }),
  lateLeadAudience: z.enum(['staff_then_owner', 'owner_only']),
  autoSendWishes: z.boolean(),
} as const satisfies { [K in SettingKey]: z.ZodType<Settings[K]> };

export const SETTING_MESSAGES = {
  leadTimerMin: 'The lead timer must be at least 1 hour.',
} as const;

export const settingsOperations = {
  setSetting: defineOperation({
    name: 'setSetting',
    kind: 'command',
    input: z.object({
      key: z.enum(SETTING_KEYS),
      value: z.unknown(),
    }),
    result: okResult,
    errors: ERROR_CODES,
  }),
} as const;
