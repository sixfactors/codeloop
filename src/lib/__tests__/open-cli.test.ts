import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const CLI = resolve('dist/index.js');
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-open-'));
  mkdirSync(join(dir, '.codeloop'), { recursive: true });
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('codeloop open with no server running', () => {
  it('exits 1 and prints the command that starts one, instead of opening a stale or missing URL', () => {
    const result = spawnSync(process.execPath, [CLI, 'open'], { cwd: dir, encoding: 'utf-8' });
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/No board is running/);
    expect(result.stdout).toContain('codeloop serve --open');
  });

  it('exits 1 the same way when serve.json names a pid that is not running (a server that crashed or was killed outside codeloop)', () => {
    mkdirSync(join(dir, '.codeloop/state'), { recursive: true });
    writeFileSync(join(dir, '.codeloop/state/serve.json'), JSON.stringify({ port: 4040, host: '127.0.0.1', token: 'x', pid: 999_999_999, owner: true, startedAt: new Date().toISOString() }));
    const result = spawnSync(process.execPath, [CLI, 'open'], { cwd: dir, encoding: 'utf-8' });
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/No board is running/);
  });
});
