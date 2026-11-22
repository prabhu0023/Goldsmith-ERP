/**
 * The publish boundary (EP-07-S1 AC5), checked in CI by the Test job. Publishing is internal: a
 * service function records an event with emitLiveEvent (an outbox row in its transaction) and
 * never reaches the live channel itself. The scan fails, naming `file:line <function>`, when
 *   (a) a file outside src/live/ imports the hub, the publisher or the transport, or
 *   (b) a file other than the two outbox writers inserts into outbox_events.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const API_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const LIVE_INTERNALS = /(?:^|\/)live\/(hub|publisher|ws-transport)(?:\.js)?$/;
const OUTBOX_WRITERS = new Set(['src/jobs/outbox.ts', 'src/live/emit-live-event.ts']);
const OUTBOX_INSERT = /\binto\s+outbox_events\b/i;
const IMPORT = /^\s*import\s+(?:type\s+)?(.*?)\s+from\s+['"]([^'"]+)['"]/;
const FUNCTION_HEADS = [
  /\bfunction\s*\*?\s*([A-Za-z_$][\w$]*)/,
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=/,
  /^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*:\s*(?:async\b|\()/,
  /^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{]*)?\{\s*$/,
];
const NOT_FUNCTIONS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return']);

/** The name of the nearest function head at or above `index`, or `<module>`. */
function enclosingFunction(lines: string[], index: number): string {
  for (let i = index; i >= 0; i -= 1) {
    for (const head of FUNCTION_HEADS) {
      const name = lines[i].match(head)?.[1];
      if (name && !NOT_FUNCTIONS.has(name)) return name;
    }
  }
  return '<module>';
}

/** The local names an import line binds (`{ a, b as c }`, `* as x`, `x`). */
function importedNames(clause: string): string[] {
  const names: string[] = [];
  const braces = clause.match(/\{([^}]*)\}/);
  if (braces) {
    for (const part of braces[1].split(',')) {
      const name = part
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)
        .pop();
      if (name) names.push(name);
    }
  }
  const star = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
  if (star) names.push(star[1]);
  const plain = clause.match(/^([A-Za-z_$][\w$]*)/);
  if (plain) names.push(plain[1]);
  return names;
}

/** Every boundary breach in one source file, as `file:line <function>: reason`. */
function scanSource(file: string, text: string): string[] {
  const lines = text.split('\n');
  const report: string[] = [];
  const at = (i: number, reason: string) => `${file}:${i + 1} ${enclosingFunction(lines, i)}: ${reason}`;
  if (!file.startsWith('src/live/')) {
    const bound: string[] = [];
    lines.forEach((line, i) => {
      const imported = line.match(IMPORT);
      if (imported && LIVE_INTERNALS.test(imported[2])) {
        report.push(at(i, `imports ${imported[2]}; record events with emitLiveEvent instead`));
        bound.push(...importedNames(imported[1]));
      }
    });
    if (bound.length > 0) {
      const use = new RegExp(`\\b(?:${bound.map((n) => n.replace(/\$/g, '\\$')).join('|')})\\b`);
      lines.forEach((line, i) => {
        if (!IMPORT.test(line) && use.test(line)) report.push(at(i, 'publishes to the live channel directly'));
      });
    }
  }
  if (!OUTBOX_WRITERS.has(file)) {
    lines.forEach((line, i) => {
      if (OUTBOX_INSERT.test(line)) report.push(at(i, 'writes outbox_events directly; use emitLiveEvent or emitOutboxEvent'));
    });
  }
  return report;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(path);
    return e.name.endsWith('.ts') ? [path] : [];
  });
}

/** Every boundary breach under packages/api/src. */
function scanTree(root = API_ROOT): string[] {
  return sourceFiles(join(root, 'src')).flatMap((path) =>
    scanSource(relative(root, path).split(sep).join('/'), readFileSync(path, 'utf8')),
  );
}

describe('live publish boundary (EP-07-S1 AC5)', () => {
  it('S1 AC5: no service function publishes directly', () => {
    expect(scanTree()).toEqual([]);
  });

  it('S1 AC5: a service function that calls the hub is reported by name', () => {
    const fixture = [
      "import type { Handler } from '../pipeline/registry.js';",
      "import { hub } from '../live/hub.js';",
      '',
      'export const billPiece: Handler<typeof contract.billPiece> = async (tx, ctx, input) => {',
      "  await tx.client.query('update pieces set status = $3 where shop_id = $1 and tag_no = $2', [ctx.shop.shopId, input.pieceId, 'billed']);",
      "  hub.deliver(ctx.shop.shopId, [{ topic: 'piece.billed', entityId: input.pieceId }]);",
      '  return { ok: true };',
      '};',
      '',
      'async function recordHandOver(client) {',
      "  await client.query(`insert into outbox_events (shop_id, topic, payload, created_at) values ($1, 'parcel.handed_over', '{}', now())`);",
      '}',
    ].join('\n');
    expect(scanSource('src/services/bill-piece.ts', fixture)).toEqual([
      "src/services/bill-piece.ts:2 <module>: imports ../live/hub.js; record events with emitLiveEvent instead",
      'src/services/bill-piece.ts:6 billPiece: publishes to the live channel directly',
      'src/services/bill-piece.ts:11 recordHandOver: writes outbox_events directly; use emitLiveEvent or emitOutboxEvent',
    ]);
  });

  it('allows the live modules themselves and the two outbox writers', () => {
    expect(scanSource('src/live/live-channel.ts', "import { createHub } from './hub.js';\ncreateHub();")).toEqual([]);
    expect(scanSource('src/jobs/outbox.ts', 'await client.query(`insert into outbox_events (shop_id) values ($1)`);')).toEqual(
      [],
    );
    expect(scanSource('src/live/emit-live-event.ts', "const sql = 'insert into outbox_events (shop_id)';")).toEqual([]);
  });
});
