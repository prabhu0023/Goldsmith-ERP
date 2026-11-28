#!/usr/bin/env node
// Writes the test run record (EP-40-S1 AC5, EP-40-S13 AC5): one table row per suite with the
// commit, passed, failed, skipped and duration, read from the vitest JSON reports in
// test-results/. In CI the table is appended to the job summary ($GITHUB_STEP_SUMMARY); anywhere
// else it is printed. It never fails the job: the test steps own the pass or fail.
//
// Usage: node scripts/test-run-record.mjs [results dir]. The directory defaults to test-results.
// Each test step writes its report with: --reporter=json --outputFile.json=<dir>/<suite>.json
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
const SUITES = ['shared', 'web', 'api'];
const dir = resolve(process.argv[2] ?? 'test-results');
const commit = (process.env.GITHUB_SHA ?? 'local').slice(0, 12);
function row(suite) {
  const file = join(dir, `${suite}.json`);
  if (!existsSync(file)) return `| ${commit} | ${suite} | no report | | | |`;
  let report;
  try {
    report = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return `| ${commit} | ${suite} | unreadable report | | | |`;
  }
  const end = Math.max(report.startTime, ...report.testResults.map((r) => r.endTime ?? 0));
  const seconds = ((end - report.startTime) / 1000).toFixed(1);
  const skipped = (report.numPendingTests ?? 0) + (report.numTodoTests ?? 0);
  return `| ${commit} | ${suite} | ${report.numPassedTests} | ${report.numFailedTests} | ${skipped} | ${seconds} s |`;
}
const table = [
  '### Test run record',
  '',
  '| Commit | Suite | Passed | Failed | Skipped | Duration |',
  '| --- | --- | --- | --- | --- | --- |',
  ...SUITES.map(row),
  '',
].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
else console.log(table);
