/**
 * A builder that holds a card but has written nothing to its activity stream for a while.
 * The doctor's own "builder idle" line is left out of "last activity": counting it would make
 * the nudge reset the clock it was written because of.
 */
import { closeSync, existsSync, openSync, readSync, statSync } from 'fs';
import { join } from 'path';
import { activeSessions } from './active-card.js';
import { ACTIVITY_DIR, type ActivityLine } from './activity.js';
import { findCardOrNone, readCards } from './cards.js';
import { stallMinutes } from './config.js';

export { DEFAULT_STALL_MINUTES, stallMinutes } from './config.js';
export const NUDGE_PREFIX = 'builder idle';
const TAIL_BYTES = 16 * 1024;

export interface StalledBuilder {
  session: string;
  label: string;
  card: string;
  stage: string;
  idleMinutes: number;
  lastKind: string;
}

export interface BuilderIdle {
  stalled: boolean;
  idleMinutes: number;
  lastKind?: string;
  /** Epoch ms of the last line that is not the doctor's; undefined when the stream has none. */
  lastAt?: number;
  /** The doctor already asked for a hand-back since the last real activity. */
  nudged: boolean;
}

function tailLines(projectDir: string, card: string): ActivityLine[] {
  const file = join(projectDir, ACTIVITY_DIR, `${card.replace(/[^A-Za-z0-9._-]/g, '_')}.jsonl`);
  if (!existsSync(file)) return [];
  const size = statSync(file).size;
  const start = Math.max(0, size - TAIL_BYTES);
  const buffer = Buffer.alloc(size - start);
  const fd = openSync(file, 'r');
  try {
    readSync(fd, buffer, 0, buffer.length, start);
  } finally {
    closeSync(fd);
  }
  const rows = buffer.toString('utf-8').split('\n');
  if (start > 0) rows.shift();
  const out: ActivityLine[] = [];
  for (const raw of rows) {
    try {
      out.push(JSON.parse(raw) as ActivityLine);
    } catch {
      // torn or blank line
    }
  }
  return out;
}

/** How long a card's builder has been quiet, by the card's own activity stream. */
export function builderIdle(projectDir: string, card: string, now = Date.now(), limitMinutes = stallMinutes(projectDir)): BuilderIdle {
  const lines = tailLines(projectDir, card);
  const real = lines.filter(l => l.kind !== 'doctor');
  const last = real.at(-1);
  const lastAt = last ? Date.parse(last.at) : undefined;
  if (lastAt === undefined || Number.isNaN(lastAt)) return { stalled: false, idleMinutes: 0, nudged: false };
  const idleMinutes = Math.floor((now - lastAt) / 60_000);
  const nudged = lines.some(l => l.kind === 'doctor' && typeof l.text === 'string' && l.text.startsWith(NUDGE_PREFIX) && Date.parse(l.at) >= lastAt);
  return { stalled: idleMinutes >= limitMinutes, idleMinutes, lastKind: String(last!.kind), lastAt, nudged };
}

/** Every live session holding a card whose stream has been quiet for `monitor.stall_minutes` (default 30). */
export function stalledBuilders(projectDir: string, now = Date.now()): StalledBuilder[] {
  const limit = stallMinutes(projectDir);
  const cards = readCards(projectDir).cards;
  const out: StalledBuilder[] = [];
  // Quiet holds are the ones this report exists for, so they are read here even though every other reader skips them.
  for (const s of activeSessions(projectDir, { includeQuiet: true })) {
    if (!s.card) continue;
    const idle = builderIdle(projectDir, s.card, now, limit);
    if (!idle.stalled) continue;
    out.push({ session: s.session, label: s.label ?? s.session, card: s.card, stage: findCardOrNone(cards, s.card)?.stage ?? 'unknown', idleMinutes: idle.idleMinutes, lastKind: idle.lastKind ?? 'unknown' });
  }
  return out;
}

export function stalledLines(rows: StalledBuilder[]): string[] {
  if (!rows.length) return [];
  return ['Stalled builders (nothing written to the card for a while):', ...rows.map(r => `  ${r.card} ${r.label}: idle ${r.idleMinutes} min on ${r.stage}, last ${r.lastKind}`)];
}
