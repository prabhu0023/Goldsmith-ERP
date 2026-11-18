import { defineConfig } from 'vitest/config';

// Test against the TypeScript source of @goldsmith/shared, so tests do not need a shared build.
// The other entries are Vite's default server conditions.
const conditions = ['@goldsmith/source', 'module', 'node', 'development|production'];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: { environment: 'node' },
});
