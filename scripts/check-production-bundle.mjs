#!/usr/bin/env node
// Fails when the production web bundle carries prototype code or demo data (EP-08-S19 AC1, AC2):
// the identity switch, the pricing switch, the demo clock, or seed data. Run after `vite build`.
//
// It reads every .js file under packages/web/dist and looks for:
//   - names that survive only in an unminified bundle: switchIdentity, demoNow, "Dev · pricing"
//   - the demo base date, new Date(2026, 10, 1, 11, 6, …), matched with any spacing
//   - the display name of the prototype store context, goldsmith:prototype-store (set in
//     store/StoreProvider.tsx as a string so it survives minification)
//   - three strings that occur only in packages/web/src/data/seed.ts
// A missing or empty dist is a failure, so a skipped build cannot pass.
//
// Usage: node scripts/check-production-bundle.mjs [repo root]. The root defaults to this repo;
// packages/api/test/scripts/check-production-bundle.test.ts runs it against a temp dist.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
const dist = join(root, 'packages/web/dist');
const MARKERS = [
  { label: 'switchIdentity (the identity switch)', test: (text) => text.includes('switchIdentity') },
  { label: 'demoNow (the demo clock)', test: (text) => text.includes('demoNow') },
  { label: '"Dev · pricing" (the pricing switch)', test: (text) => text.includes('Dev · pricing') },
  { label: 'the demo base date new Date(2026, 10, 1, 11, 6)', test: (text) => /2026,\s*10,\s*1,\s*11,\s*6/.test(text) },
  { label: 'goldsmith:prototype-store (the prototype store)', test: (text) => text.includes('goldsmith:prototype-store') },
  { label: '"Sri Murugan Jewellers" (seed customer)', test: (text) => text.includes('Sri Murugan Jewellers') },
  { label: '"Dr Fathima Beevi" (seed customer)', test: (text) => text.includes('Dr Fathima Beevi') },
  { label: '"Temple Nakshi Haram" (seed piece)', test: (text) => text.includes('Temple Nakshi Haram') },
];
function scripts(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return scripts(join(dir, e.name));
    return e.name.endsWith('.js') ? [join(dir, e.name)] : [];
  });
}
const found = existsSync(dist) ? scripts(dist) : [];
if (found.length === 0) {
  console.error(`production bundle check: no .js files under ${relative(root, dist) || dist}; run \`npm run build -w @goldsmith/web\` first`);
  process.exit(1);
}
const hits = [];
for (const file of found) {
  const text = readFileSync(file, 'utf8');
  for (const marker of MARKERS) {
    if (marker.test(text)) hits.push(`${relative(root, file)} contains ${marker.label}`);
  }
}
console.log(`production bundle check: looked for ${MARKERS.length} markers in ${found.length} file(s):`);
for (const marker of MARKERS) console.log(`  ${marker.label}`);
if (hits.length > 0) {
  for (const hit of hits) console.error(`prototype code in the production bundle: ${hit}`);
  process.exit(1);
}
console.log('production bundle check: ok');
