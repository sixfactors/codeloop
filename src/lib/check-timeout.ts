import { loadConfig } from './config.js';

export const DEFAULT_CHECK_TIMEOUT_MINUTES = 10;

/**
 * `checks.timeout_minutes`: how long any command codeloop runs for the project (stage check,
 * hand-back proof, use case, lint, post-merge step) may take before it is killed. A value that
 * is not a positive number falls back to the default, never to "no limit". `floorMinutes` keeps
 * commands that always had a longer limit (setup, post-merge) from getting shorter.
 */
export function checkTimeoutMs(projectDir: string, floorMinutes = 0): number {
  const checks = (loadConfig(projectDir) as { checks?: unknown }).checks;
  const raw = checks && typeof checks === 'object' ? (checks as { timeout_minutes?: unknown }).timeout_minutes : undefined;
  const minutes = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CHECK_TIMEOUT_MINUTES;
  return Math.max(minutes, floorMinutes) * 60_000;
}

/** True when `spawnSync` killed the child at its `timeout`. */
export const wasKilledForTime = (run: { error?: Error }): boolean => (run.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT';

/** The sentence a killed command reports, naming the limit and the setting that changes it. */
export const timedOutNote = (ms: number): string => `timed out after ${+(ms / 60_000).toFixed(2)} min (the limit; raise checks.timeout_minutes in .codeloop/config.yaml)`;
