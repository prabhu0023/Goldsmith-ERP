/**
 * Loads the web prototype's seed (packages/web/src/data/seed.ts) unchanged. That file imports
 * .jpg assets, which Node cannot load, so it is bundled with esbuild first; each image import
 * becomes its file name, which is the storage key the database keeps.
 */
import { randomBytes } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { AppState } from '@goldsmith/shared';
import { build, type Plugin } from 'esbuild';

/** Same depth from src/db/seed and dist/db/seed. */
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const SEED_ENTRY = 'packages/web/src/data/seed.ts';

const imagesAsFileNames: Plugin = {
  name: 'images-as-file-names',
  setup(b) {
    b.onResolve({ filter: /\.jpg$/ }, (args) => ({ path: basename(args.path), namespace: 'asset' }));
    b.onLoad({ filter: /.*/, namespace: 'asset' }, (args) => ({
      contents: `export default ${JSON.stringify(args.path)};`,
      loader: 'js',
    }));
  },
};

export async function loadPrototypeState(): Promise<AppState> {
  const result = await build({
    entryPoints: [SEED_ENTRY],
    absWorkingDir: REPO_ROOT,
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    conditions: ['@goldsmith/source'],
    logLevel: 'error',
    plugins: [imagesAsFileNames],
  });
  const file = join(tmpdir(), `goldsmith-seed-${randomBytes(6).toString('hex')}.mjs`);
  await writeFile(file, result.outputFiles[0].contents);
  try {
    const mod = (await import(pathToFileURL(file).href)) as { initialState(): AppState };
    return mod.initialState();
  } finally {
    await rm(file, { force: true });
  }
}
