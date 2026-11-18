#!/usr/bin/env node
// Fails when web or api holds a file with the same name as a module in packages/shared/src,
// so a second copy of a domain rule or type cannot drift from the shared one (EP-01-S3, S4).
import { readdirSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage']);

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : files(join(dir, e.name));
    return SOURCE.test(e.name) ? [join(dir, e.name)] : [];
  });
}

const stem = (f) => basename(f, extname(f));
const sharedModules = new Set(
  files(join(root, 'packages/shared/src'))
    .map(stem)
    .filter((s) => s !== 'index'),
);

const duplicates = ['web', 'api']
  .flatMap((pkg) => files(join(root, 'packages', pkg)))
  .filter((f) => sharedModules.has(stem(f)));

if (duplicates.length > 0) {
  for (const f of duplicates) {
    console.error(`duplicate of a shared module: ${relative(root, f)} (import it from @goldsmith/shared instead)`);
  }
  process.exit(1);
}
console.log(`shared duplicate check: ok (${sharedModules.size} shared modules, no copies in web or api)`);
