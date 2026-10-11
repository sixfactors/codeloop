/**
 * Where `codeloop hub` records itself so `codeloop serve`/`codeloop open` in any project can find
 * the one hub already running, instead of starting a second one: `~/.codeloop/state/hub.json`.
 * State, not a thing a person edits, so it is always overwritten whole. Mirrors serve-state.ts,
 * which does the same thing per project.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { codeloopHome } from './hub-registry.js';

export interface HubState {
  port: number;
  host: string;
  token: string;
  pid: number;
  startedAt: string;
}

const hubStatePath = () => join(codeloopHome(), 'state', 'hub.json');

export function writeHubState(state: HubState): void {
  const file = hubStatePath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

export function readHubState(): HubState | undefined {
  const file = hubStatePath();
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as HubState;
  } catch {
    return undefined;
  }
}

export function removeHubState(): void {
  const file = hubStatePath();
  if (existsSync(file)) unlinkSync(file);
}

export const hubUrl = (state: Pick<HubState, 'host' | 'port'>): string => {
  const loopback = ['127.0.0.1', 'localhost', '::1'].includes(state.host);
  return `http://${loopback ? '127.0.0.1' : state.host}:${state.port}`;
};

/**
 * True when the recorded process is alive and its port answers. A dead pid or an unanswering
 * port means the record is stale; the caller overwrites it rather than trusting it.
 */
export async function hubStateAlive(state: HubState): Promise<boolean> {
  try {
    process.kill(state.pid, 0);
  } catch {
    return false;
  }
  try {
    const host = ['0.0.0.0', '::'].includes(state.host) ? '127.0.0.1' : state.host;
    const res = await fetch(`http://${host}:${state.port}/api/hub/projects`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}
