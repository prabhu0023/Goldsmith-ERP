/** Data-access layer: connection pool, transactions, shop-scoped inserts and versioned updates. */
export { type NextCodeOptions, nextCode } from './codes.js';
export { createPool } from './connection.js';
export { insertScoped, LOCATION_TABLES, loadShopContext, type ShopContext } from './shop-context.js';
export { withTransaction } from './transaction.js';
export {
  RowNotFoundError,
  StaleWriteError,
  updateVersioned,
  VERSIONED_ENTITIES,
  type VersionedTable,
  type VersionedUpdate,
} from './versioned.js';
