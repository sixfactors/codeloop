import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

/**
 * The pause switch. Every hook reads this before anything else, so it uses only fs and path (no
 * board, no config, no yaml): a paused repo must answer a hook in well under a millisecond.
 */
export const OFF_FILE = '.codeloop/state/off.json';

export interface OffState {
  /** ISO time the pause ends; null while it lasts until `codeloop on`. */
  until: string | null;
  why: string;
  by: string;
  at: string;
}

const offPath = (projectDir: string): string => join(projectDir, OFF_FILE);

/**
 * The active pause, or undefined. CODELOOP_OFF=1 pauses the whole process tree with no file. A file
 * whose `until` has passed is deleted here, so the first read after expiry turns codeloop back on.
 */
export function readOff(projectDir: string, now: number = Date.now()): OffState | undefined {
  if (process.env.CODELOOP_OFF === '1') return { until: null, why: 'CODELOOP_OFF=1', by: 'environment', at: new Date(now).toISOString() };
  const file = offPath(projectDir);
  let state: OffState;
  try {
    state = JSON.parse(readFileSync(file, 'utf-8')) as OffState;
  } catch {
    return undefined;
  }
  if (state.until) {
    const end = Date.parse(state.until);
    if (Number.isNaN(end) || end <= now) {
      try { unlinkSync(file); } catch { /* another process removed it first */ }
      return undefined;
    }
  }
  return { until: state.until ?? null, why: state.why ?? '', by: state.by ?? '', at: state.at ?? '' };
}

const hhmm = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** The one sentence every refusal and the session start print. */
export function offLine(state: OffState): string {
  if (state.until) return `codeloop is off here until ${hhmm(state.until)}${state.why ? ` (${state.why})` : ''}`;
  return `codeloop is off here (indefinite${state.why ? `: ${state.why}` : ''})`;
}

/** "2h", "45m", "1h30m" in milliseconds; undefined when the text is not a duration. */
export function parseDuration(text: string): number | undefined {
  const m = /^(?:(\d+)h)?(?:(\d+)m)?$/.exec(text.trim());
  if (!m || (!m[1] && !m[2])) return undefined;
  return (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60_000;
}

export function writeOff(projectDir: string, state: OffState): void {
  const file = offPath(projectDir);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

/** True when a pause file was there to remove. */
export function clearOff(projectDir: string): boolean {
  const file = offPath(projectDir);
  if (!existsSync(file)) return false;
  unlinkSync(file);
  return true;
}
