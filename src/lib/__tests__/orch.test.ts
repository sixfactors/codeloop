import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readCards } from '../cards.js';
import { createCard } from '../engine.js';
import { projectRoot } from '../project-root.js';
import { ensureStoryWorktree } from '../worktree.js';
import { orchReport, orchRun, orchStatus, orchTurn, readOrch } from '../orch.js';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'dist', 'index.js');
const GIT = 'git -c user.email=a@b -c user.name=t';

let root: string;
let dir: string;
const sh = (cmd: string, cwd = dir) => execSync(cmd, { cwd, encoding: 'utf8' }).trim();

// The builder: writes a file, commits it with a Card trailer, and hands back through the real CLI.
const WORKING_AGENT = `#!/bin/sh
set -e
echo built > built.txt
git add -A
${GIT} commit -qm "feat: built

Card: $CODELOOP_CARD"
node "${CLI}" card handback "$CODELOOP_CARD" --branch "$(git rev-parse --abbrev-ref HEAD)" --head "$(git rev-parse HEAD)" --proof "test -f built.txt" --left "built.txt exists" --worktree "$PWD"
`;
const IDLE_AGENT = '#!/bin/sh\nexit 0\n';

function project(lane: string, agentScript: string) {
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, 'fake-agent.sh'), agentScript);
  chmodSync(join(dir, 'fake-agent.sh'), 0o755);
  writeFileSync(join(dir, '.codeloop/config.yaml'), `project:\n  name: demo\nagents:\n  default: fake\n  fake:\n    cmd: "sh ${join(dir, 'fake-agent.sh')} {brief}"\n    timeout_minutes: 2\n`);
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), lane);
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  writeFileSync(join(dir, '.gitignore'), '.codeloop/state/\n');
  sh(`git init -q -b main && git add -A && ${GIT} commit -qm init`);
  createCard(dir, { lane: 'build', title: 'Founders can read the launch post' });
}

const TWO_STAGE = 'id: build\nversion: 1\nretries: 3\nmetric: { name: m, source: cards }\nstages:\n  - id: code\n    done: { cmd: "true" }\n  - id: ship\n    done: { cmd: "true" }\n';
const GATED = 'id: build\nversion: 1\nretries: 3\nmetric: { name: m, source: cards }\nstages:\n  - id: code\n    done: { cmd: "true" }\n    gate: { name: owner-ok, approver: owner }\n  - id: ship\n    done: { cmd: "true" }\n';

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-orch-')));
  dir = join(root, 'demo');
  mkdirSync(dir);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('orchTurn', () => {
  it('runs a builder in the story worktree, gates and merges its work, and advances the card one stage', async () => {
    expect(existsSync(CLI)).toBe(true);
    project(TWO_STAGE, WORKING_AGENT);
    const turn = await orchTurn(dir, 'c-001');
    expect(turn.findings).toEqual([]);
    expect(turn.outcome).toBe('merged');
    expect(sh('git log --format=%B -1')).toContain('Card: c-001');
    expect(existsSync(join(dir, 'built.txt'))).toBe(true);
    expect(readCards(dir).cards[0].stage).toBe('ship');
    const record = readOrch(dir, 'c-001');
    expect(record.turns).toHaveLength(1);
    expect(record.turns[0]).toMatchObject({ outcome: 'merged', stage: 'code', gate: { verdict: 'pass' } });
    expect(orchStatus(dir)[0]).toMatchObject({ card: 'c-001', stage: 'ship', turns: 1, lastOutcome: 'merged', builder: 'fake' });
  }, 60_000);

  it('fails a turn whose builder handed nothing back, counts a retry, and carries the finding into the next brief', async () => {
    project(TWO_STAGE, IDLE_AGENT);
    const turn = await orchTurn(dir, 'c-001');
    expect(turn.outcome).toBe('failed');
    expect(turn.findings[0]).toMatch(/no hand-back/);
    expect(readCards(dir).cards[0].retries.code).toBe(1);

    await orchTurn(dir, 'c-001');
    const brief = readFileSync(join(dir, '.codeloop/state/briefs/c-001-code.md'), 'utf-8');
    expect(brief).toContain('Latest gate findings');
    expect(brief).toContain('no hand-back');
    expect(brief).toContain('codeloop card handback c-001 --branch');
    expect(brief).toContain('--worktree');

    const third = await orchTurn(dir, 'c-001');
    expect(third.outcome).toBe('stuck');
    expect(readCards(dir).cards[0].gate).toBe('stuck');
  }, 60_000);
});

describe('a merge that cannot land', () => {
  it('is merge-failed, costs no retry, stops the run and feeds the finding into the next brief', async () => {
    project(TWO_STAGE, WORKING_AGENT);
    const wt = ensureStoryWorktree(dir, 'c-001');
    expect(wt.created).toBe(true);
    writeFileSync(join(dir, 'built.txt'), 'trunk got there first\n');
    sh(`git add -A && ${GIT} commit -qm trunk-built`);
    const run = await orchRun(dir, 'c-001');
    expect(run.turns).toHaveLength(1);
    expect(run.turns[0].outcome).toBe('merge-failed');
    expect(run.stopped).toMatch(/merge conflict in built\.txt/);
    expect(readCards(dir).cards[0].retries.code ?? 0).toBe(0);
    expect(existsSync(join(dir, '.git/MERGE_HEAD'))).toBe(false);
    expect(readCards(dir).cards[0].stage).toBe('code');
    await orchTurn(dir, 'c-001');
    expect(readFileSync(join(dir, '.codeloop/state/briefs/c-001-code.md'), 'utf-8')).toContain('merge conflict in built.txt');
  }, 60_000);
});

describe('orchRun and orchReport', () => {
  it('stops at the stage gate and the report names it', async () => {
    project(GATED, WORKING_AGENT);
    const run = await orchRun(dir, 'c-001');
    expect(run.turns).toHaveLength(1);
    expect(run.stopped).toBe('gate owner-ok');
    const report = orchReport(dir, 'c-001');
    expect(report.nextGate).toBe('owner-ok');
    expect(report.proof).toContain('test -f built.txt');
    expect(report.left).toBe('built.txt exists');
  }, 60_000);
});

describe('projectRoot', () => {
  it('prefers CODELOOP_PROJECT_DIR over the working directory', () => {
    const before = process.env.CODELOOP_PROJECT_DIR;
    try {
      delete process.env.CODELOOP_PROJECT_DIR;
      expect(projectRoot()).toBe(process.cwd());
      process.env.CODELOOP_PROJECT_DIR = '/somewhere/else';
      expect(projectRoot()).toBe('/somewhere/else');
    } finally {
      if (before === undefined) delete process.env.CODELOOP_PROJECT_DIR;
      else process.env.CODELOOP_PROJECT_DIR = before;
    }
  });
});
