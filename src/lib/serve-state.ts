/**
 * Where `codeloop serve` records itself so `codeloop open` and a second `codeloop serve` can find
 * a server already running for this project. Written by both the foreground and `--bg` paths,
 * removed by `--stop`. State, not a thing a person edits, so it is always overwritten whole.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

export const SERVE_STATE_PATH = '.codeloop/state/serve.json';

/**
 * Walks up from `startDir` to the nearest folder holding `.codeloop/`, the way git finds `.git`
 * — so `codeloop serve` (and friends) work from a subfolder, not only the project root.
 */
export function findProjectRoot(startDir: string = process.cwd()): string | undefined {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, '.codeloop'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export interface ServeState {
  port: number;
  host: string;
  token: string;
  pid: number;
  /** Whether that process grants Approve/Reject/Answer etc. to whoever has the URL. */
  owner: boolean;
  startedAt: string;
}

export function writeServeState(projectDir: string, state: ServeState): void {
  const file = join(projectDir, SERVE_STATE_PATH);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

export function readServeState(projectDir: string): ServeState | undefined {
  const file = join(projectDir, SERVE_STATE_PATH);
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as ServeState;
  } catch {
    return undefined;
  }
}

export function removeServeState(projectDir: string): void {
  const file = join(projectDir, SERVE_STATE_PATH);
  if (existsSync(file)) unlinkSync(file);
}

/** The URL `codeloop serve` printed, from a state record. No token: people sign in on the page. */
export const serveUrl = (state: Pick<ServeState, 'host' | 'port'>): string => {
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(state.host);
  return `http://${loopback ? '127.0.0.1' : state.host}:${state.port}/`;
};

/**
 * True when the recorded process is alive and its port answers. A dead pid or an unanswering
 * port means the record is stale; the caller overwrites it rather than trusting it.
 */
export async function serveStateAlive(state: ServeState): Promise<boolean> {
  try {
    process.kill(state.pid, 0);
  } catch {
    return false;
  }
  try {
    const host = ['0.0.0.0', '::'].includes(state.host) ? '127.0.0.1' : state.host;
    const res = await fetch(`http://${host}:${state.port}/api/cards`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** The platform's "open a URL in the default browser" command; fire-and-forget. */
export function openUrl(url: string): void {
  void import('child_process').then(({ exec }) => {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${cmd} '${url}'`);
  });
}
