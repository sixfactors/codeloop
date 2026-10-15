/**
 * One lock per repository for the work that must not overlap: an orchestrated turn, a `run --due`,
 * a post-merge build or restart, and `store move`. `.codeloop/state/run.lock` holds the holder's
 * pid, purpose and start time. A second caller waits up to `orch.lock_wait_minutes` (default 10)
 * and then stops with `locked`, naming the holder. A lock whose pid is gone is reclaimed. The holder
 * may take it again from inside (a turn's post-merge build): the lock is re-entrant per call chain.
 */
import { AsyncLocalStorage } from 'async_hooks';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { RefusalError } from './cards.js';
import { loadConfig } from './config.js';

export const RUN_LOCK_PATH = '.codeloop/state/run.lock';

export interface LockHolder {
  pid: number;
  purpose: string;
  at: string;
}

export class LockedError extends RefusalError {
  constructor(message: string, readonly holder: LockHolder) {
    super(message);
  }
}

// Re-entrant per call chain, not per process: a turn's own post-merge build runs inside the turn's
// context and passes, while a second turn started concurrently in the same process (the hub) waits.
const chain = new AsyncLocalStorage<ReadonlySet<string>>();
const ownedHere = new Set<string>();

export function lockWaitMs(projectDir: string): number {
  const orch = (loadConfig(projectDir) as { orch?: { lock_wait_minutes?: unknown } }).orch;
  const v = orch && typeof orch === 'object' ? orch.lock_wait_minutes : undefined;
  return (typeof v === 'number' && v >= 0 ? v : 10) * 60_000;
}

export function lockHolder(projectDir: string): LockHolder | undefined {
  const file = join(projectDir, RUN_LOCK_PATH);
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf-8')) as LockHolder) : undefined;
  } catch {
    return undefined;
  }
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};

function tryTake(projectDir: string, purpose: string): LockHolder | undefined {
  const file = join(projectDir, RUN_LOCK_PATH);
  mkdirSync(dirname(file), { recursive: true });
  const mine: LockHolder = { pid: process.pid, purpose, at: new Date().toISOString() };
  if (ownedHere.has(projectDir)) return lockHolder(projectDir) ?? mine;
  try {
    writeFileSync(file, JSON.stringify(mine), { flag: 'wx' });
    ownedHere.add(projectDir);
    return undefined;
  } catch {
    const holder = lockHolder(projectDir);
    // A holder that died without releasing (killed, crashed) leaves its file; its pid says so. A file
    // naming this process but not held by it is left over from an earlier failure in this process.
    if (!holder || !alive(holder.pid) || holder.pid === process.pid) {
      rmSync(file, { force: true });
      return tryTake(projectDir, purpose);
    }
    return holder;
  }
}

const blocked = (holder: LockHolder, waitedMs: number) =>
  new LockedError(`locked: ${holder.purpose} (pid ${holder.pid}, since ${holder.at}) holds ${RUN_LOCK_PATH}; waited ${Math.round(waitedMs / 1000)} s`, holder);

function release(projectDir: string): void {
  ownedHere.delete(projectDir);
  const holder = lockHolder(projectDir);
  if (holder?.pid === process.pid) rmSync(join(projectDir, RUN_LOCK_PATH), { force: true });
}

const inChain = (projectDir: string) => chain.getStore()?.has(projectDir) ?? false;
const withChain = (projectDir: string) => new Set([...(chain.getStore() ?? []), projectDir]);

/** Runs `fn` holding the repo lock, waiting without blocking the event loop. */
export async function withRunLock<T>(projectDir: string, purpose: string, fn: () => Promise<T> | T, waitMs: number = lockWaitMs(projectDir)): Promise<T> {
  if (inChain(projectDir)) return fn();
  const started = Date.now();
  for (;;) {
    const holder = tryTake(projectDir, purpose);
    if (!holder) break;
    if (Date.now() - started >= waitMs) throw blocked(holder, Date.now() - started);
    await new Promise(r => setTimeout(r, Math.min(1000, Math.max(50, waitMs / 20))));
  }
  try {
    return await chain.run(withChain(projectDir), fn);
  } finally {
    release(projectDir);
  }
}

const sleepSync = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** The same lock for synchronous callers (`store move`, a post-merge step). */
export function withRunLockSync<T>(projectDir: string, purpose: string, fn: () => T, waitMs: number = lockWaitMs(projectDir)): T {
  if (inChain(projectDir)) return fn();
  const started = Date.now();
  for (;;) {
    const holder = tryTake(projectDir, purpose);
    if (!holder) break;
    if (Date.now() - started >= waitMs) throw blocked(holder, Date.now() - started);
    sleepSync(Math.min(1000, Math.max(50, waitMs / 20)));
  }
  try {
    return chain.run(withChain(projectDir), fn);
  } finally {
    release(projectDir);
  }
}
