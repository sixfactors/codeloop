import { closeSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeSync } from 'fs';
import { dirname } from 'path';

const WAIT_MS = 30_000;
// A holder that died without releasing is detected by its pid. The age limit covers a pid that
// was reused, and is longer than any write may take (a cloud write can wait on a rate limit).
const STALE_MS = 5 * 60_000;

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function stale(lock: string): boolean {
  try {
    const pid = parseInt(readFileSync(lock, 'utf-8'), 10);
    if (Date.now() - statSync(lock).mtimeMs > STALE_MS) return true;
    if (!pid) return false; // the holder has created the file and not written its pid yet
    try {
      process.kill(pid, 0);
      return false;
    } catch (e) {
      return (e as NodeJS.ErrnoException).code === 'ESRCH';
    }
  } catch {
    return false; // gone between the failed open and this look: retry the open
  }
}

function acquire(path: string): () => void {
  const lock = `${path}.lock`;
  mkdirSync(dirname(lock), { recursive: true });
  const deadline = Date.now() + WAIT_MS;
  for (let wait = 2; ; wait = Math.min(wait * 2, 50)) {
    try {
      const fd = openSync(lock, 'wx');
      writeSync(fd, String(process.pid));
      closeSync(fd);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      if (stale(lock)) {
        rmSync(lock, { force: true });
        continue;
      }
      if (Date.now() > deadline) throw new Error(`could not lock ${path} within ${WAIT_MS / 1000}s; if no codeloop process is running, delete ${lock}`);
      sleep(wait + Math.floor(Math.random() * wait));
    }
  }
  return () => rmSync(lock, { force: true });
}

/**
 * Runs `fn` while holding `<path>.lock`, created exclusively so only one process can hold it.
 * Everything that reads a file, decides, and writes it back goes through here; without it two
 * processes can both pass the check and the later rename silently discards the earlier write.
 */
export function withLock<T>(path: string, fn: () => T): T {
  const release = acquire(path);
  try {
    return fn();
  } finally {
    release();
  }
}

/** `withLock` for work that awaits: the lock is held until the promise settles, not until `fn` returns. */
export async function withLockAsync<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const release = acquire(path);
  try {
    return await fn();
  } finally {
    release();
  }
}
