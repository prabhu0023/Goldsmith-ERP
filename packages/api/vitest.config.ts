import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Load the git-ignored root .env (TEST_DATABASE_URL) without overriding variables already set.
try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // No .env: database tests are skipped locally (CI sets TEST_DATABASE_URL itself).
}

// Test against the TypeScript source of @goldsmith/shared, so tests do not need a shared build.
// The other entries are Vite's default server conditions.
const conditions = ['@goldsmith/source', 'module', 'node', 'development|production'];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: { environment: 'node', globalSetup: ['test/db/global-setup.ts'] },
});
