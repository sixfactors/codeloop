import { spawnSync, type SpawnSyncOptions, type SpawnSyncReturns } from 'child_process';
import { resolve } from 'path';

export const CLI = resolve(process.env.CODELOOP_TEST_DIST ?? 'dist', 'index.js');

/**
 * Runs the built CLI to completion and returns spawnSync's result. The 60 s limit kills a child
 * that hangs, so a failing test never leaves a node process behind; the env carries the vitest
 * setup's CODELOOP_HOME, CODELOOP_NO_SCHEDULE and CODELOOP_TEST_SANDBOX unless the caller overrides.
 */
export function runCli(args: string[], opts: SpawnSyncOptions = {}): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf-8',
    timeout: 60_000,
    killSignal: 'SIGKILL',
    ...opts,
    env: { ...process.env, ...(opts.env ?? {}) },
  }) as SpawnSyncReturns<string>;
}
