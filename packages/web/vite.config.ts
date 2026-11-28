import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defaultClientConditions, defaultServerConditions, defineConfig} from 'vite';

// The root .env (git-ignored) may set WEB_PORT or LANE; variables already set win. No .env is fine.
try {
  process.loadEnvFile(path.resolve(import.meta.dirname, '../../.env'));
} catch {
  // No .env: defaults below.
}

/**
 * Dev server port: WEB_PORT, else 3000 + n in lane n (LANE=a → 3001, b → 3002), else 3000.
 * Same lane rule as the api (packages/api/src/lane.ts, docs/setup/parallel-lanes.md).
 */
function webPort(env: NodeJS.ProcessEnv): number {
  const set = env.WEB_PORT?.trim();
  if (set) {
    const port = Number(set);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('WEB_PORT must be an integer between 1 and 65535');
    }
    return port;
  }
  const lane = env.LANE?.trim();
  if (!lane) return 3000;
  if (!/^[a-z]$/.test(lane)) throw new Error('LANE must be one lower-case letter, a to z');
  return 3000 + lane.charCodeAt(0) - 'a'.charCodeAt(0) + 1;
}
/** The api port the dev proxy targets: API_PORT, else 4000 + n in lane n, else 4000 (same rule as webPort). */
function apiPort(env: NodeJS.ProcessEnv): number {
  const set = env.API_PORT?.trim();
  if (set) {
    const port = Number(set);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('API_PORT must be an integer between 1 and 65535');
    }
    return port;
  }
  const lane = env.LANE?.trim();
  if (!lane) return 4000;
  if (!/^[a-z]$/.test(lane)) throw new Error('LANE must be one lower-case letter, a to z');
  return 4000 + lane.charCodeAt(0) - 'a'.charCodeAt(0) + 1;
}

export default defineConfig(({ command, mode }) => {
  // The production build swaps the prototype seam for its empty twin (EP-08-S19, decision D-D).
  const production = command === 'build' && mode === 'production';
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
        '@prototype': path.resolve(import.meta.dirname, production ? 'src/prototype/index.production.ts' : 'src/prototype/index.ts'),
      },
      // Resolve @goldsmith/shared to its TypeScript source, so edits in shared reload the app
      // without a separate shared build.
      conditions: ['@goldsmith/source', ...defaultClientConditions],
    },
    // Vitest runs the web tests in node (SSR resolution): resolve shared to source there too.
    ssr: { resolve: { conditions: ['@goldsmith/source', ...defaultServerConditions] } },
    server: {
      port: webPort(process.env),
      // Web and api share one origin through this proxy, so the session cookie needs no CORS.
      proxy: { '/api': { target: `http://localhost:${apiPort(process.env)}` } },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
