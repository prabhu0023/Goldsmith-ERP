/**
 * The global setup drops schema public of the database TEST_DATABASE_URL names. This guard
 * refuses any database whose name does not end in `_test`, so a copied dev or staging URL
 * cannot be wiped by `npm test`.
 */
export function assertWipeableTestDatabase(url: string): string {
  let name: string;
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch {
    throw new Error('TEST_DATABASE_URL is not a valid connection URL; refusing to wipe it');
  }
  if (!name.endsWith('_test')) {
    throw new Error(
      `TEST_DATABASE_URL names database "${name}", which does not end in _test; the database tests wipe it, so they refuse to run`,
    );
  }
  return name;
}
