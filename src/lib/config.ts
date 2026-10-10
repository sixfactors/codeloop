import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

export const CONFIG_FILE = '.codeloop/config.yaml';
/** Never synced and never committed: keys, tokens and paths that are true only on this machine. */
export const LOCAL_FILE = '.codeloop/local.yaml';

type Values = Record<string, any>;

const isMap = (v: unknown): v is Values => typeof v === 'object' && v !== null && !Array.isArray(v);

function read(projectDir: string, path: string): Values {
  const file = join(projectDir, path);
  const parsed = existsSync(file) ? parseYaml(readFileSync(file, 'utf-8')) : null;
  return isMap(parsed) ? parsed : {};
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
