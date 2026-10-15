/**
 * No child outlives its parent. Every long-running child codeloop starts (an agent, a builder) runs
 * in its own process group and is registered here: in memory, so the group is killed when this
 * process exits or receives SIGTERM, SIGINT or SIGHUP; and on disk under `.codeloop/state/procs/`,
 * so `codeloop ps` can list what runs and `codeloop ps --kill-orphans` can kill a group whose
 * parent died without running its handlers (SIGKILL, a crash).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

export const PROCS_DIR = '.codeloop/state/procs';

export interface ProcRecord {
  pid: number;
  parent: number;
  purpose: string;
  cmd: string;
  at: string;
}

const live = new Map<number, { projectDir: string }>();
let installed = false;

function killGroup(pid: number, signal: NodeJS.Signals = 'SIGKILL'): void {
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      /* already gone */
    }
  }
}

function killAll(): void {
  for (const [pid, { projectDir }] of live) {
    killGroup(pid);
    rmSync(join(projectDir, PROCS_DIR, `${pid}.json`), { force: true });
  }
  live.clear();
}

function install(): void {
  if (installed) return;
  installed = true;
  process.on('exit', killAll);
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
    process.on(sig, () => {
      killAll();
      // The default action is gone once a handler is installed: exit as the signal would have.
      process.exit(128 + ({ SIGHUP: 1, SIGINT: 2, SIGTERM: 15 } as const)[sig]);
    });
  }
}

/** Registers a child that leads its own process group (spawned with `detached: true`, never unref'd). */
export function trackChild(projectDir: string, pid: number | undefined, purpose: string, cmd: string): () => void {
  if (!pid) return () => undefined;
  install();
  live.set(pid, { projectDir });
  const dir = join(projectDir, PROCS_DIR);
  mkdirSync(dir, { recursive: true });
  const record: ProcRecord = { pid, parent: process.pid, purpose, cmd: cmd.slice(0, 300), at: new Date().toISOString() };
  writeFileSync(join(dir, `${pid}.json`), `${JSON.stringify(record)}\n`);
  return () => {
    live.delete(pid);
    rmSync(join(dir, `${pid}.json`), { force: true });
  };
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};

export interface ProcRow extends ProcRecord {
  alive: boolean;
  orphan: boolean;
}

/** `codeloop ps`: every registered child, whether it runs, and whether its parent is gone. */
export function listProcs(projectDir: string): ProcRow[] {
  const dir = join(projectDir, PROCS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json')).flatMap(f => {
    try {
      const r = JSON.parse(readFileSync(join(dir, f), 'utf-8')) as ProcRecord;
      const running = alive(r.pid);
      return [{ ...r, alive: running, orphan: running && !alive(r.parent) }];
    } catch {
      return [];
    }
  });
}

/** Kills each orphaned group and forgets every record whose process is gone. Returns the pids killed. */
export function killOrphans(projectDir: string): number[] {
  const killed: number[] = [];
  for (const p of listProcs(projectDir)) {
    if (p.orphan) {
      killGroup(p.pid);
      killed.push(p.pid);
    }
    if (p.orphan || !p.alive) rmSync(join(projectDir, PROCS_DIR, `${p.pid}.json`), { force: true });
  }
  return killed;
}
