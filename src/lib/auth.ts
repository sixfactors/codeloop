/**
 * Who can sign in to the board: `board: { user, password_hash }` in `.codeloop/local.yaml`
 * (never synced, never committed — see config.ts). The default user/password exist so a fresh
 * `codeloop serve` is usable at once; `isDefault` tells the caller when that is still true, for
 * the "you are using the default password" notice and the non-loopback refusal in serve.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { dirname, join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { LOCAL_FILE } from './config.js';

export const DEFAULT_BOARD_USER = 'owner';
export const DEFAULT_BOARD_PASSWORD = 'codeloop';

const SCRYPT_KEYLEN = 64;

/** `scrypt$<salt hex>$<hash hex>`. Never the plain password, on disk or in memory beyond this call. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const attempt = scryptSync(password, salt, SCRYPT_KEYLEN);
  const wanted = Buffer.from(hash, 'hex');
  return attempt.length === wanted.length && timingSafeEqual(attempt, wanted);
}

export interface BoardAuth {
  user: string;
  /** Empty when local.yaml names no password yet: the default applies. */
  passwordHash: string;
  /** True when no password was ever set, or it was set back to the default. */
  isDefault: boolean;
}

type LocalDoc = Record<string, unknown> & { board?: { user?: string; password_hash?: string } };

function readLocal(projectDir: string): LocalDoc {
  const file = join(projectDir, LOCAL_FILE);
  if (!existsSync(file)) return {};
  const parsed = parseYaml(readFileSync(file, 'utf-8'));
  return parsed && typeof parsed === 'object' ? (parsed as LocalDoc) : {};
}

export function readBoardAuth(projectDir: string): BoardAuth {
  const board = readLocal(projectDir).board;
  const user = board?.user ?? DEFAULT_BOARD_USER;
  if (!board?.password_hash) return { user, passwordHash: '', isDefault: true };
  return { user, passwordHash: board.password_hash, isDefault: verifyPassword(DEFAULT_BOARD_PASSWORD, board.password_hash) };
}

export const checkBoardPassword = (auth: BoardAuth, password: string): boolean =>
  auth.passwordHash ? verifyPassword(password, auth.passwordHash) : password === DEFAULT_BOARD_PASSWORD;

/** Writes `board:` into local.yaml, leaving every other key (cloud config, agent overrides) untouched. */
export function writeBoardAuth(projectDir: string, update: { user?: string; password?: string }): BoardAuth {
  const file = join(projectDir, LOCAL_FILE);
  const doc = readLocal(projectDir);
  const current = doc.board ?? {};
  const user = update.user?.trim() || current.user || DEFAULT_BOARD_USER;
  const passwordHash = update.password ? hashPassword(update.password) : (current.password_hash ?? '');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, stringifyYaml({ ...doc, board: { user, password_hash: passwordHash } }));
  return { user, passwordHash, isDefault: passwordHash ? verifyPassword(DEFAULT_BOARD_PASSWORD, passwordHash) : true };
}
