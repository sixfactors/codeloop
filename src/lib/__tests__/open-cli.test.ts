import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { runCli } from '../../__tests__/cli.js';

let dir: string;
let home: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-open-'));
  mkdirSync(join(dir, '.codeloop'), { recursive: true });
  // Isolated from the real ~/.codeloop: a default (hub-joining) `open`/`serve` would otherwise
  // register this throwaway project, and could try to reach a hub, in the developer's real home.
  home = mkdtempSync(join(tmpdir(), 'codeloop-open-home-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe('codeloop open --standalone with no server running', () => {
  it('exits 1 and prints the command that starts one, instead of opening a stale or missing URL', () => {
    const result = runCli(['open', '--standalone'], { cwd: dir, encoding: 'utf-8', env: { ...process.env, CODELOOP_HOME: home } });
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/No standalone board is running/);
    expect(result.stdout).toContain('codeloop serve --standalone --open');
  });

  it('exits 1 the same way when serve.json names a pid that is not running (a server that crashed or was killed outside codeloop)', () => {
    mkdirSync(join(dir, '.codeloop/state'), { recursive: true });
    writeFileSync(join(dir, '.codeloop/state/serve.json'), JSON.stringify({ port: 4040, host: '127.0.0.1', token: 'x', pid: 999_999_999, owner: true, startedAt: new Date().toISOString() }));
    const result = runCli(['open', '--standalone'], { cwd: dir, encoding: 'utf-8', env: { ...process.env, CODELOOP_HOME: home } });
    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/No standalone board is running/);
  });
});
