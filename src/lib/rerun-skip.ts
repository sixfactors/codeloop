/**
 * A scheduled run or the doctor reruns a failed stage check only when something the check can see
 * has changed. Without this a card that failed once was rechecked every hour with identical output
 * (106 reruns per card in a week on codeloop's own board), each one a spawned process, an event and,
 * on a slow suite, minutes of CPU.
 */
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { appendActivity, readAllActivity } from './activity.js';
import { cardKey, worktreeOf, type Card } from './cards.js';
import { usecasesOf } from './paths.js';
import { progressSince } from './progress.js';

/** Events the engine writes about its own failure; they are the failure, not work after it. */
const OWN_EVENTS = new Set(['fail', 'stuck', 'check-error', 'park', 'unstick', 'split-nudge']);

function newestUnder(path: string, depth = 0): number {
  let st;
  try { st = statSync(path); } catch { return 0; }
  if (!st.isDirectory() || depth > 6) return st.mtimeMs;
  let newest = st.mtimeMs;
  for (const name of readdirSync(path)) newest = Math.max(newest, newestUnder(join(path, name), depth + 1));
  return newest;
}

/** The time of the last failed check of this stage, when no advance has happened since; otherwise undefined. */
function lastFailAt(card: Card, stage: string): number | undefined {
  const marks = (card.events ?? []).filter(e => e.action === 'fail' || e.action === 'advance' || e.action === 'unstick');
  const last = marks.at(-1);
  if (!last || last.action !== 'fail' || last.stage !== stage) return undefined;
  const at = Date.parse(last.at);
  return Number.isNaN(at) ? undefined : at;
}

/** Newest change to anything the stage check can see, after `since`; undefined when none. */
function changedAfter(projectDir: string, card: Card, since: number): number | undefined {
  let newest = progressSince(projectDir, card) ?? 0;
  const roots = [projectDir, ...[worktreeOf(projectDir, card)].filter((p): p is string => !!p && existsSync(p))];
  for (const root of roots) {
    if (card.spec) newest = Math.max(newest, newestUnder(join(root, card.spec)));
    newest = Math.max(newest, newestUnder(join(root, usecasesOf(projectDir, cardKey(card)))));
  }
  for (const e of card.events ?? []) if (!OWN_EVENTS.has(e.action)) newest = Math.max(newest, Date.parse(e.at) || 0);
  return newest > since ? newest : undefined;
}

const pad = (n: number) => String(n).padStart(2, '0');
const day = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (ms: number) => `${pad(new Date(ms).getHours())}:${pad(new Date(ms).getMinutes())}`;

/**
 * True when the check should not run again: it failed last time on this stage and nothing relevant
 * changed since. Writes one `check-skipped` activity line per card per day.
 */
export function skipUnchangedRerun(projectDir: string, card: Card, stage: string, now: Date): boolean {
  const failed = lastFailAt(card, stage);
  if (failed === undefined || changedAfter(projectDir, card, failed) !== undefined) return false;
  const today = day(now);
  const noted = readAllActivity(projectDir, card.id).some(l => l.kind === 'check-skipped' && day(new Date(l.at)) === today);
  if (!noted) appendActivity(projectDir, card.id, { at: now.toISOString(), kind: 'check-skipped', stage, text: `nothing changed since the last fail at ${hhmm(failed)}` });
  return true;
}
