import { describe, expect, it } from 'vitest';
import { assertWipeableTestDatabase } from './test-db-guard.js';

describe('test database guard (review finding 3)', () => {
  it('accepts a database whose name ends in _test', () => {
    expect(assertWipeableTestDatabase('postgres://u:p@localhost:5432/goldsmith_test')).toBe('goldsmith_test');
    expect(assertWipeableTestDatabase('postgres://u:p@db:5432/goldsmith_test?sslmode=disable')).toBe('goldsmith_test');
  });

  it('refuses the dev database, a staging database and a URL without a database name', () => {
    expect(() => assertWipeableTestDatabase('postgres://u:p@localhost:5432/goldsmith_dev')).toThrow(
      /"goldsmith_dev".*_test/,
    );
    expect(() => assertWipeableTestDatabase('postgres://u:p@host/goldsmith_test_staging')).toThrow(/_test/);
    expect(() => assertWipeableTestDatabase('postgres://u:p@localhost:5432')).toThrow(/_test/);
  });

  it('refuses a value that is not a URL without echoing it', () => {
    expect(() => assertWipeableTestDatabase('not a url secret-value')).toThrow(/not a valid connection URL/);
    expect(() => assertWipeableTestDatabase('not a url secret-value')).not.toThrow(/secret-value/);
  });
});
