import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  checkBoardPassword,
  DEFAULT_BOARD_PASSWORD,
  DEFAULT_BOARD_USER,
  hashPassword,
  readBoardAuth,
  verifyPassword,
  writeBoardAuth,
} from '../auth.js';

let dir: string;

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'codeloop-auth-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('hashPassword / verifyPassword', () => {
  it('verifies the right password and refuses a wrong one', () => {
    const hash = hashPassword('a-real-password');
    expect(verifyPassword('a-real-password', hash)).toBe(true);
    expect(verifyPassword('not-it', hash)).toBe(false);
  });

  it('never stores the plain password: the hash is scrypt$<salt>$<hash>, two different salts for the same password', () => {
    const a = hashPassword('same-password');
    const b = hashPassword('same-password');
    expect(a).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
    expect(a).not.toContain('same-password');
    expect(a).not.toBe(b); // different salt each time
    expect(verifyPassword('same-password', a)).toBe(true);
    expect(verifyPassword('same-password', b)).toBe(true);
  });

  it('verifyPassword on garbage input returns false instead of throwing', () => {
    expect(verifyPassword('x', 'not-a-hash-at-all')).toBe(false);
    expect(verifyPassword('x', '')).toBe(false);
  });
});

describe('readBoardAuth / writeBoardAuth', () => {
  it('the default user and password work when local.yaml does not exist', () => {
    const auth = readBoardAuth(dir);
    expect(auth).toEqual({ user: DEFAULT_BOARD_USER, passwordHash: '', isDefault: true });
    expect(checkBoardPassword(auth, DEFAULT_BOARD_PASSWORD)).toBe(true);
    expect(checkBoardPassword(auth, 'wrong')).toBe(false);
  });

  it('writing a new password makes it the only one that verifies, and the file holds a hash, never the password', () => {
    writeBoardAuth(dir, { password: 'a-real-password' });
    const auth = readBoardAuth(dir);
    expect(auth.isDefault).toBe(false);
    expect(checkBoardPassword(auth, 'a-real-password')).toBe(true);
    expect(checkBoardPassword(auth, DEFAULT_BOARD_PASSWORD)).toBe(false);

    const onDisk = readFileSync(join(dir, '.codeloop/local.yaml'), 'utf-8');
    expect(onDisk).toContain('password_hash');
    expect(onDisk).not.toContain('a-real-password');
  });

  it('changing the user alone keeps the existing password hash', () => {
    writeBoardAuth(dir, { password: 'a-real-password' });
    const beforeHash = readBoardAuth(dir).passwordHash;
    writeBoardAuth(dir, { user: 'dean' });
    const after = readBoardAuth(dir);
    expect(after.user).toBe('dean');
    expect(after.passwordHash).toBe(beforeHash);
    expect(checkBoardPassword(after, 'a-real-password')).toBe(true);
  });

  it('leaves other local.yaml keys untouched', () => {
    const file = join(dir, '.codeloop/local.yaml');
    mkdirSync(join(dir, '.codeloop'), { recursive: true });
    writeFileSync(file, 'cloud:\n  url: https://example.test\n');
    writeBoardAuth(dir, { password: 'a-real-password' });
    const doc = readFileSync(file, 'utf-8');
    expect(doc).toContain('cloud:');
    expect(doc).toContain('url: https://example.test');
    expect(doc).toContain('board:');
  });
});
