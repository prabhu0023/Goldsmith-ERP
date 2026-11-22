#!/usr/bin/env node
// Fails when a web source file outside the allow-list imports the bundled images
// (packages/web/src/assets/images/) or packages/web/src/data/images.ts (EP-09-S13 AC4, EP-01-S9):
// screens get photos from stored files through signed links, never from the bundle.
//
// The allow-list is the prototype that still uses them; EP-08-S19 removes those imports, and the
// criterion is fully met once the list is empty.
//
// Self check (manual): add packages/web/src/components/Probe.tsx containing
//   import x from '../assets/images/x.jpg';
// then `node scripts/check-bundled-images.mjs` exits 1 naming that file; delete it again.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const web = join(root, 'packages/web');
const src = join(web, 'src');
const IMAGES_DIR = join(src, 'assets/images');
const IMAGES_MODULE = join(src, 'data/images');

const ALLOWED = new Set([
  'packages/web/src/data/seed.ts', // prototype, removed by EP-08-S19
  'packages/web/src/data/images.ts', // prototype, removed by EP-08-S19
  'packages/web/src/components/parcels/TagItem.tsx', // prototype, removed by EP-08-S19
  'packages/web/src/components/leads/OrderCopyBuilder.tsx', // prototype, removed by EP-08-S19
]);

const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage']);
// import … from '…', export … from '…', import '…', import('…')
const SPECIFIER = /(?:\b(?:import|export)\b[^'"`;]*?\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g;

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : files(join(dir, e.name));
    return SOURCE.test(e.name) ? [join(dir, e.name)] : [];
  });
}

/** The absolute path a specifier points at, or null for a package import. */
function target(file, spec) {
  if (spec.startsWith('.')) return resolve(dirname(file), spec);
  if (spec.startsWith('@/')) return resolve(web, spec.slice(2));
  return null;
}

const bundled = (path) =>
  path === IMAGES_DIR ||
  path.startsWith(IMAGES_DIR + sep) ||
  path.replace(/\.(ts|tsx|js)$/, '') === IMAGES_MODULE;

const offenders = [];
for (const file of files(src)) {
  const name = relative(root, file).split(sep).join('/');
  if (ALLOWED.has(name)) continue;
  for (const m of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
    const path = target(file, m[1]);
    if (path && bundled(path)) offenders.push(`${name} imports ${m[1]}`);
  }
}

if (offenders.length > 0) {
  for (const o of offenders) {
    console.error(`bundled image import outside the seed: ${o} (use a stored file and readFileLinks instead)`);
  }
  process.exit(1);
}
console.log(`bundled image check: ok (${ALLOWED.size} prototype files allowed until EP-08-S19)`);
