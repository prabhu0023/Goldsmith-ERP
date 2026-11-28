#!/usr/bin/env node
// Fails when a test file under packages/* holds a focused test (.only, fit, fdescribe), so a
// commit cannot silently skip the rest of a suite (EP-40-S1 AC4). Vitest ignores .only only
// when CI is set, so this check covers local commits too.
//
// Usage: node scripts/check-focused-tests.mjs [repo root]. The root defaults to this repo;
// packages/api/test/scripts/check-focused-tests.test.ts runs it against a temp tree.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
const TEST_FILE = /\.test\.tsx?$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'build']);
const FOCUSED = /\.only\s*[(`]|\.only\s*\.each|(?<![\w.$])(?:fit|fdescribe)\s*[(.]/;
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : files(join(dir, e.name));
    return TEST_FILE.test(e.name) ? [join(dir, e.name)] : [];
  });
}
const packages = join(root, 'packages');
const tests = existsSync(packages) ? files(packages) : [];
const found = [];
for (const file of tests) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (FOCUSED.test(line)) found.push(`${relative(root, file)}:${i + 1}: ${line.trim()}`);
    });
}
if (found.length > 0) {
  for (const f of found) console.error(`focused test: ${f}`);
  console.error('Remove .only, fit and fdescribe before committing.');
  process.exit(1);
}
console.log(`focused test check: ok (${tests.length} test files, none focused)`);
