import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defaultClientConditions, defineConfig} from 'vite';
export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
      // Resolve @goldsmith/shared to its TypeScript source, so edits in shared reload the app
      // without a separate shared build.
      conditions: ['@goldsmith/source', ...defaultClientConditions],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
