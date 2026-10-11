import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * The hub mounts one project's handlers per request, resolved from the id in the path. Any of
 * these files reaching for `process.cwd()`/`process.chdir()` instead of the directory the caller
 * handed it would silently read or write whichever project happened to be the process's current
 * directory, not necessarily the one the request named. docs/plans/codeloop/2026-10-11-local-hub.md.
 */
const LIB = join(dirname(fileURLToPath(import.meta.url)), '..');
const FORBIDDEN = /process\.(cwd|chdir)\(/;

function* filesUnder(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === '__tests__') continue;
      yield* filesUnder(full);
    } else if (entry.endsWith('.ts')) {
      yield full;
    }
  }
}

/** server.ts, services.ts, every hub*.ts at the lib root, and everything under index/ and store/. */
function guardedFiles(): string[] {
  const root = readdirSync(LIB).filter(f => f.endsWith('.ts') && (f === 'server.ts' || f === 'services.ts' || f.startsWith('hub')));
  return [...root.map(f => join(LIB, f)), ...filesUnder(join(LIB, 'index')), ...filesUnder(join(LIB, 'store'))];
}

describe('no process.cwd()/chdir() on the server path', () => {
  const files = guardedFiles();

  it('covers the files the spec names (the check can\'t pass by finding nothing)', () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files.some(f => f.endsWith('/server.ts'))).toBe(true);
    expect(files.some(f => f.endsWith('/hub.ts'))).toBe(true);
  });

  it('every handler takes its directory from the caller, not the process', () => {
    const offenders = files.filter(f => FORBIDDEN.test(readFileSync(f, 'utf-8')));
    expect(offenders).toEqual([]);
  });

  it('fails when one of them does reach for process.cwd() (the check can fail)', () => {
    expect(FORBIDDEN.test("const dir = process.cwd();")).toBe(true);
    expect(FORBIDDEN.test("process.chdir(dir);")).toBe(true);
  });
});
