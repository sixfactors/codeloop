/**
 * What codeloop processes hold in memory, and the ceiling on it. Six agent sessions, a hub, hook
 * calls and test runs once added up to 20 GB of node processes; `limits.max_memory_mb` stops new
 * builders from starting while the total is over it.
 */
import { spawnSync } from 'child_process';
import { RefusalError } from './cards.js';
import { loadConfig } from './config.js';

export const DEFAULT_CEILING_MB = 2048;

export interface CodeloopProcess {
  pid: number;
  mb: number;
  kind: 'hookd' | 'hub' | 'cli';
  command: string;
}

const kindOf = (command: string): CodeloopProcess['kind'] => (/hookd/.test(command) ? 'hookd' : /\b(hub|serve)\b/.test(command) ? 'hub' : 'cli');

/**
 * A node (or the shim itself) with codeloop's entry anywhere in its argv. The bin shim starts
 * `node --max-old-space-size=N <pkg>/dist/index.js ...`, so the entry is not the first argument;
 * a global install is reached through a `.../bin/codeloop` symlink whose path need not contain "codeloop" earlier.
 */
export function isCodeloopCommand(command: string): boolean {
  const [first = '', ...rest] = command.split(' ');
  if (!/(^|\/)(node|nodejs|codeloop|codeloop-hook)$/.test(first)) return false;
  return [first, ...rest].some(t => /\/bin\/codeloop(-hook)?$/.test(t) || (/codeloop/.test(t) && /\/dist\/(index|hookd-main)\.js$/.test(t)));
}

/** Every running process that is the codeloop CLI or its daemon, with resident size in MB. */
export function codeloopProcesses(): CodeloopProcess[] {
  const ps = spawnSync('ps', ['-axo', 'pid=,rss=,command='], { encoding: 'utf-8' });
  if (ps.status !== 0) return [];
  const rows: CodeloopProcess[] = [];
  for (const line of ps.stdout.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const command = m[3];
    if (isCodeloopCommand(command)) rows.push({ pid: Number(m[1]), mb: Math.round((Number(m[2]) / 1024) * 10) / 10, kind: kindOf(command), command });
  }
  return rows.sort((a, b) => b.mb - a.mb);
}

export const totalMb = (rows: CodeloopProcess[] = codeloopProcesses()): number => Math.round(rows.reduce((n, r) => n + r.mb, 0));

export function memoryCeilingMb(projectDir: string): number {
  const limits = loadConfig(projectDir).limits as { max_memory_mb?: unknown } | undefined;
  const n = Number(limits?.max_memory_mb);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CEILING_MB;
}

export interface MemoryProbe {
  /** Current total in MB; replaced in tests. */
  total?: () => number;
  sleep?: (ms: number) => Promise<void>;
  pollMs?: number;
  timeoutMs?: number;
}

export const overCeiling = (projectDir: string, probe: MemoryProbe = {}): { over: boolean; total: number; ceiling: number } => {
  const total = (probe.total ?? (() => totalMb()))();
  const ceiling = memoryCeilingMb(projectDir);
  return { over: total > ceiling, total, ceiling };
};

/**
 * Returns once the total is at or under the ceiling. Past `timeoutMs` (default 10 minutes) it
 * refuses instead of waiting forever, naming the numbers, so an unattended run ends with a reason.
 */
export async function waitUnderCeiling(projectDir: string, probe: MemoryProbe = {}): Promise<{ waitedMs: number }> {
  const sleep = probe.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const pollMs = probe.pollMs ?? 15_000;
  const timeoutMs = probe.timeoutMs ?? 10 * 60_000;
  let waited = 0;
  for (;;) {
    const { over, total, ceiling } = overCeiling(projectDir, probe);
    if (!over) return { waitedMs: waited };
    if (waited >= timeoutMs) {
      throw new RefusalError(`codeloop processes hold ${total} MB, over limits.max_memory_mb ${ceiling}; waited ${Math.round(waited / 60_000)} min. \`codeloop ps\` lists them`);
    }
    await sleep(pollMs);
    waited += pollMs;
  }
}
