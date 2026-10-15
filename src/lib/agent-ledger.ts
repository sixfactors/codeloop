/**
 * What each agent may still spend today, and whether it can run at all.
 *
 * The ledger (`.codeloop/state/agent-ledger.json`) counts starts per agent per day. Every start goes
 * through `startAgent`, which refuses once `agents.<name>.max_runs_per_day` (default 10) is reached,
 * naming the count. The status file (`.codeloop/state/agent-status.json`) marks an agent unavailable
 * after it exits twice in a row within 10 seconds with nothing handed back (not logged in, binary
 * missing): no loop starts it again until a person runs `codeloop agent clear <name>`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { RefusalError } from './cards.js';
import { loadConfig } from './config.js';
import { withLock } from './lock.js';

export const LEDGER_PATH = '.codeloop/state/agent-ledger.json';
export const AGENT_STATUS_PATH = '.codeloop/state/agent-status.json';
/** A run shorter than this that handed nothing back counts toward unavailable: `orch.quick_exit_seconds`, default 10. */
export const QUICK_EXIT_MS = 10_000;
export function quickExitMs(projectDir: string): number {
  const orch = (loadConfig(projectDir) as { orch?: { quick_exit_seconds?: unknown } }).orch;
  const v = orch && typeof orch === 'object' ? orch.quick_exit_seconds : undefined;
  return typeof v === 'number' && v >= 0 ? v * 1000 : QUICK_EXIT_MS;
}
const QUICK_EXITS_TO_UNAVAILABLE = 2;

type Ledger = Record<string, Record<string, number>>;
export interface AgentStatus {
  quickExits: number;
  unavailable?: { at: string; reason: string };
}

/** Thrown for a start the agent's state forbids: unavailable, or out of starts today. Neither costs a story a retry. */
export class AgentRefusal extends RefusalError {
  constructor(message: string, readonly kind: 'unavailable' | 'ledger') {
    super(message);
  }
}

const day = (now: Date) => now.toISOString().slice(0, 10);

function readJson<T>(file: string, empty: T): T {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf-8')) as T) : empty;
  } catch {
    return empty;
  }
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function startsToday(projectDir: string, agent: string, now: Date = new Date()): number {
  return readJson<Ledger>(join(projectDir, LEDGER_PATH), {})[day(now)]?.[agent] ?? 0;
}

/** Every agent's starts today, for `codeloop stats`. */
export function todaysStarts(projectDir: string, now: Date = new Date()): Record<string, number> {
  return readJson<Ledger>(join(projectDir, LEDGER_PATH), {})[day(now)] ?? {};
}

export function agentStatus(projectDir: string, agent: string): AgentStatus {
  return readJson<Record<string, AgentStatus>>(join(projectDir, AGENT_STATUS_PATH), {})[agent] ?? { quickExits: 0 };
}

export const isUnavailable = (projectDir: string, agent: string) => Boolean(agentStatus(projectDir, agent).unavailable);

/**
 * Records one start, or refuses it: an unavailable agent, or one at its daily cap. The read, the
 * check and the write are one locked step, so two loops cannot both take the last start.
 */
export function startAgent(projectDir: string, agent: string, maxPerDay: number, now: Date = new Date()): number {
  const status = agentStatus(projectDir, agent);
  if (status.unavailable) throw new AgentRefusal(`agent ${agent} is marked unavailable since ${status.unavailable.at} (${status.unavailable.reason}); fix it, then run \`codeloop agent clear ${agent}\``, 'unavailable');
  const file = join(projectDir, LEDGER_PATH);
  return withLock(file, () => {
    const ledger = readJson<Ledger>(file, {});
    const today = day(now);
    const used = ledger[today]?.[agent] ?? 0;
    if (used >= maxPerDay) throw new AgentRefusal(`agent ${agent} has started ${used} times today (max_runs_per_day is ${maxPerDay})`, 'ledger');
    // Only today is kept: the file stays small and yesterday's count never leaks into today's.
    writeJson(file, { [today]: { ...(ledger[today] ?? {}), [agent]: used + 1 } });
    return used + 1;
  });
}

/**
 * Notes how a run ended. A quick exit with nothing handed back counts; a second in a row marks the
 * agent unavailable. Any other run resets the count. Returns true when this run marked it.
 */
export function noteAgentRun(projectDir: string, agent: string, run: { durationMs: number; handedBack: boolean; exit: number | null }, now: Date = new Date()): boolean {
  const file = join(projectDir, AGENT_STATUS_PATH);
  return withLock(file, () => {
    const all = readJson<Record<string, AgentStatus>>(file, {});
    const before = all[agent] ?? { quickExits: 0 };
    const quick = run.durationMs < quickExitMs(projectDir) && !run.handedBack;
    const quickExits = quick ? before.quickExits + 1 : 0;
    const marks = quickExits >= QUICK_EXITS_TO_UNAVAILABLE && !before.unavailable;
    all[agent] = { quickExits, ...(before.unavailable ? { unavailable: before.unavailable } : {}), ...(marks ? { unavailable: { at: now.toISOString(), reason: `exited ${run.exit ?? 'without a code'} within ${quickExitMs(projectDir) / 1000} s with nothing handed back, ${quickExits} times in a row` } } : {}) };
    writeJson(file, all);
    return marks;
  });
}

/** `codeloop agent clear <name>`: a person says the agent can run again. */
export function clearAgent(projectDir: string, agent: string): boolean {
  const file = join(projectDir, AGENT_STATUS_PATH);
  return withLock(file, () => {
    const all = readJson<Record<string, AgentStatus>>(file, {});
    const was = Boolean(all[agent]?.unavailable);
    all[agent] = { quickExits: 0 };
    writeJson(file, all);
    return was;
  });
}
