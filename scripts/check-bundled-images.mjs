#!/usr/bin/env node
// Fails when a web source file outside the allow-list imports the bundled images
// (packages/web/src/assets/images/) or packages/web/src/data/images.ts (EP-09-S13 AC4, EP-01-S9):
// screens get photos from stored files through signed links, never from the bundle.
//
// The allow-list is the prototype that still uses them. EP-08-S19 keeps that code out of the
// production bundle (scripts/check-production-bundle.mjs); the files themselves are deleted with
// the last unwired screen (follow-up FU-020), and the criterion is fully met once the list is empty.
//
// It finds static and dynamic imports and re-exports, Vite's import.meta.glob and
// new URL('…', import.meta.url) in scripts, and url(…) and @import in style sheets.
//
// Usage: node scripts/check-bundled-images.mjs [repo root]. The root defaults to this repo;
// packages/api/test/scripts/check-bundled-images.test.ts runs it against a temp tree.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
const web = join(root, 'packages/web');
const src = join(web, 'src');
const IMAGES_DIR = join(src, 'assets/images');
const IMAGES_MODULE = join(src, 'data/images');

const ALLOWED = new Set([
  'packages/web/src/data/seed.ts', // prototype, deleted with the last unwired screen (FU-020)
  'packages/web/src/data/images.ts', // prototype, deleted with the last unwired screen (FU-020)
  'packages/web/src/components/parcels/TagItem.tsx', // prototype, deleted with the last unwired screen (FU-020)
  'packages/web/src/components/leads/OrderCopyBuilder.tsx', // prototype, deleted with the last unwired screen (FU-020)
]);

const SCRIPT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const STYLE = /\.(css|scss|sass|less)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage']);
// import … from '…', export … from '…', import '…', import('…')
const SPECIFIER = /(?:\b(?:import|export)\b[^'"`;]*?\bfrom\s*|\bimport\s*\(?\s*)['"`]([^'"`]+)['"`]/g;
// new URL('…', import.meta.url)
const ASSET_URL = /\bnew\s+URL\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*import\.meta\.url/g;
// import.meta.glob('…') or import.meta.glob(['…', '…']): every quoted pattern of the first argument
const GLOB_CALL = /\bimport\.meta\.glob\s*\(\s*(\[[^\]]*\]|['"`][^'"`]*['"`])/g;
const QUOTED = /['"`]([^'"`]+)['"`]/g;
// url(…) and @import '…' in a style sheet
const STYLE_REF = /\burl\(\s*['"]?([^'")\s]+)['"]?\s*\)|@import\s+['"]([^'"]+)['"]/g;
const GLOB_CHAR = /[*?{}[\]]/;

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : files(join(dir, e.name));
    return SCRIPT.test(e.name) || STYLE.test(e.name) ? [join(dir, e.name)] : [];
  });
}

/** The absolute path a specifier points at (query dropped), or null for a package import. */
function target(file, spec) {
  const path = spec.split('?')[0];
  if (path.startsWith('.')) return resolve(dirname(file), path);
  if (path.startsWith('@/')) return resolve(web, path.slice(2));
  if (path.startsWith('/src/')) return resolve(web, path.slice(1));
  return null;
}

const inside = (path, dir) => path === dir || path.startsWith(dir + sep);

const bundled = (path) => path !== null && (inside(path, IMAGES_DIR) || path.replace(/\.(ts|tsx|js)$/, '') === IMAGES_MODULE);

/** A glob reaches the images when its fixed leading folder holds them or lies inside them. */
function globBundles(file, pattern) {
  if (pattern.startsWith('!')) return false;
  const at = pattern.search(GLOB_CHAR);
  if (at < 0) return bundled(target(file, pattern));
  const base = target(file, pattern.slice(0, pattern.lastIndexOf('/', at) + 1) || './');
  if (base === null) return false;
  return inside(IMAGES_DIR, base) || inside(base, IMAGES_DIR) || inside(IMAGES_MODULE, base);
}

/** The specifiers in one file that reach the bundled images. */
function offendingSpecs(file, text) {
  if (STYLE.test(file)) {
    return [...text.matchAll(STYLE_REF)].map((m) => m[1] ?? m[2]).filter((spec) => bundled(target(file, spec)));
  }
  const plain = [...text.matchAll(SPECIFIER), ...text.matchAll(ASSET_URL)]
    .map((m) => m[1])
    .filter((spec) => bundled(target(file, spec)));
  const globs = [...text.matchAll(GLOB_CALL)]
    .flatMap((m) => [...m[1].matchAll(QUOTED)].map((q) => q[1]))
    .filter((pattern) => globBundles(file, pattern));
  return [...plain, ...globs];
}

const offenders = [];
for (const file of files(src)) {
  const name = relative(root, file).split(sep).join('/');
  if (ALLOWED.has(name)) continue;
  for (const spec of offendingSpecs(file, readFileSync(file, 'utf8'))) offenders.push(`${name} imports ${spec}`);
}

if (offenders.length > 0) {
  for (const o of offenders) {
    console.error(`bundled image import outside the seed: ${o} (use a stored file and readFileLinks instead)`);
  }
  process.exit(1);
}
console.log(`bundled image check: ok (${ALLOWED.size} prototype files allowed until FU-020)`);
