/**
 * Record of a restore drill (EP-38-S8 AC2 and AC3). `recordDrill` checks the entry (date,
 * environment, restore point, duration, a pass or fail for each of the eight drill steps, who ran
 * it), works out whether the duration is within the target (default 60 minutes, provisional until
 * the owner decides; the story leaves the number open) and appends one markdown table row to
 * `docs/setup/restore-drills.md`. A missing file is created with its header. The path is
 * injectable so tests write to a temporary file.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The eight steps of docs/setup/restore-drill.md, in order. */
export const DRILL_STEPS = [
  'Pick the restore point',
  'Get approval',
  'Restore the database',
  'Restore the files',
  'Check file references',
  'Check the audit log',
  'Reconnect clients',
  'Tell staff and karigars',
] as const;
export const DEFAULT_DRILL_TARGET_MINUTES = 60;
/** Works from src/ops (tsx) and dist/ops (built): the repository root is four folders up. */
export const DEFAULT_DRILLS_PATH = fileURLToPath(new URL('../../../../docs/setup/restore-drills.md', import.meta.url));
export const DRILLS_HEADER = [
  '# Restore drills',
  '',
  'One row per restore drill, added by `npm run drill:record` after the drill in [restore-drill.md](restore-drill.md). Read a row left to right: the day, the environment, the restore point used, how long the drill took in minutes, whether that is within the target (60 minutes until the owner decides the number, so every default-target row says provisional), which of the eight steps passed, who ran it and any notes. Do not edit rows by hand.',
  '',
  '| Date | Environment | Restore point | Duration (min) | Against target | Steps | Run by | Notes |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  '',
].join('\n');

export type DrillStepResult = 'pass' | 'fail';
export interface DrillEntry {
  /** Calendar day, `YYYY-MM-DD`. */
  date: string;
  environment: string;
  /** The backup id or time the drill restored to. */
  restorePoint: string;
  durationMinutes: number;
  /** Result of each step, keyed by step number 1 to 8. */
  steps: Partial<Record<number, string>>;
  runBy: string;
  notes?: string;
  /** Defaults to 60 and is then marked provisional. */
  targetMinutes?: number;
}
export interface DrillRecorded {
  row: string;
  withinTarget: boolean;
  provisional: boolean;
  path: string;
}

export class DrillRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DrillRecordError';
  }
}

const cell = (text: string): string => text.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();

function requireText(value: string | undefined, label: string): string {
  const text = value?.trim() ?? '';
  if (text === '') throw new DrillRecordError(`${label} is required`);
  return text;
}

function validateDate(value: string | undefined): string {
  const date = requireText(value, 'Date');
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : undefined;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new DrillRecordError(`Date "${date}" must be a real calendar day written YYYY-MM-DD`);
  }
  return date;
}

function validateMinutes(value: number | undefined, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new DrillRecordError(`${label} must be a number of minutes above 0`);
  }
  return value;
}

function validateSteps(steps: DrillEntry['steps']): DrillStepResult[] {
  for (const key of Object.keys(steps)) {
    if (!/^[1-8]$/.test(key)) throw new DrillRecordError(`Step "${key}" is not one of the steps 1 to ${DRILL_STEPS.length}`);
  }
  return DRILL_STEPS.map((name, i) => {
    const result = steps[i + 1];
    if (result === undefined) throw new DrillRecordError(`Step ${i + 1} (${name}) has no result; mark it pass or fail`);
    if (result !== 'pass' && result !== 'fail') {
      throw new DrillRecordError(`Step ${i + 1} (${name}) must be pass or fail, not "${result}"`);
    }
    return result;
  });
}

/** "8 of 8 pass", or "pass 1,2,3; fail 4,5" naming the step numbers. */
function summariseSteps(results: DrillStepResult[]): string {
  const numbers = (wanted: DrillStepResult): string =>
    results.flatMap((r, i) => (r === wanted ? [i + 1] : [])).join(',');
  if (results.every((r) => r === 'pass')) return `${results.length} of ${results.length} pass`;
  return [numbers('pass') && `pass ${numbers('pass')}`, `fail ${numbers('fail')}`].filter(Boolean).join('; ');
}

export function recordDrill(entry: DrillEntry, options: { path?: string } = {}): DrillRecorded {
  const path = options.path ?? DEFAULT_DRILLS_PATH;
  const date = validateDate(entry.date);
  const environment = requireText(entry.environment, 'Environment');
  const restorePoint = requireText(entry.restorePoint, 'Restore point');
  const runBy = requireText(entry.runBy, 'Run by');
  const duration = validateMinutes(entry.durationMinutes, 'Duration');
  const provisional = entry.targetMinutes === undefined;
  const target = provisional ? DEFAULT_DRILL_TARGET_MINUTES : validateMinutes(entry.targetMinutes, 'Target');
  const results = validateSteps(entry.steps);
  const withinTarget = duration <= target;
  const against = `${withinTarget ? 'within' : 'over'} ${target} min${provisional ? ' (provisional)' : ''}`;
  const row = `| ${[
    date,
    cell(environment),
    cell(restorePoint),
    String(Number(duration.toFixed(2))),
    against,
    summariseSteps(results),
    cell(runBy),
    cell(entry.notes ?? '') || '-',
  ].join(' | ')} |`;
  let text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (text.trim() === '') text = DRILLS_HEADER;
  if (!text.endsWith('\n')) text += '\n';
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${text}${row}\n`);
  return { row, withinTarget, provisional, path };
}
