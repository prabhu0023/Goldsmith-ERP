#!/usr/bin/env node
// The migration report for the in-memory prototype store (EP-08-S17 AC3, S18 AC1).
//
// Lists every web source file that imports store/StoreProvider, store/selectors, store/transitions
// or data/seed (the way useStore() and the demo data are reached), prints how many of the screens
// still do, and fails only when a file outside the allow-list does. The allow-list is the screens
// not yet wired to the server, the store and the demo data themselves, and the prototype seam. The
// shell, auth, query, shell/, components/ui and the screens already moved are not on it, so moving
// a screen back to useStore() fails the lint. Delete a path from the list when its screen is wired.
//
// Usage: node scripts/check-store-usage.mjs [repo root]. The root defaults to this repo;
// packages/api/test/scripts/check-store-usage.test.ts runs it against a temp tree.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
const web = join(root, 'packages/web');
const src = join(web, 'src');
const STORE_MODULES = ['store/StoreProvider', 'store/selectors', 'store/transitions', 'data/seed'].map((m) => join(src, m));
const SRC = 'packages/web/src/';
// Whole folders (a trailing slash) and single files.
const ALLOWED = [
  'store/',
  'data/',
  'prototype/', // the seam: index.ts and the parts it hosts
  'components/shell/PhoneFrame.tsx',
  // Screens not yet wired to the server; each leaves this list with the epic that wires it.
  'components/home/OwnerDecisions.tsx',
  'components/home/StaffToday.tsx',
  'components/home/util.ts',
  'components/karigar/KarigarPhone.tsx',
  'components/leads/ConvertLead.tsx',
  'components/leads/LeadCreate.tsx',
  'components/leads/LeadInbox.tsx',
  'components/leads/LeadReview.tsx',
  'components/leads/OrderCopyBuilder.tsx',
  'components/marketing/Broadcast.tsx',
  'components/marketing/CatalogueShare.tsx',
  'components/marketing/Wishes.tsx',
  'components/parcels/OwnerClearMismatch.tsx',
  'components/parcels/ParcelArrival.tsx',
  'components/parcels/ParcelMatch.tsx',
  'components/parcels/ParcelsList.tsx',
  'components/parcels/QcCheck.tsx',
  'components/parcels/ScaleAndWeights.tsx',
  'components/parcels/TagItem.tsx',
  'components/parcels/util.ts',
  'components/people/Karigars.tsx',
  'components/people/OnboardKarigar.tsx',
  'components/problems/ProblemBanner.tsx',
  'components/problems/RaiseProblem.tsx',
  'components/settings/ScalesRules.tsx',
  'components/stock/EditApply.tsx',
  'components/stock/EditPropose.tsx',
  'components/stock/MetalPool.tsx',
  'components/stock/PieceDrawer.tsx',
  'components/stock/ScrapDecision.tsx',
  'components/stock/ShowroomStock.tsx',
  'components/stock/StockOut.tsx',
];
const allowed = (rel) => ALLOWED.some((a) => (a.endsWith('/') ? rel.startsWith(a) : rel === a));
const SCRIPT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const TEST = /\.test\.(ts|tsx)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage']);
// import … from '…', export … from '…', import '…', import('…')
const SPECIFIER = /(?:\b(?:import|export)\b[^'"`;]*?\bfrom\s*|\bimport\s*\(?\s*)['"`]([^'"`]+)['"`]/g;
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : files(join(dir, e.name));
    return SCRIPT.test(e.name) && !TEST.test(e.name) ? [join(dir, e.name)] : [];
  });
}
function target(file, spec) {
  const path = spec.split('?')[0];
  if (path.startsWith('.')) return resolve(dirname(file), path);
  if (path.startsWith('@/')) return resolve(web, path.slice(2));
  if (path.startsWith('/src/')) return resolve(web, path.slice(1));
  return null;
}
const usesStore = (file, text) =>
  [...text.matchAll(SPECIFIER)].some((m) => {
    const path = target(file, m[1]);
    return path !== null && STORE_MODULES.includes(path.replace(/\.(ts|tsx|js)$/, ''));
  });
const all = files(src);
const users = [];
for (const file of all) {
  if (usesStore(file, readFileSync(file, 'utf8'))) users.push(relative(src, file).split(sep).join('/'));
}
// A screen is a component outside the shared library and the shell frame.
const isScreen = (rel) => rel.startsWith('components/') && rel.endsWith('.tsx') && !rel.startsWith('components/ui/') && !rel.startsWith('components/shell/');
const screens = all.map((f) => relative(src, f).split(sep).join('/')).filter(isScreen);
const stillStore = users.filter(isScreen);
console.log(`${stillStore.length} of ${screens.length} screens still use useStore():`);
for (const rel of stillStore) console.log(`  ${rel}`);
const offenders = users.filter((rel) => !allowed(rel));
if (offenders.length > 0) {
  for (const rel of offenders) {
    console.error(`${SRC}${rel} imports the prototype store or seed data (read it from the server through the data layer instead)`);
  }
  process.exit(1);
}
