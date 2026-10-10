import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConflictError, readCards, writeCards } from '../cards.js';
import { advanceCard, approveCard, createCard, rejectCard, RefusalError } from '../engine.js';
import { lintLane, loadLane, parseLane } from '../lane.js';
import { evalProposal, promote, propose, rollback } from '../proposals.js';
import { runDue } from '../run.js';

let dir: string;

function writeLane(id: string, body: string): void {
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, `.codeloop/lanes/${id}.yaml`), `id: ${id}\nversion: 1\nmetric: { name: m, source: cards }\n${body}`);
}

// One gated stage whose check passes once out.md exists.
const GATED = `stages:
  - id: draft
    done: { cmd: "test -f out.md" }
    gate: { name: copy, approver: owner }
  - id: ship
    done: { cmd: "true" }
`;

function parkOnCopyGate(id: string): void {
  writeFileSync(join(dir, 'out.md'), 'x');
  createCard(dir, { lane: 'market', title: 't', id });
  expect(advanceCard(dir, id).outcome).toBe('parked');
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-lane-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('card store', () => {
  it('rejects a write made from a stale read', () => {
    writeLane('market', GATED);
    const stale = readCards(dir);
    createCard(dir, { lane: 'market', title: 'first' });

    expect(() => writeCards(dir, stale, [])).toThrow(ConflictError);
    expect(readCards(dir).cards.map(c => c.title)).toEqual(['first']);
  });
});

describe('engine', () => {
  it('keeps the card in its stage when the check fails, and parks it as stuck at the retry limit', () => {
    writeLane('market', `retries: 2\nstages:\n  - id: draft\n    done: { cmd: "echo no brief >&2; exit 1" }\n`);
    createCard(dir, { lane: 'market', title: 't', id: 'c-1' });

    const first = advanceCard(dir, 'c-1');
    expect(first.outcome).toBe('failed');
    expect(first.card.stage).toBe('draft');
    expect(first.card.gate).toBeUndefined();

    const second = advanceCard(dir, 'c-1');
    expect(second.outcome).toBe('stuck');
    expect(second.card).toMatchObject({ stage: 'draft', gate: 'stuck', awaiting: 'owner' });
    expect(second.card.events.at(-1)).toMatchObject({ action: 'stuck', note: 'no brief' });
  });

  it('refuses to advance a parked card', () => {
    writeLane('market', GATED);
    parkOnCopyGate('c-1');

    expect(() => advanceCard(dir, 'c-1')).toThrow(RefusalError);
    expect(readCards(dir).cards[0].stage).toBe('draft');
  });

  it('refuses an agent approval and accepts the owner', () => {
    writeLane('market', GATED);
    parkOnCopyGate('c-1');

    expect(() => approveCard(dir, 'c-1', 'agent')).toThrow(RefusalError);
    expect(readCards(dir).cards[0].gate).toBe('copy');

    approveCard(dir, 'c-1', 'owner');
    expect(advanceCard(dir, 'c-1').card.stage).toBe('ship');
  });

  it('stops at an outward gate in trusted mode while auto-approving the others', () => {
    mkdirSync(join(dir, '.codeloop'), { recursive: true });
    writeFileSync(join(dir, '.codeloop/config.yaml'), 'gates:\n  mode: trusted\n');
    writeLane('market', `stages:
  - id: draft
    done: { cmd: "true" }
    gate: { name: copy, approver: owner }
  - id: publish
    done: { cmd: "true" }
    gate: { name: publish, approver: owner, outward: true }
`);
    createCard(dir, { lane: 'market', title: 't', id: 'c-1' });

    const draft = advanceCard(dir, 'c-1');
    expect(draft.card.events.some(e => e.action === 'auto-approve' && e.stage === 'draft')).toBe(true);
    expect(draft.card).toMatchObject({ stage: 'publish', gate: 'publish', awaiting: 'owner' });
  });

  it('parks on an outward gate when the card enters the stage, before its check has ever run', () => {
    writeLane('market', `stages:
  - id: draft
    done: { cmd: "true" }
  - id: publish
    done: { cmd: "touch published.marker" }
    gate: { name: publish, approver: owner, outward: true }
`);
    createCard(dir, { lane: 'market', title: 't', id: 'c-1' });

    expect(advanceCard(dir, 'c-1').card).toMatchObject({ stage: 'publish', gate: 'publish', awaiting: 'owner' });
    expect(() => advanceCard(dir, 'c-1')).toThrow(RefusalError);
    expect(existsSync(join(dir, 'published.marker'))).toBe(false);

    approveCard(dir, 'c-1', 'owner');
    const after = advanceCard(dir, 'c-1');
    expect(existsSync(join(dir, 'published.marker'))).toBe(true);
    expect(after.card.stage).toBe('done');
    expect(after.card.gate).toBeUndefined();
  });

  it('starts one follow-on card when on_done.start and a lane.done trigger name the same lane', () => {
    writeLane('build', `on_done: { start: market }\nstages:\n  - id: ship\n    done: { cmd: "true" }\n`);
    writeLane('market', `trigger: { on: lane.done, lane: build }\nstages:\n  - id: brief\n    done: { cmd: "true" }\n`);
    writeLane('learn', `trigger: { on: lane.done, lane: build }\nstages:\n  - id: capture\n    done: { cmd: "true" }\n`);
    createCard(dir, { lane: 'build', title: 't', id: 'c-1' });

    advanceCard(dir, 'c-1');
    expect(readCards(dir).cards.map(c => c.lane).sort()).toEqual(['build', 'learn', 'market']);
  });
});

describe('lint', () => {
  it('reports a stage with no done check', () => {
    const errors = lintLane(parseLane('id: x\nversion: 1\nmetric: { name: m, source: s }\nstages:\n  - id: draft\n    skill: blog\n'));
    expect(errors).toEqual(['lane x stage draft: no done check (cmd or event)']);
  });
});

describe('run --due', () => {
  it('creates exactly one card per due cron slot', () => {
    writeLane('triage', `trigger: { cron: "0 20 * * *" }\nstages:\n  - id: capture\n    done: { cmd: "false" }\n`);
    const inLane = () => readCards(dir).cards.filter(c => c.lane === 'triage').length;

    runDue(dir, new Date(2026, 9, 5, 20, 5));
    expect(inLane()).toBe(1);
    runDue(dir, new Date(2026, 9, 5, 20, 30));
    expect(inLane()).toBe(1);
    runDue(dir, new Date(2026, 9, 6, 20, 0));
    expect(inLane()).toBe(2);
  });
});

describe('run --due git triggers', () => {
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'pipe' });

  it('creates one card per HEAD, however often it runs', () => {
    writeLane('deploy', `trigger: { on: git.commit }\nstages:\n  - id: staging\n    done: { cmd: "false" }\n`);
    git('init', '-q');
    git('commit', '-q', '--allow-empty', '-m', 'one');
    const inLane = () => readCards(dir).cards.filter(c => c.lane === 'deploy').length;

    runDue(dir);
    runDue(dir);
    expect(inLane()).toBe(1);

    git('commit', '-q', '--allow-empty', '-m', 'two');
    runDue(dir);
    expect(inLane()).toBe(2);
  });
});

describe('lane proposals', () => {
  function rejectTimes(n: number): void {
    writeLane('market', GATED);
    parkOnCopyGate('c-1');
    for (let i = 0; i < n; i++) {
      rejectCard(dir, 'c-1', 'owner', `too vague ${i}`);
      advanceCard(dir, 'c-1');
    }
  }

  // A proposal that changes the draft check, with one fixture the caller chooses.
  function proposalWithCheck(cmd: string, setup: string): string {
    rejectTimes(3);
    const [id] = propose(dir);
    const base = join(dir, '.codeloop/proposals', id);
    writeFileSync(join(base, 'lane.yaml'), readFileSync(join(base, 'lane.yaml'), 'utf-8').replace('test -f out.md', cmd));
    writeFileSync(join(base, 'eval.yaml'), `fixtures:\n  - name: broken\n    setup: "${setup}"\n    expect: fail\n`);
    return id;
  }

  it('proposes at three rejections of a gate and not at two', () => {
    rejectTimes(2);
    expect(propose(dir)).toEqual([]);

    rejectCard(dir, 'c-1', 'owner', 'too vague 2');
    expect(propose(dir)).toEqual(['market-draft-1']);

    const proposed = parseLane(readFileSync(join(dir, '.codeloop/proposals/market-draft-1/lane.yaml'), 'utf-8'));
    expect(proposed.version).toBe(2);
    expect(proposed.stages[0].notes).toEqual(['too vague 0', 'too vague 1', 'too vague 2']);
  });

  it('refuses a changed check that passes on its failing fixture', () => {
    const id = proposalWithCheck('test -f out.md || true', 'echo empty > other.md');

    const result = evalProposal(dir, id);
    expect(result.exitCode).toBe(4);
    expect(result.green).toBe(false);
    expect(result.fixtures).toEqual([{ stage: 'draft', fixture: 'broken', expect: 'fail', got: 'pass', ok: false }]);
  });

  it('refuses to promote without a green eval', () => {
    const id = proposalWithCheck('test -f out.md || true', 'echo empty > other.md');

    expect(() => promote(dir, id, 'owner')).toThrow(/not been evaluated/);
    evalProposal(dir, id);
    expect(() => promote(dir, id, 'owner')).toThrow(/failed its eval/);
    expect(loadLane(dir, 'market').version).toBe(1);
  });

  it('fails the eval when a finished card fails the stricter check, unless the regression is accepted', () => {
    writeLane('market', `stages:\n  - id: draft\n    done: { cmd: "test -f {id}.md" }\n`);
    writeFileSync(join(dir, 'c-1.md'), 'claim without proof');
    createCard(dir, { lane: 'market', title: 't', id: 'c-1' });
    expect(advanceCard(dir, 'c-1').outcome).toBe('done');

    const base = join(dir, '.codeloop/proposals/strict');
    mkdirSync(base, { recursive: true });
    writeFileSync(join(base, 'lane.yaml'), readFileSync(join(dir, '.codeloop/lanes/market.yaml'), 'utf-8').replace('version: 1', 'version: 2').replace('test -f {id}.md', 'grep -q proof: {id}.md'));
    const fixtures = `fixtures:\n  - name: no-proof\n    setup: "echo claim > eval-001.md"\n    expect: fail\n`;
    writeFileSync(join(base, 'eval.yaml'), fixtures);

    const red = evalProposal(dir, 'strict');
    expect(red.exitCode).toBe(1);
    expect(red.replay[0]).toMatch(/card c-1 finished, but its draft output fails the new check/);
    expect(red.replayed).toEqual([{ card: 'c-1', stage: 'draft', passed: false, accepted: false }]);

    writeFileSync(join(base, 'eval.yaml'), `${fixtures}accept_regressions: [c-1]\n`);
    expect(evalProposal(dir, 'strict').green).toBe(true);
  });

  it('rollback restores the lane that was live before a promotion', () => {
    const id = proposalWithCheck('grep -q claim out.md', 'echo no-such-word > out.md');
    const before = readFileSync(join(dir, '.codeloop/lanes/market.yaml'), 'utf-8');

    expect(evalProposal(dir, id).green).toBe(true);
    promote(dir, id, 'owner');
    expect(loadLane(dir, 'market').version).toBe(2);

    rollback(dir, 'market', 'owner');
    expect(readFileSync(join(dir, '.codeloop/lanes/market.yaml'), 'utf-8')).toBe(before);
    expect(existsSync(join(dir, '.codeloop/lanes/.history/market.v1.yaml'))).toBe(false);
  });
});
