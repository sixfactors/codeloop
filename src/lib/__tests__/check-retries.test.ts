import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendActivity } from '../activity.js';
import { resolveAgent } from '../agent.js';
import { readCards, stuckReason, writeCards } from '../cards.js';
import { advanceCard, createCard } from '../engine.js';
import { runDueWithAgent } from '../run.js';
import { newSpec } from '../spec.js';

let dir: string;
const lane = (cmd: string, output = 'out.md') => {
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/lanes/market.yaml'), `id: market\nversion: 1\nmetric: { name: m, source: cards }\nretries: 2\nstages:\n  - id: draft\n${output ? `    output: ${output}\n` : ''}    done: { cmd: "${cmd}" }\n`);
};
const fails = () => readCards(dir).cards[0].events.filter(e => e.action === 'fail').length;
const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'pipe' });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-retries-'));
  lane('echo no tasks >&2; exit 1');
  createCard(dir, { lane: 'market', title: 't', id: 'c-1' });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('a repeated check', () => {
  // Someone wrote the output: a missing file is no work at all (below).
  beforeEach(() => writeFileSync(join(dir, 'out.md'), 'a first draft'));

  it('does not count when nothing happened since the last identical failure', () => {
    advanceCard(dir, 'c-1');
    advanceCard(dir, 'c-1');
    const third = advanceCard(dir, 'c-1');
    expect(third.card.retries.draft).toBe(1);
    expect(third.outcome).toBe('failed');
    expect(third.card.gate).toBeUndefined();
    expect(third.card.events.filter(e => e.action === 'fail')).toHaveLength(3);
  });

  it('counts when an activity line sits between the two checks', () => {
    advanceCard(dir, 'c-1');
    appendActivity(dir, 'c-1', { kind: 'edit', file: 'a.md' });
    const second = advanceCard(dir, 'c-1');
    expect(second.card.retries.draft).toBe(2);
    expect(second.outcome).toBe('stuck');
  });

  it('counts when the failing output file changed', () => {
    advanceCard(dir, 'c-1');
    writeFileSync(join(dir, 'out.md'), 'now something');
    expect(advanceCard(dir, 'c-1').card.retries.draft).toBe(2);
  });

  it('does not count a recheck with only engine and doctor lines since the last failure, as a sweep leaves', () => {
    advanceCard(dir, 'c-1');
    appendActivity(dir, 'c-1', { kind: 'doctor', text: 'doctor reran the draft check' });
    appendActivity(dir, 'c-1', { kind: 'promote', text: 'lane upgraded' });
    // The cmd line a session's own `codeloop next` writes just before the check it runs.
    appendActivity(dir, 'c-1', { kind: 'cmd', text: 'codeloop next c-1' });
    const again = advanceCard(dir, 'c-1');
    expect(again.outcome).toBe('failed');
    expect(again.card.retries.draft).toBe(1);
    expect(again.card.gate).toBeUndefined();
    expect(fails()).toBe(2);
  });

  it('counts a new head commit on this story since the last failure, though the output is the same', () => {
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    advanceCard(dir, 'c-1');
    writeFileSync(join(dir, 'src.ts'), 'work');
    git('add', 'src.ts');
    git('commit', '-q', '-m', 'work on the story', '-m', 'Card: c-1');
    const second = advanceCard(dir, 'c-1');
    expect(second.card.retries.draft).toBe(2);
    expect(second.outcome).toBe('stuck');
  });

  it("does not count another story's commit in the shared tree, and counts an untrailered one in this story's plan", () => {
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    advanceCard(dir, 'c-1');
    writeFileSync(join(dir, 'other.ts'), 'theirs');
    git('add', 'other.ts');
    git('commit', '-q', '-m', 'another story lands', '-m', 'Card: c-2');
    const second = advanceCard(dir, 'c-1');
    expect(second.card.retries.draft).toBe(1);
    expect(second.outcome).toBe('failed');

    mkdirSync(join(dir, 'specs/c-1'), { recursive: true });
    writeFileSync(join(dir, 'specs/c-1/plan.md'), '# plan\n\n## Files\n\n- src/mine.ts\n');
    const file = readCards(dir);
    writeCards(dir, file, file.cards.map(c => ({ ...c, spec: 'specs/c-1' })));
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src/mine.ts'), 'mine');
    git('add', 'src/mine.ts');
    git('commit', '-q', '-m', 'work with no trailer');
    expect(advanceCard(dir, 'c-1').card.retries.draft).toBe(2);
  });
});

describe('a commit as work on the story', () => {
  // A first draft, so the first failure counts and keeps the head it ran on.
  beforeEach(() => {
    writeFileSync(join(dir, 'out.md'), 'a first draft');
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    expect(advanceCard(dir, 'c-1').card.retries.draft).toBe(1);
  });
  const commit = (file: string, ...message: string[]) => {
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, file), file);
    git('add', file);
    git('commit', '-q', ...message.flatMap(m => ['-m', m]));
  };

  it("counts a commit with no trailer for a story with no plan only when it touches a file of the story's own commits", () => {
    writeFileSync(join(dir, '.codeloop/lanes/market.yaml'), readFileSync(join(dir, '.codeloop/lanes/market.yaml'), 'utf-8').replace('retries: 2', 'retries: 4'));
    commit('src/chore.ts', 'chore: bump a version on main');
    expect(advanceCard(dir, 'c-1').card.retries.draft).toBe(1);
    commit('src/mine.ts', 'feat: the story', 'Card: c-1');
    expect(advanceCard(dir, 'c-1').card.retries.draft).toBe(2);
    writeFileSync(join(dir, 'src/mine.ts'), 'fixed');
    git('commit', '-qam', 'fix on main with no hook');
    expect(advanceCard(dir, 'c-1').card.retries.draft).toBe(3);
  });

  it("counts a commit carrying another story's trailer when it touches a file in this story's plan", () => {
    mkdirSync(join(dir, 'specs/c-1'), { recursive: true });
    writeFileSync(join(dir, 'specs/c-1/plan.md'), '# plan\n\n## Files\n\n- src/mine.ts\n');
    const file = readCards(dir);
    writeCards(dir, file, file.cards.map(c => ({ ...c, spec: 'specs/c-1' })));
    commit('src/mine.ts', 'feat: the branch story', 'A body of two\n\nparagraphs.', 'Feature: c-9');
    expect(advanceCard(dir, 'c-1').card.retries.draft).toBe(2);
  });

  it("reads the story's commits by time when the head the failure ran on is gone", () => {
    const file = readCards(dir);
    writeCards(dir, file, file.cards.map(c => ({ ...c, events: c.events.map(e => (e.action === 'fail' ? { ...e, head: '0'.repeat(40) } : e)) })));
    commit('src/rebased.ts', 'work after a rebase', 'Card: c-1');
    expect(advanceCard(dir, 'c-1').card.retries.draft).toBe(2);
  });
});

describe('a check with no work behind it', () => {
  it('spends no retry on a missing output, however often it runs, and still records each failure', () => {
    for (let i = 0; i < 3; i++) expect(advanceCard(dir, 'c-1').outcome).toBe('failed');
    const card = readCards(dir).cards[0];
    expect(card.retries.draft ?? 0).toBe(0);
    expect(card.gate).toBeUndefined();
    expect(fails()).toBe(3);
  });

  it('spends no retry before the spec folder exists, nor on the template spec new wrote', () => {
    lane("grep -q '^verdict: build' {spec}/research.md", '"{spec}/research.md"');
    advanceCard(dir, 'c-1');
    newSpec(dir, 'c-1');
    advanceCard(dir, 'c-1');
    appendActivity(dir, 'c-1', { kind: 'doctor', text: 'lane-upgrade sweep' });
    advanceCard(dir, 'c-1');
    const card = readCards(dir).cards[0];
    expect(card.retries.draft ?? 0).toBe(0);
    expect(card.gate).toBeUndefined();
    expect(fails()).toBe(3);
  });

  it('spends no retry on a stage with no output until a story commit is behind it, though the check writes into the tree', () => {
    lane('echo x >> checks.log; exit 1', '');
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    for (let i = 0; i < 3; i++) expect(advanceCard(dir, 'c-1').outcome).toBe('failed');
    expect(readCards(dir).cards[0].retries.draft ?? 0).toBe(0);
    createCard(dir, { lane: 'market', title: 'u', id: 'c-2' });
    git('commit', '-q', '--allow-empty', '-m', 'work on the story', '-m', 'Card: c-2');
    expect(advanceCard(dir, 'c-2').card.retries.draft).toBe(1);
  });

  it('counts an agent run that left the output missing, and parks the story stuck when the next start would change nothing', async () => {
    writeFileSync(join(dir, '.codeloop/config.yaml'), 'agents:\n  default: fake\n  fake: { cmd: "true" }\n');
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    await runDueWithAgent(dir, resolveAgent(dir));
    expect(readCards(dir).cards[0].retries.draft).toBe(1);
    await runDueWithAgent(dir, resolveAgent(dir));
    const card = readCards(dir).cards[0];
    expect(card.retries.draft).toBe(1);
    expect(card.gate).toBe('stuck');
    expect(stuckReason(card)).toBe('the agent ran and changed nothing; a person needs to look');
    expect(card.events.filter(e => e.action === 'agent-start')).toHaveLength(1);
  });
});
