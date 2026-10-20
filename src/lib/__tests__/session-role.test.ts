import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runCli } from '../../__tests__/cli.js';

// The session hook tells the two roles apart: a process the lead agent started carries
// CODELOOP_ROLE=agent (src/lib/agent.ts sets it) and gets the task-agent protocol; any other
// session is the lead agent, told what its first job is until the map and the setup exist.

describe('guard session prints the protocol for the role', () => {
  let dir: string;
  let home: string;
  const cli = (args: string[], env: Record<string, string> = {}) =>
    runCli(args, { cwd: dir, encoding: 'utf-8', input: '{}', env: { ...process.env, CODELOOP_HOME: home, CLAUDE_CODE_SESSION_ID: '', CODELOOP_ROLE: '', CODELOOP_AGENT_RUN: '', ...env } });

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'codeloop-session-role-'));
    home = mkdtempSync(join(tmpdir(), 'codeloop-session-role-home-'));
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
    writeFileSync(join(dir, 'pom.xml'), '<project/>');
    const init = cli(['init', '--tools', 'claude', '--yes']);
    if (init.status !== 0) throw new Error(init.stdout + init.stderr);
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  it('is the lead agent by default, and names the map as the first job before anything is learned', () => {
    const out = cli(['guard', 'session']);
    expect(out.status, out.stdout + out.stderr).toBe(0);
    expect(out.stdout).toMatch(/lead agent for this repository/);
    expect(out.stdout).toMatch(/codeloop map/);
    expect(out.stdout).not.toMatch(/you are a task agent/);
  });

  it('is a task agent when the lead agent started the process', () => {
    const out = cli(['guard', 'session'], { CODELOOP_ROLE: 'agent' });
    expect(out.status, out.stdout + out.stderr).toBe(0);
    expect(out.stdout).toMatch(/you are a task agent/);
    expect(out.stdout).not.toMatch(/lead agent for this repository/);
  });
});
