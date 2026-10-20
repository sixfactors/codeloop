import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Where the first day's two steps leave their state: the map (`codeloop map`) and the setup
 * answers (`codeloop setup`). Both are machine-local scanner and answer state under
 * .codeloop/state, not pages a person edits; the pages and the process file they produce are the
 * committed record. The session hook reads only whether each exists, so it stays cheap.
 */
export const MAP_PATH = '.codeloop/state/map.json';
export const SETUP_PATH = '.codeloop/state/setup.json';

export interface FirstDayStatus {
  /** `codeloop map` has run here. */
  mapped: boolean;
  /** Every setup question has an answer. */
  setup: boolean;
}

export function firstDayStatus(projectDir: string): FirstDayStatus {
  return { mapped: existsSync(join(projectDir, MAP_PATH)), setup: existsSync(join(projectDir, SETUP_PATH)) };
}

/** True for a process the lead agent started: `codeloop run --agent` and `orch run` set both. */
export const isTaskAgentProcess = (env: NodeJS.ProcessEnv = process.env): boolean => env.CODELOOP_ROLE === 'agent' || Boolean(env.CODELOOP_AGENT_RUN);
