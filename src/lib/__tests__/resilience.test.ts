import { execSync, spawn, spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadAgents, runAgent } from '../agent.js';
import { clearAgent, isUnavailable, noteAgentRun, startsToday } from '../agent-ledger.js';
import { readCards } from '../cards.js';
import { createCard } from '../engine.js';
import { orchRun, orchTurn } from '../orch.js';
import { doctorTick } from '../run.js';
import { RUN_LOCK_PATH, withRunLock } from '../run-lock.js';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'dist');
const GIT = 'git -c user.email=a@b -c user.name=t';
let root: string;
let dir: string;
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

function project(agentCmd: string, extra = '') {
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/config.yaml'), `project:\n  name: demo\nagents:\n  default: fake\n  fake:\n    cmd: ${JSON.stringify(agentCmd)}\n    timeout_minutes: 1\n${extra}`);
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), 'id: build\nversion: 1\nretries: 3\nmetric: { name: m, source: cards }\nstages:\n  - id: code\n    done: { cmd: "test -f done.txt" }\n  - id: ship\n    done: { cmd: "true" }\n');
  writeFileSync(join(dir, '.gitignore'), '.codeloop/state/\n');
  execSync(`git init -q -b main && ${GIT} add -A && ${GIT} commit -qm init`, { cwd: dir });
  createCard(dir, { lane: 'build', title: 'Founders can read the launch post' });
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-resilience-')));
  dir = join(root, 'demo');
  mkdirSync(dir);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('an agent that cannot run', () => {
  it('exits at once twice, is marked unavailable, stops the run without a retry, and the doctor skips it until cleared', async () => {
    project('true');
    const first = await orchTurn(dir, 'c-001');
    expect(first.outcome).toBe('builder-unavailable');
    expect(isUnavailable(dir, 'fake')).toBe(false);
    const run = await orchRun(dir, 'c-001');
    expect(run.stopped).toMatch(/^builder-unavailable: .*now marked unavailable/);
    expect(isUnavailable(dir, 'fake')).toBe(true);
    expect(readCards(dir).cards[0].retries.code ?? 0).toBe(0);
    const startsBefore = startsToday(dir, 'fake');
    // A further run refuses before starting anything.
    expect((await orchRun(dir, 'c-001')).stopped).toMatch(/^builder-unavailable: agent fake is marked unavailable/);
    expect(startsToday(dir, 'fake')).toBe(startsBefore);
    expect(clearAgent(dir, 'fake')).toBe(true);
    expect(isUnavailable(dir, 'fake')).toBe(false);
  }, 60_000);

  it('the doctor tick never restarts an unavailable agent', async () => {
    project('touch done.txt');
    const hour = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    const file = JSON.parse(readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8'));
    file.cards[0] = { ...file.cards[0], retries: { code: 2 }, updatedAt: hour(3), events: [{ at: hour(3), actor: 'engine', human: false, action: 'fail', stage: 'code', note: 'done.txt is missing' }] };
    writeFileSync(join(dir, '.codeloop/cards.json'), JSON.stringify(file, null, 2));
    noteAgentRun(dir, 'fake', { durationMs: 10, handedBack: false, exit: 1 });
    noteAgentRun(dir, 'fake', { durationMs: 10, handedBack: false, exit: 1 });
    expect((await doctorTick(dir, new Date())).filter(a => a.action === 'agent-started')).toEqual([]);
    expect(startsToday(dir, 'fake')).toBe(0);
    clearAgent(dir, 'fake');
    expect((await doctorTick(dir, new Date())).map(a => [a.id, a.action])).toContainEqual(['c-001', 'agent-started']);
  }, 60_000);
});

describe('the daily ledger', () => {
  it('refuses the eleventh start of an agent in a day, naming the count', async () => {
    project('true');
    const agent = loadAgents(dir).agents.fake;
    expect(agent.maxRunsPerDay).toBe(10);
    for (let i = 0; i < 10; i++) await runAgent(dir, agent, join(dir, 'brief.md'), join(dir, '.codeloop/state/a.log'));
    await expect(runAgent(dir, agent, join(dir, 'brief.md'), join(dir, '.codeloop/state/a.log'))).rejects.toThrow('agent fake has started 10 times today (max_runs_per_day is 10)');
    expect(startsToday(dir, 'fake')).toBe(10);
  }, 60_000);
});

describe('the repo lock', () => {
  it('a turn waits on a live holder and stops as locked naming it; a dead holder is reclaimed', async () => {
    project('touch done.txt', 'orch:\n  quick_exit_seconds: 0\n');
    const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)']);
    mkdirSync(join(dir, '.codeloop/state'), { recursive: true });
    writeFileSync(join(dir, RUN_LOCK_PATH), JSON.stringify({ pid: holder.pid, purpose: 'run --due', at: new Date().toISOString() }));
    try {
      const turn = await orchTurn(dir, 'c-001', { lockWaitMs: 300 });
      expect(turn.outcome).toBe('locked');
      expect(turn.findings[0]).toContain(`locked: run --due (pid ${holder.pid}`);
      expect(readCards(dir).cards[0].retries.code ?? 0).toBe(0);
    } finally {
      holder.kill('SIGKILL');
    }
    const gone = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf-8' }).stdout.trim();
    writeFileSync(join(dir, RUN_LOCK_PATH), JSON.stringify({ pid: Number(gone), purpose: 'orch c-009 turn', at: new Date().toISOString() }));
    const ran = await orchTurn(dir, 'c-001', { lockWaitMs: 300 });
    expect(ran.outcome).not.toBe('locked');
    expect(existsSync(join(dir, RUN_LOCK_PATH))).toBe(false);
  }, 60_000);

  it('two turns in one process serialize: the second starts after the first releases', async () => {
    project('true');
    const order: string[] = [];
    const first = withRunLock(dir, 'one', async () => {
      order.push('one-start');
      await new Promise(r => setTimeout(r, 400));
      order.push('one-end');
    });
    const second = withRunLock(dir, 'two', async () => {
      order.push('two-start');
    });
    await Promise.all([first, second]);
    expect(order).toEqual(['one-start', 'one-end', 'two-start']);
  });
});

describe('no child outlives its parent', () => {
  it('killing the parent of a running agent kills the agent and its children', async () => {
    expect(existsSync(join(DIST, 'lib/agent.js'))).toBe(true);
    project('true');
    const script = join(dir, 'agent.sh');
    writeFileSync(script, `#!/bin/sh\nsleep 30 &\necho $! > ${join(dir, 'child.pid')}\nwait\n`);
    chmodSync(script, 0o755);
    writeFileSync(join(dir, '.codeloop/config.yaml'), `agents:\n  default: slow\n  slow:\n    cmd: "sh ${script}"\n    timeout_minutes: 5\n`);
    const parent = spawn(process.execPath, ['--input-type=module', '-e', `const a = await import(${JSON.stringify(join(DIST, 'lib/agent.js'))}); const ag = a.loadAgents(${JSON.stringify(dir)}).agents.slow; await a.runAgent(${JSON.stringify(dir)}, ag, ${JSON.stringify(join(dir, 'b.md'))}, ${JSON.stringify(join(dir, 'run.log'))});`], { stdio: 'ignore' });
    const pidFile = join(dir, 'child.pid');
    for (let i = 0; i < 100 && !existsSync(pidFile); i++) await new Promise(r => setTimeout(r, 100));
    const child = Number(readFileSync(pidFile, 'utf-8'));
    expect(alive(child)).toBe(true);
    parent.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 800));
    expect(alive(child)).toBe(false);
  }, 30_000);
});
