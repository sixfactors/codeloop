/**
 * One activity stream per card: `.codeloop/state/activity/<card>.jsonl`, one JSON line per thing
 * that happened while the card was worked. The guard hooks write what an interactive session does
 * (edits, commands, prompts), runs.ts writes a headless run's log, advanceCard writes each check,
 * the post-commit hook writes commits, and writeCards mirrors the engine's gate, answer and park
 * events. The board reads it through services.cardActivity, never from the file.
 */
import { closeSync, existsSync, mkdirSync, openSync, readSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { touchSession } from './active-card.js';
import { loadConfig } from './config.js';

export const ACTIVITY_DIR = '.codeloop/state/activity';

/** Engine events copied into the stream; `fail` is left out because the check line already says it. */
export const MIRRORED_EVENTS = new Set(['park', 'approve', 'auto-approve', 'reject', 'answer', 'stuck', 'unstick', 'advance', 'promote', 'unpark', 'place', 'returned', 'rollback', 'agent-start', 'agent-run', 'close', 'drop', 'reopen', 'move', 'edit']);

export type ActivityKind = 'start' | 'prompt' | 'stop' | 'end' | 'edit' | 'story-edit' | 'cmd' | 'log' | 'check' | 'commit' | string;

export interface ActivityLine {
  at: string;
  session?: string;
  kind: ActivityKind;
  [field: string]: unknown;
}

/** A line as read back: `cursor` is the byte offset just past it, the `after` for the next read. */
export type ActivityEntry = ActivityLine & { cursor: string };

/** The hook lines that mean a session is alive: a prompt, a tool call, a file write. */
const TOUCHING = new Set(['prompt', 'cmd', 'edit']);

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
  // Before the activity switch: a hold's liveness is its session's prompts, tool calls and file
  // writes, which must keep counting when `activity: off` writes no lines.
  if (TOUCHING.has(String(line.kind))) touchSession(projectDir, typeof line.session === 'string' ? line.session : undefined);
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

/** Kinds that mean someone or something was working the story; prompts, checks, engine events and an
 * owner's `story-edit` are not. */
const WORK_KINDS = new Set(['edit', 'cmd', 'commit', 'handback', 'log']);
/** Two work lines further apart than this are two bursts; the gap between them is idle. */
export const BURST_GAP_MS = 10 * 60 * 1000;

const allCache = new Map<string, { stamp: string; lines: ActivityEntry[] }>();
const ALL_CACHE_MAX = 600;

/**
 * Every line of the card's stream, oldest first, parsed in one pass and kept until the file's
 * mtime or size changes. A board page asks for every card's stream (time in phase, progress), and
 * paging through readActivity re-parsed the rest of the file for each page. The array is shared:
 * callers read it and do not modify it.
 */
export function readAllActivity(projectDir: string, card: string): ActivityEntry[] {
  const file = activityFile(projectDir, card);
  const st = statSync(file, { throwIfNoEntry: false });
  if (!st) return [];
  const stamp = `${st.mtimeMs}:${st.size}`;
  const hit = allCache.get(file);
  if (hit?.stamp === stamp) return hit.lines;
  const lines = parseLines(readFrom(file, 0).text, 0).entries;
  if (allCache.size >= ALL_CACHE_MAX) allCache.delete(allCache.keys().next().value!);
  allCache.set(file, { stamp, lines });
  return lines;
}

/** A lone work line counts as this much: one edit is a minute of someone working, not zero. */
const MIN_BURST_MS = 60 * 1000;

/**
 * Milliseconds of work between `from` and `to`. Person work is bursts of work lines no more than ten
 * minutes apart, each at least a minute long; a headless run is its `agent-run` line, written when
 * the run ended, reaching back `durationMs`. The spans are merged before summing because the run's
 * own hooks write edit lines inside it.
 */
export function activeMs(lines: { at: string; kind: string; durationMs?: unknown }[], from: number, to: number): number {
  const spans: [number, number][] = [];
  const times = lines.filter(l => WORK_KINDS.has(l.kind)).map(l => Date.parse(l.at)).filter(t => t >= from && t <= to).sort((a, b) => a - b);
  for (let i = 0; i < times.length; ) {
    let j = i;
    while (j + 1 < times.length && times[j + 1] - times[j] <= BURST_GAP_MS) j++;
    spans.push([times[i], Math.max(times[j], times[i] + MIN_BURST_MS)]);
    i = j + 1;
  }
  for (const l of lines) {
    if (l.kind !== 'agent-run' || typeof l.durationMs !== 'number' || l.durationMs <= 0) continue;
    const end = Date.parse(l.at);
    spans.push([end - l.durationMs, end]);
  }
  let total = 0;
  let reach = from;
  for (const [s, e] of spans.map(([s, e]) => [Math.max(s, from), Math.min(e, to)] as [number, number]).filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0])) {
    const start = Math.max(s, reach);
    if (e > start) total += e - start;
    reach = Math.max(reach, e);
  }
  return total;
}

const toMinutes = (ms: number) => Math.round(ms / 60_000);

/** Time in a phase from `since` to `until`: wall, working and idle minutes. */
export function phaseTime(lines: { at: string; kind: string }[], since: string, until: number): { wallMinutes: number; activeMinutes: number; idleMinutes: number } {
  const from = Date.parse(since);
  const wall = Math.max(0, until - from);
  const active = Math.min(wall, activeMs(lines, from, until));
  return { wallMinutes: toMinutes(wall), activeMinutes: toMinutes(active), idleMinutes: toMinutes(wall - active) };
}

/** "6h 04m", "12m": minutes as a person reads a duration. */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  return h ? `${h}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`;
}
