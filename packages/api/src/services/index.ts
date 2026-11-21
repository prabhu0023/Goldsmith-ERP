/**
 * The production service functions, one per contract operation (see README.md in this folder).
 * The app registers exactly these; a name the contract does not declare stops it at startup.
 */
import type { contract } from '@goldsmith/shared';
import type { Handlers } from '../pipeline/registry.js';

export const handlers: Handlers<typeof contract> = {};
