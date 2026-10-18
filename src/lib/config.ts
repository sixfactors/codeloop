import { readFileSync, statSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

export const CONFIG_FILE = '.codeloop/config.yaml';
/** Never synced and never committed: keys, tokens and paths that are true only on this machine. */
export const LOCAL_FILE = '.codeloop/local.yaml';

type Values = Record<string, any>;

const isMap = (v: unknown): v is Values => typeof v === 'object' && v !== null && !Array.isArray(v);

// Parsed once per file version: a served request reads config dozens of times. Callers get a copy
// because some of them edit what they are handed.
const parsedFiles = new Map<string, { stamp: string; value: Values }>();

function read(projectDir: string, path: string): Values {
  const file = join(projectDir, path);
  const st = statSync(file, { throwIfNoEntry: false });
  if (!st) return {};
  const stamp = `${st.mtimeMs}:${st.size}`;
  const hit = parsedFiles.get(file);
  if (hit?.stamp === stamp) return structuredClone(hit.value);
  const parsed = parseYaml(readFileSync(file, 'utf-8'));
  const value = isMap(parsed) ? parsed : {};
  parsedFiles.set(file, { stamp, value });
  return structuredClone(value);
}

// Maps merge key by key, so local.yaml can change one agent's command and leave the rest shared.
// A list or a plain value in local.yaml replaces the shared one.
function overlay(base: Values, over: Values): Values {
  const out: Values = { ...base };
  for (const [key, value] of Object.entries(over)) out[key] = isMap(value) && isMap(base[key]) ? overlay(base[key], value) : value;
  return out;
}

/** config.yaml with local.yaml laid over it. Every reader of project config goes through here. */
export function loadConfig(projectDir: string): Values {
  return overlay(read(projectDir, CONFIG_FILE), read(projectDir, LOCAL_FILE));
}

export const DEFAULT_STALL_MINUTES = 30;

/**
 * `monitor.stall_minutes`: how long a builder may go without a prompt, tool call, file write or
 * activity line before the monitor calls it stalled and its hold stops counting. Lives here, not
 * in stall.ts, because active-card.ts reads it and stall.ts imports active-card.ts.
 */
export function stallMinutes(projectDir: string): number {
  const monitor = (loadConfig(projectDir) as { monitor?: unknown }).monitor;
  const value = monitor && typeof monitor === 'object' ? (monitor as { stall_minutes?: unknown }).stall_minutes : undefined;
  return typeof value === 'number' && value > 0 ? value : DEFAULT_STALL_MINUTES;
}
