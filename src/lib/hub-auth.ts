/**
 * Who can sign in to the hub: `~/.codeloop/hub.yaml` (`user`, `password_hash`), the same scrypt
 * scheme as a project's own board sign-in (auth.ts) but rooted at the hub's home, not a project.
 * Defaults to `owner` / `codeloop` so a fresh `codeloop hub` is usable at once. This is the only
 * sign-in the hub honours; a project's own `local.yaml` board password applies only to
 * `codeloop serve --standalone`, not to that project mounted under the hub.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { DEFAULT_BOARD_PASSWORD, DEFAULT_BOARD_USER, hashPassword, verifyPassword } from './auth.js';
import { codeloopHome } from './hub-registry.js';

export interface HubAuth {
  user: string;
  /** Empty when hub.yaml names no password yet: the default applies. */
  passwordHash: string;
  /** True when no password was ever set, or it was set back to the default. */
  isDefault: boolean;
}

const hubAuthPath = () => join(codeloopHome(), 'hub.yaml');

type HubDoc = { user?: string; password_hash?: string };

function readDoc(): HubDoc {
  const file = hubAuthPath();
  if (!existsSync(file)) return {};
  const parsed = parseYaml(readFileSync(file, 'utf-8'));
  return parsed && typeof parsed === 'object' ? (parsed as HubDoc) : {};
}

export function readHubAuth(): HubAuth {
  const doc = readDoc();
  const user = doc.user ?? DEFAULT_BOARD_USER;
  if (!doc.password_hash) return { user, passwordHash: '', isDefault: true };
  return { user, passwordHash: doc.password_hash, isDefault: verifyPassword(DEFAULT_BOARD_PASSWORD, doc.password_hash) };
}

export const checkHubPassword = (auth: HubAuth, password: string): boolean =>
  auth.passwordHash ? verifyPassword(password, auth.passwordHash) : password === DEFAULT_BOARD_PASSWORD;

export function writeHubAuth(update: { user?: string; password?: string }): HubAuth {
  const file = hubAuthPath();
  const doc = readDoc();
  const user = update.user?.trim() || doc.user || DEFAULT_BOARD_USER;
  const passwordHash = update.password ? hashPassword(update.password) : (doc.password_hash ?? '');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, stringifyYaml({ user, password_hash: passwordHash }));
  return { user, passwordHash, isDefault: passwordHash ? verifyPassword(DEFAULT_BOARD_PASSWORD, passwordHash) : true };
}
