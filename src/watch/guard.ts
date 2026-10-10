import { appendFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { getActiveCard } from '../lib/active-card.js';
import type { WatchSignal } from './signals.js';

export const WARNINGS_PATH = '.codeloop/state/warnings.jsonl';

export interface Warning {
  at: string;
  kind: string;
  message: string;
}

/**
 * Appends one JSON line to `.codeloop/state/warnings.jsonl` and prints it. `codeloop inbox`
 * reading this file as a `warnings` section, and serving it over `/api/inbox`, is not wired up
 * yet, this is the write side only.
 */
export function appendWarning(projectDir: string, warning: Omit<Warning, 'at'>): Warning {
  const file = join(projectDir, WARNINGS_PATH);
  mkdirSync(dirname(file), { recursive: true });
  const full: Warning = { at: new Date().toISOString(), ...warning };
  appendFileSync(file, `${JSON.stringify(full)}\n`);
  console.log(`  warning: ${full.message}`);
  return full;
}

/** `watch --guard`: a file changing with no active card is worth flagging, nothing else is (yet). */
export function guardSignal(projectDir: string, signal: Pick<WatchSignal, 'type'>, guard: boolean | undefined): void {
  if (!guard || signal.type !== 'file_change') return;
  if (getActiveCard(projectDir)) return;
  appendWarning(projectDir, { kind: 'no-active-card', message: 'a file changed with no active card; run `codeloop card activate <id>` or `codeloop start "<title>"`' });
}
