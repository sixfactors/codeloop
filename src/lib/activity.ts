/**
 * One activity stream per card: `.codeloop/state/activity/<card>.jsonl`, one JSON line per thing
 * that happened while the card was worked. The guard hooks write what an interactive session does
 * (edits, commands, prompts), runs.ts writes a headless run's log, advanceCard writes each check,
 * the post-commit hook writes commits, and writeCards mirrors the engine's gate, answer and park
 * events. The board reads it through services.cardActivity, never from the file.
 */
import { closeSync, existsSync, mkdirSync, openSync, readSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { loadConfig } from './config.js';

export const ACTIVITY_DIR = '.codeloop/state/activity';

/** Engine events copied into the stream; `fail` is left out because the check line already says it. */
export const MIRRORED_EVENTS = new Set(['park', 'approve', 'auto-approve', 'reject', 'answer', 'stuck', 'unstick', 'advance', 'promote', 'unpark', 'place', 'returned', 'rollback', 'agent-start', 'agent-run', 'close', 'drop']);

export type ActivityKind = 'start' | 'prompt' | 'stop' | 'end' | 'edit' | 'cmd' | 'log' | 'check' | 'commit' | string;

export interface ActivityLine {
  at: string;
  session?: string;
  kind: ActivityKind;
  [field: string]: unknown;
}

/** A line as read back: `cursor` is the byte offset just past it, the `after` for the next read. */
export type ActivityEntry = ActivityLine & { cursor: string };

const CMD_CHARS = 80;
const TEXT_CHARS = 500;
const OUTPUT_CHARS = 2000;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const safeCard = (id: string) => id.replace(/[^A-Za-z0-9._-]/g, '_');
const activityFile = (projectDir: string, card: string) => join(projectDir, ACTIVITY_DIR, `${safeCard(card)}.jsonl`);

/** On unless config.yaml says `activity: off` (YAML reads a bare `off` as false). */
export function activityEnabled(projectDir: string): boolean {
  try {
    const value = (loadConfig(projectDir) as { activity?: unknown }).activity;
    return !(value === false || value === 'off');
  } catch {
    return true;
  }
}

export const commandHead = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, CMD_CHARS);
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

/**
 * Appends one line to the card's stream. Never throws: a hook that cannot write its activity line
 * must still let the edit or command it guards go ahead.
 */
export function appendActivity(projectDir: string, card: string | undefined, line: Omit<ActivityLine, 'at'> & { at?: string }): void {
  if (!card || !activityEnabled(projectDir)) return;
  try {
    const out: ActivityLine = { at: line.at ?? new Date().toISOString(), ...line } as ActivityLine;
    if (typeof out.text === 'string') out.text = out.kind === 'cmd' || out.kind === 'prompt' ? commandHead(out.text) : clip(out.text, TEXT_CHARS);
    if (typeof out.output === 'string') out.output = clip(out.output, OUTPUT_CHARS);
    if (out.session === undefined) delete out.session;
    mkdirSync(join(projectDir, ACTIVITY_DIR), { recursive: true });
    writeFileSync(activityFile(projectDir, card), `${JSON.stringify(out)}\n`, { flag: 'a' });
  } catch {
    // see above
  }
}

function readFrom(file: string, offset: number): { text: string; size: number } {
  const size = existsSync(file) ? statSync(file).size : 0;
  if (size <= offset) return { text: '', size };
  const fd = openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(size - offset);
    readSync(fd, buffer, 0, buffer.length, offset);
    return { text: buffer.toString('utf-8'), size };
  } finally {
    closeSync(fd);
  }
}

/** Splits complete lines starting at byte `offset`; a partial last line (a write in progress) is left for the next read. */
function parseLines(text: string, offset: number): { entries: ActivityEntry[]; end: number } {
  const out: ActivityEntry[] = [];
  let at = offset;
  let start = 0;
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', start)) {
    const raw = text.slice(start, i);
    at += Buffer.byteLength(raw, 'utf-8') + 1;
    start = i + 1;
    try {
      out.push({ ...(JSON.parse(raw) as ActivityLine), cursor: String(at) });
    } catch {
      // a torn or hand-edited line is skipped, the cursor still moves past it
    }
  }
  return { entries: out, end: at };
}

/** The card's lines after `after` (a cursor from an earlier read; none means from the start), oldest first. */
export function readActivity(projectDir: string, card: string, opts: { after?: string; limit?: number } = {}): { items: ActivityEntry[]; next?: string } {
  const offset = Math.max(0, Number.parseInt(opts.after ?? '0', 10) || 0);
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const all = parseLines(readFrom(activityFile(projectDir, card), offset).text, offset).entries;
  const items = all.slice(0, limit);
  return { items, ...(all.length > limit ? { next: items[items.length - 1].cursor } : {}) };
}

/** When the story's last activity line was written, as epoch ms; undefined when it has none. The file's mtime, not a read. */
export function lastActivityAt(projectDir: string, card: string): number | undefined {
  try {
    return statSync(activityFile(projectDir, card)).mtimeMs;
  } catch {
    return undefined;
  }
}
