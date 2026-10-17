import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readCards, type Card } from '../cards.js';
import { advanceCard, approveCard, createCard, placeCard, recordEvent } from '../engine.js';
import { computeStats } from '../stats.js';
import { loadLanes } from '../lane.js';
import { buildBrief } from '../agent.js';
import { lintLane, parseLane } from '../lane.js';
import { orchTurn, readOrch } from '../orch.js';
import { newSpec } from '../spec.js';

// c-313: one agent turn carries a story's early stages, and the engine still checks and records
// each stage on its own. The builder is a scripted agent that writes some stage files, commits them
// with the card's trailer and hands back through the real CLI, as orch.test.ts does.

const CLI = join(process.env.CODELOOP_TEST_DIST ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'dist'), 'index.js');
const GIT = 'git -c user.email=a@b -c user.name=t';

let root: string;
let dir: string;
const sh = (cmd: string, cwd = dir) => execSync(cmd, { cwd, encoding: 'utf8' }).trim();
const card = (): Card => readCards(dir).cards[0];

const stage = (id: string, extra = '') => `  - id: ${id}\n    carry: early\n    output: notes/${id}.md\n    done: { cmd: "test -f notes/${id}.md" }\n${extra}`;
const LANE = [
  'id: build',
  'version: 1',
  'retries: 3',
  'metric: { name: m, source: cards }',
  'stages:',
  stage('research') + stage('interview') + stage('mock') + stage('spec', '    gate: { name: spec, approver: owner }\n') +
    '  - id: data-model\n    output: notes/data-model.md\n    done: { cmd: "test -f notes/data-model.md" }\n  - id: build\n    done: { cmd: "true" }\n',
].join('\n');

/** A builder that writes `files` (stage ids under notes/, or raw paths), commits and hands back. */
function agent(files: string[], opts: { sleep?: number; questions?: boolean } = {}): string {
  const writes = files.map(f => `mkdir -p notes && echo done > notes/${f}.md`).join('\n');
  const asks = opts.questions ? `printf '## Q1 Which page first?\\nrecommended: the list\\nanswer:\\n' > "$SPEC/interview.md"` : '';
  return `#!/bin/sh
set -e
${opts.sleep ? `sleep ${opts.sleep}` : ''}
${writes}
${asks}
git add -A
${GIT} commit -qm "docs: early stages

Card: $CODELOOP_CARD"
node "${CLI}" card handback "$CODELOOP_CARD" --branch "$(git rev-parse --abbrev-ref HEAD)" --head "$(git rev-parse HEAD)" --proof "true" --left "nothing"
`;
}

function project(script: string, timeout = 2) {
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, 'fake-agent.sh'), script);
  chmodSync(join(dir, 'fake-agent.sh'), 0o755);
  writeFileSync(join(dir, '.codeloop/config.yaml'), `project:\n  name: demo\nagents:\n  default: fake\n  fake:\n    cmd: "sh ${join(dir, 'fake-agent.sh')} {brief}"\n    timeout_minutes: ${timeout}\norch:\n  isolation: tree\n  quick_exit_seconds: 0\n`);
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), LANE);
  writeFileSync(join(dir, '.gitignore'), '.codeloop/state/\nfake-agent.sh\n');
  sh(`git init -q -b main && git add -A && ${GIT} commit -qm init`);
  createCard(dir, { lane: 'build', title: 'Founders can read the launch post', id: 'c-001', fields: { size: 'M' } });
  const { dir: spec } = newSpec(dir, 'c-001');
  sh(`git add -A && ${GIT} commit -qm spec`);
  process.env.SPEC = join(dir, spec);
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-carry-')));
  dir = join(root, 'demo');
  mkdirSync(dir);
});
afterEach(() => {
  delete process.env.SPEC;
  rmSync(root, { recursive: true, force: true });
});

const advanced = () => card().events.filter(e => e.action === 'advance').map(e => e.stage);

describe('a carried turn', () => {
  it('uc-313-01: carries research to spec in one agent start and stops at the spec gate, writing no later stage', async () => {
    expect(existsSync(CLI)).toBe(true);
    project(agent(['research', 'interview', 'mock', 'spec', 'data-model']));
    const turn = await orchTurn(dir, 'c-001');
    expect(turn.findings).toEqual([]);
    expect(turn.carried).toEqual(['research', 'interview', 'mock', 'spec']);
    expect(turn.moved).toEqual(['research', 'interview', 'mock', 'spec']);
    expect([card().stage, card().gate]).toEqual(['spec', 'spec']);
    expect(advanced()).toEqual(['research', 'interview', 'mock']);
    expect(card().events.filter(e => e.action === 'agent-start')).toHaveLength(1);
    const brief = readFileSync(join(dir, '.codeloop/state/briefs/c-001-research.md'), 'utf-8');
    for (const s of ['research', 'interview', 'mock', 'spec']) expect(brief).toContain(`test -f notes/${s}.md`);
    expect(brief).not.toContain('notes/data-model.md');
    // A lane whose carry runs past a gate, or skips around another stage, is refused.
    const past = parseLane(LANE.replace('  - id: data-model\n', '  - id: data-model\n    carry: early\n'));
    expect(lintLane(past).join('\n')).toMatch(/carry would run past it/);
    const gap = parseLane(LANE.replace('  - id: mock\n    carry: early\n', '  - id: mock\n'));
    expect(lintLane(gap).join('\n')).toMatch(/not consecutive/);
  }, 60_000);

  it('uc-313-02: stops right after the agent asks questions, and no later stage is checked on a guessed answer', async () => {
    project(agent(['research', 'interview', 'mock', 'spec'], { questions: true }));
    const turn = await orchTurn(dir, 'c-001');
    expect(turn.outcome).toBe('questions');
    expect(turn.note).toMatch(/waiting for answers: Q1/);
    expect(card().stage).toBe('interview');
    expect(advanced()).toEqual(['research']);
    expect(card().retries).toEqual({});
  }, 60_000);

  it('a turn that lands research and then asks questions still runs orch.after_merge for the landed work', async () => {
    project(agent(['research', 'interview', 'mock', 'spec'], { questions: true }));
    writeFileSync(join(dir, '.codeloop/config.yaml'), `${readFileSync(join(dir, '.codeloop/config.yaml'), 'utf-8')}  after_merge:\n    build: "echo built > .after-merge"\n`);
    const turn = await orchTurn(dir, 'c-001');
    expect(turn.outcome).toBe('questions');
    expect(turn.postMerge?.map(s => [s.name, s.exit])).toEqual([['build', 0]]);
    expect(existsSync(join(dir, '.after-merge'))).toBe(true);
  }, 60_000);

  it('uc-313-03: ends at the first failed stage check, names it on the story and moves no later stage', async () => {
    project(agent(['research', 'interview', 'spec']));
    const turn = await orchTurn(dir, 'c-001');
    expect(turn.outcome).toBe('failed');
    expect(turn.findings.join(' ')).toMatch(/stage check on mock failed/);
    expect(card().stage).toBe('mock');
    expect(card().retries).toEqual({ mock: 1 });
    expect(advanced()).toEqual(['research', 'interview']);
    expect(card().events.some(e => e.action === 'fail' && e.stage === 'mock')).toBe(true);
  }, 60_000);

  it('uc-313-04: a stage file the agent skipped stops the carry at that stage', async () => {
    project(agent(['research', 'mock', 'spec']));
    const turn = await orchTurn(dir, 'c-001');
    expect(turn.outcome).toBe('failed');
    expect(turn.findings.join(' ')).toMatch(/stage check on interview failed/);
    expect(card().stage).toBe('interview');
    expect(advanced()).toEqual(['research']);
  }, 60_000);

  it('uc-313-05: the time limit is summed over the carried stages, so a long carry is not killed at one stage\'s limit', async () => {
    // 0.03 minutes is 1.8 s per stage; the agent takes about 3 s, inside four stages' 7.2 s.
    project(agent(['research', 'interview', 'mock', 'spec'], { sleep: 3 }), 0.03);
    const turn = await orchTurn(dir, 'c-001');
    expect(turn.findings).toEqual([]);
    expect(card().stage).toBe('spec');
    expect(turn.timeoutMinutes).toBeCloseTo(0.12);
  }, 60_000);

  it('uc-313-07: every carried stage the agent reached gets its own agent-run, pointing at the one log', async () => {
    project(agent(['research', 'interview', 'spec']));
    const turn = await orchTurn(dir, 'c-001');
    const runs = card().events.filter(e => e.action === 'agent-run');
    expect(runs.map(e => e.stage)).toEqual(['research', 'interview', 'mock']);
    expect(new Set(runs.map(e => e.log))).toEqual(new Set([turn.log]));
    // The failure is counted on the stage that failed, not on the stage the turn started at.
    expect(card().retries).toEqual({ mock: 1 });
  }, 60_000);
});

describe('review folded into verify for an S story', () => {
  const FOLD = 'id: build\nversion: 1\nretries: 3\nmetric: { name: m, source: cards }\nstages:\n  - id: build\n    done: { cmd: "true" }\n  - id: verify\n    fold: review\n    done: { cmd: "true" }\n    gate: { name: local, approver: owner }\n  - id: review\n    when: "size >= M"\n    skill: review\n    output: notes/review.md\n    done: { cmd: "true" }\n    gate: { name: pr, approver: reviewer }\n  - id: staging\n    done: { cmd: "false" }\n';
  const lane = () => {
    mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
    writeFileSync(join(dir, '.codeloop/config.yaml'), 'project:\n  name: demo\n');
    writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), FOLD);
  };

  it('uc-313-06: an S story runs the review triage in verify and still waits for the reviewer before it moves on', () => {
    lane();
    createCard(dir, { lane: 'build', title: 'Fix the date on the post', id: 'c-001', fields: { size: 'S' } });
    advanceCard(dir, 'c-001');
    expect(card().stage).toBe('verify');
    expect(buildBrief(dir, card())).toMatch(/## Folded in: review[\s\S]*Write notes\/review\.md[\s\S]*pr gate still asks the reviewer/);
    expect(advanceCard(dir, 'c-001').outcome).toBe('parked');
    expect([card().gate, card().awaiting]).toEqual(['local', 'owner']);
    approveCard(dir, 'c-001', 'owner');
    expect(advanceCard(dir, 'c-001').outcome).toBe('parked');
    expect([card().stage, card().gate, card().awaiting]).toEqual(['verify', 'pr', 'reviewer']);
    expect(() => approveCard(dir, 'c-001', 'owner')).toThrow(/needs reviewer/);
    approveCard(dir, 'c-001', 'reviewer');
    expect(advanceCard(dir, 'c-001').outcome).toBe('moved');
    expect(card().stage).toBe('staging');
    expect(card().events.find(e => e.action === 'skip')?.stage).toBe('review');
  });

  it('an M story keeps its own review stage and verify asks only its own gate', () => {
    lane();
    createCard(dir, { lane: 'build', title: 'Founders can read the launch post', id: 'c-001', fields: { size: 'M' } });
    advanceCard(dir, 'c-001');
    expect(buildBrief(dir, card())).not.toContain('Folded in');
    advanceCard(dir, 'c-001');
    approveCard(dir, 'c-001', 'owner');
    expect(advanceCard(dir, 'c-001').outcome).toBe('moved');
    expect(card().stage).toBe('review');
  });
});

describe('codeloop stats counts agent starts per story', () => {
  it('US5: a carried M story reaches the spec gate after one agent start; an S story counts its starts from build on', async () => {
    project(agent(['research', 'interview', 'mock', 'spec']));
    await orchTurn(dir, 'c-001');
    createCard(dir, { lane: 'build', title: 'Fix the date on the post', id: 'c-002', fields: { size: 'S' } });
    placeCard(dir, 'c-002', 'build', 'owner');
    recordEvent(dir, 'c-002', () => ({ action: 'agent-start', agent: 'fake', log: 'a.log' }));
    recordEvent(dir, 'c-002', () => ({ action: 'agent-run', agent: 'fake', exit: 0, log: 'a.log' }));
    recordEvent(dir, 'c-002', () => ({ action: 'agent-start', agent: 'fake', log: 'b.log' }));
    const stats = computeStats(readCards(dir).cards, loadLanes(dir));
    expect(stats.agent_starts).toEqual([
      { card: 'c-001', size: 'M', to_first_gate: 1, from_build: null },
      { card: 'c-002', size: 'S', to_first_gate: null, from_build: 2 },
    ]);
    expect(stats.agent_starts_by_size.M.to_first_gate).toBe(1);
  }, 60_000);
});
