import { execSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCard } from '../engine.js';
import { DEFAULT_CEILING_MB, memoryCeilingMb, waitUnderCeiling } from '../memory.js';
import { orchTurn } from '../orch.js';
import { runCli } from '../../__tests__/cli.js';

const GIT = 'git -c user.email=a@b -c user.name=t';
const LANE = 'id: build\nversion: 1\nretries: 3\nmetric: { name: m, source: cards }\nstages:\n  - id: code\n    done: { cmd: "true" }\n';
let root: string;
let dir: string;
const sh = (cmd: string) => execSync(cmd, { cwd: dir, encoding: 'utf8' }).trim();

function project(limits = '') {
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, 'ran.sh'), `#!/bin/sh\ntouch "${join(root, 'agent-ran')}"\n`);
  chmodSync(join(dir, 'ran.sh'), 0o755);
  writeFileSync(join(dir, '.codeloop/config.yaml'), `project:\n  name: demo\n${limits}agents:\n  default: fake\n  fake:\n    cmd: "sh ${join(dir, 'ran.sh')} {brief}"\n    timeout_minutes: 2\n`);
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), LANE);
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  writeFileSync(join(dir, '.gitignore'), '.codeloop/state/\n');
  sh(`git init -q -b main && git add -A && ${GIT} commit -qm init`);
  createCard(dir, { lane: 'build', title: 'Founders can read the launch post' });
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-mem-')));
  dir = join(root, 'demo');
  mkdirSync(dir);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('memory ceiling', () => {
  it('reads limits.max_memory_mb and defaults to 2048', () => {
    project('limits:\n  max_memory_mb: 512\n');
    expect(memoryCeilingMb(dir)).toBe(512);
    expect(memoryCeilingMb(join(root, 'nowhere'))).toBe(DEFAULT_CEILING_MB);
  });

  it('waits while the total is over the ceiling and goes on when it drops', async () => {
    project();
    const totals = [3000, 2500, 1900];
    const slept: number[] = [];
    const { waitedMs } = await waitUnderCeiling(dir, { total: () => totals.shift()!, sleep: async ms => void slept.push(ms), pollMs: 1000 });
    expect(slept).toEqual([1000, 1000]);
    expect(waitedMs).toBe(2000);
  });

  it('refuses with the numbers once the wait runs out', async () => {
    project();
    await expect(waitUnderCeiling(dir, { total: () => 5000, sleep: async () => undefined, pollMs: 1000, timeoutMs: 3000 })).rejects.toThrow(/5000 MB, over limits.max_memory_mb 2048/);
  });

  it('orch starts no builder and no worktree while over the ceiling', async () => {
    project();
    await expect(orchTurn(dir, 'c-001', { memory: { total: () => 9999, sleep: async () => undefined, timeoutMs: 0 } })).rejects.toThrow(/over limits.max_memory_mb/);
    expect(existsSync(join(root, 'agent-ran'))).toBe(false);
    expect(sh('git worktree list').split('\n')).toHaveLength(1);
  });

  it('orch starts the builder when under the ceiling', async () => {
    project();
    await orchTurn(dir, 'c-001', { memory: { total: () => 100 } });
    expect(existsSync(join(root, 'agent-ran'))).toBe(true);
  }, 60_000);
});

describe('codeloop ps and the bin shim', () => {
  it('ps --total prints the sum against the ceiling', () => {
    project('limits:\n  max_memory_mb: 99999\n');
    const run = runCli(['ps', '--total'], { cwd: dir });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toMatch(/^\d+ MB of 99999 MB\n$/);
  });

  it('ps exits 1 when the total is over the ceiling', () => {
    project('limits:\n  max_memory_mb: 1\n');
    // The ps process itself is a node codeloop process of more than 1 MB.
    const run = runCli(['ps', '--total'], { cwd: dir });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('over limits.max_memory_mb');
  });

  it('the shim gives commands 256 MB and the hub, serve and open 1024 MB', () => {
    const stub = join(root, 'node-stub');
    writeFileSync(stub, '#!/bin/sh\necho "$1"\n');
    chmodSync(stub, 0o755);
    const flag = (cmd: string) => execSync(`sh ${resolve('bin/codeloop')} ${cmd}`, { encoding: 'utf8', env: { ...process.env, CODELOOP_NODE: stub } }).trim();
    expect(flag('card list')).toBe('--max-old-space-size=256');
    expect(flag('hub')).toBe('--max-old-space-size=1024');
    expect(flag('serve')).toBe('--max-old-space-size=1024');
  });
});
