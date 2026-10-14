import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readActivity } from '../activity.js';
import { readCards } from '../cards.js';
import { createCard } from '../engine.js';
import { mainTreeOf, projectRoot } from '../project-root.js';
import { acceptAllAnswers } from '../interview.js';
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

describe('a stage that waits on answers', () => {
  const INTERVIEW_LANE = `id: build\nversion: 1\nretries: 3\nmetric: { name: m, source: cards }\nstages:\n  - id: interview\n    done: { cmd: "node ${CLI} check questions {id} --min 3" }\n  - id: build\n    done: { cmd: "true" }\n`;
  // First run: asks three questions through the CLI and stops. Later runs: the questions exist, so it builds and hands back.
  const ASKING_AGENT = `#!/bin/sh
set -e
if ! ls "$CODELOOP_PROJECT_DIR"/specs/*/interview.md >/dev/null 2>&1; then
  for q in one two three; do node "${CLI}" ask "$CODELOOP_CARD" "Question $q?" --recommended yes; done
  exit 0
fi
echo built > built.txt
git add -A
${GIT} commit -qm "feat: built

Card: $CODELOOP_CARD"
node "${CLI}" card handback "$CODELOOP_CARD" --branch "$(git rev-parse --abbrev-ref HEAD)" --head "$(git rev-parse HEAD)" --proof "node ${CLI} check questions $CODELOOP_CARD --min 3" --left "built.txt" --worktree "$PWD"
`;

  it('ends the turn as questions with no retry and no gate, stops the run, and proceeds once answers are in', async () => {
    project(INTERVIEW_LANE, ASKING_AGENT);
    const run = await orchRun(dir, 'c-001');
    expect(run.turns).toHaveLength(1);
    expect(run.turns[0].outcome).toBe('questions');
    expect(run.stopped).toBe('waiting for answers');
    const card = readCards(dir).cards[0];
    expect(card.retries.interview ?? 0).toBe(0);
    expect(card.stage).toBe('interview');

    // Running again while the questions are open starts no builder.
    const again = await orchRun(dir, 'c-001');
    expect(again.turns).toHaveLength(0);
    expect(again.stopped).toBe('waiting for answers');

    acceptAllAnswers(dir, 'c-001', 'owner');
    const next = await orchTurn(dir, 'c-001');
    expect(next.findings).toEqual([]);
    expect(next.outcome).toBe('merged');
    expect(readCards(dir).cards[0].stage).toBe('build');
  }, 90_000);
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
      // With no env, a linked worktree (this checkout may be one) resolves to its main tree.
      expect(projectRoot()).toBe(mainTreeOf(process.cwd()) ?? process.cwd());
      process.env.CODELOOP_PROJECT_DIR = '/somewhere/else';
      expect(projectRoot()).toBe('/somewhere/else');
    } finally {
      if (before === undefined) delete process.env.CODELOOP_PROJECT_DIR;
      else process.env.CODELOOP_PROJECT_DIR = before;
    }
  });
});

describe('after the merge', () => {
  const afterMerge = (build: string, restart = 'echo restarted > restarted.txt') =>
    writeFileSync(join(dir, '.codeloop/config.yaml'), `${readFileSync(join(dir, '.codeloop/config.yaml'), 'utf-8')}orch:\n  after_merge:\n    build: "${build}"\n    restart: "${restart}"\n`);

  it('runs the project build and restart on the main tree and records each as a post-merge line', async () => {
    project(TWO_STAGE, WORKING_AGENT);
    afterMerge('test -f built.txt && echo build-ok > marker.txt');
    const turn = await orchTurn(dir, 'c-001');
    expect(turn.outcome).toBe('merged');
    expect(turn.postMerge).toEqual([{ name: 'build', cmd: 'test -f built.txt && echo build-ok > marker.txt', exit: 0 }, { name: 'restart', cmd: 'echo restarted > restarted.txt', exit: 0 }]);
    expect(readFileSync(join(dir, 'marker.txt'), 'utf-8')).toBe('build-ok\n');
    const lines = readActivity(dir, 'c-001').items.filter(l => l.kind === 'post-merge');
    expect(lines.map(l => [l.step, l.exit])).toEqual([['build', 0], ['restart', 0]]);
  }, 60_000);

  it('a failing build parks the story stuck with the output tail, and the restart does not run', async () => {
    project(TWO_STAGE, WORKING_AGENT);
    afterMerge('echo tsc found 2 errors; exit 3');
    const turn = await orchTurn(dir, 'c-001');
    expect(turn.outcome).toBe('stuck');
    expect(turn.findings[0]).toMatch(/after the merge, build .* exited 3: tsc found 2 errors/);
    expect(readCards(dir).cards[0].gate).toBe('stuck');
    expect(existsSync(join(dir, 'restarted.txt'))).toBe(false);
    expect(readActivity(dir, 'c-001').items.find(l => l.kind === 'post-merge')).toMatchObject({ step: 'build', exit: 3, text: expect.stringContaining('tsc found 2 errors') });
  }, 60_000);

  it('a project without git guard hooks gets none from its story worktree', async () => {
    project(TWO_STAGE, IDLE_AGENT);
    await orchTurn(dir, 'c-001');
    expect(existsSync(join(dir, '.git/hooks/pre-commit'))).toBe(false);
    expect(existsSync(join(dir, '.git/hooks/post-commit'))).toBe(false);
  }, 60_000);

  it('the report names the proof and the gate of the turn that merged, not a later gate', async () => {
    project(GATED, WORKING_AGENT);
    await orchRun(dir, 'c-001');
    const later = { card: 'c-001', stage: 'code', handback: { branch: 'b', head: 'h', at: new Date().toISOString() }, proof: { cmd: 'false', exit: 1, output: '' }, check: { pass: false, output: '' }, claim: null, verdict: 'fail', findings: ['later'], at: new Date().toISOString() };
    writeFileSync(join(dir, '.codeloop/state/gates/c-001-99.json'), JSON.stringify(later));
    expect(orchReport(dir, 'c-001').proof).toBe('`test -f built.txt` exited 0; the gate said pass');
  }, 60_000);
});
