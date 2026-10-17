import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readCards, type Card } from '../cards.js';
import { placeCard } from '../engine.js';
import { readQuestions } from '../interview.js';
import { readReviewState, reportLines, reviewPass } from '../review-pass.js';
import { doctorTick } from '../run.js';

let dir: string;
const at = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}
function git(args: string[], env: Record<string, string> = {}): string {
  const run = spawnSync('git', args, { cwd: dir, encoding: 'utf-8', env: { ...process.env, ...env } });
  if (run.status !== 0) throw new Error(`git ${args.join(' ')}: ${run.stderr}`);
  return run.stdout.trim();
}
/** One commit on main carrying the card's trailer, touching `files`. */
function commit(card: string, files: string[], subject = `feat: work for ${card}`, env: Record<string, string> = {}): string {
  for (const f of files) write(f, `${f} ${Math.random()}\n`);
  git(['add', ...files]);
  git(['commit', '-q', '-m', subject, '-m', `Card: ${card}`], env);
  return git(['rev-parse', 'HEAD']);
}

const LANE = `id: build
version: 1
metric: { name: m, source: cards }
retries: 3
stages:
  - id: research
    output: "{spec}/research.md"
    done: { cmd: "false" }
  - id: interview
    output: "{spec}/interview.md"
    done: { cmd: "false" }
  - id: spec
    output: "{spec}/tasks.md"
    done: { cmd: "false" }
    gate: { name: spec, approver: owner }
  - id: build
    done: { cmd: "false" }
  - id: verify
    output: evidence/{nnn}/verify.md
    done: { cmd: "false" }
    gate: { name: local, approver: owner }
  - id: review
    output: evidence/{nnn}/review.md
    done: { cmd: "false" }
    gate: { name: pr, approver: reviewer }
`;

const approve = (stage: string) => ({ at: at(2), actor: 'owner', human: true, action: 'approve', stage });
const card = (id: string, extra: Partial<Card> = {}): Card => ({ id, title: `Story ${id}`, lane: 'build', laneVersion: 1, stage: 'research', retries: {}, evidence: [], events: [], createdAt: at(100), updatedAt: at(5), spec: `specs/${id}`, ...extra });
function board(cards: Card[]): void {
  for (const c of cards) mkdirSync(join(dir, c.spec!), { recursive: true });
  write('.codeloop/cards.json', JSON.stringify({ version: 1, cards }, null, 2));
}
const find = (id: string) => readCards(dir).cards.find(c => c.id === id)!;
const reviewQuestions = (id: string) => readQuestions(dir, find(id)).filter(q => q.question.startsWith('Review:'));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-review-'));
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 't@example.com']);
  git(['config', 'user.name', 'T']);
  write('.codeloop/lanes/build.yaml', LANE);
  write('.codeloop/config.yaml', 'git:\n  trunk: main\nmock:\n  target: app\n  app_dir: workspace/app\n');
  commit('c-0', ['README.md'], 'chore: start');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('the review pass', () => {
  it('uc-307-01: never moves a story past a gate it never crossed, and closes only when every gate left is approved', () => {
    const sha = commit('c-1', ['src/a.ts']);
    commit('c-2', ['src/b.ts']);
    commit('c-3', ['src/c.ts']);
    commit('c-4', ['src/d.ts']);
    board([
      card('c-1', { gate: 'stuck', awaiting: 'owner', retries: { research: 3 } }),
      card('c-2', { stage: 'spec', gate: 'spec', awaiting: 'owner' }),
      card('c-3', { stage: 'verify', events: [approve('verify'), approve('review')] }),
      card('c-4', { stage: 'verify', events: [approve('verify')] }),
    ]);

    const report = reviewPass(dir, { all: true });

    // Stuck at research with merged code: placed at spec, the gated stage, not at build past it.
    expect(find('c-1').stage).toBe('spec');
    const placed = find('c-1').events.find(e => e.action === 'place')!;
    expect(placed.actor).toBe('orchestrator');
    expect(placed.note).toContain(sha.slice(0, 8));
    // Waiting at the spec gate: asked, not moved.
    expect(find('c-2').stage).toBe('spec');
    expect(find('c-2').gate).toBe('spec');
    expect(reviewQuestions('c-2').map(q => q.question)[0]).toMatch(/^Review: gate spec at spec\./);
    // Every gate left approved: closed. The pr gate still ahead: left alone.
    expect(find('c-3').stage).toBe('done');
    expect(find('c-3').events.at(-1)).toMatchObject({ actor: 'orchestrator', action: 'close' });
    expect(find('c-4').stage).toBe('verify');
    expect(report.fixed.map(l => [l.id, l.verb])).toEqual([['c-1', 'place'], ['c-3', 'close']]);
    // The engine refuses the same move from the orchestrator role, whoever plans it.
    expect(() => placeCard(dir, 'c-1', 'build', 'agent', { review: { commits: [sha] } })).toThrow(/spec gate at spec lies between/);
  });

  it('uc-307-02: docs-only and mock-only commits are not merged work', () => {
    commit('c-5', ['docs/notes.md', 'workspace/app/mocks/c-5/page.tsx', 'specs/c-5/research.md', '.codeloop/wiki/x.md']);
    board([card('c-5', { gate: 'stuck', awaiting: 'owner', retries: { research: 3 } })]);

    const report = reviewPass(dir, { all: true });

    expect(find('c-5').stage).toBe('research');
    expect(find('c-5').events.some(e => e.action === 'place')).toBe(false);
    expect(report.fixed).toEqual([]);
  });

  it('uc-307-03: a stage passed over is written from the merged work, never marked skipped', () => {
    const sha = commit('c-1', ['src/a.ts']);
    board([card('c-1', { gate: 'stuck', awaiting: 'owner', retries: { research: 3 } })]);

    reviewPass(dir, { all: true });

    const events = find('c-1').events;
    expect(events.some(e => e.action === 'skip')).toBe(false);
    expect(events.filter(e => e.action === 'review-write').map(e => e.stage)).toEqual(['research']);
    const research = readFileSync(join(dir, 'specs/c-1/research.md'), 'utf-8');
    expect(research).toContain(sha.slice(0, 8));
    expect(research).toMatch(/^- source: src\/a\.ts/m);
    expect(research).toMatch(/^verdict: build$/m);
  });

  it('uc-307-04: each gap the review step finds becomes an inbox question with a recommended answer', () => {
    commit('c-1', ['src/a.ts']);
    board([card('c-1', { gate: 'stuck', awaiting: 'owner', retries: { research: 3 } })]);

    reviewPass(dir, { all: true });

    const [q] = reviewQuestions('c-1');
    expect(q.question).toMatch(/^Review: gaps in research, interview\./);
    expect(q.question).toContain('research: The pain, grounded');
    expect(q.question).toContain('interview: the questions it would ask');
    expect(q.recommended).not.toBe('');
    expect(q.answer).toBe('');
  });

  it('uc-307-05: the pass before each pick reads only stories changed since the last pass', async () => {
    commit('c-1', ['src/a.ts']);
    commit('c-2', ['src/b.ts']);
    board([card('c-1', { stage: 'build' }), card('c-2', { stage: 'build' })]);

    await doctorTick(dir, new Date(), { noChecks: true });
    expect(readReviewState(dir)?.report.read).toBe(2);

    await doctorTick(dir, new Date(), { noChecks: true });
    expect(readReviewState(dir)?.report.read).toBe(0);

    // A commit carrying c-2's id lands after the last pass: only c-2 is read again.
    commit('c-2', ['src/b2.ts'], 'feat: more for c-2', { GIT_COMMITTER_DATE: new Date(Date.now() + 120_000).toISOString() });
    await doctorTick(dir, new Date(Date.now() + 180_000), { noChecks: true });
    expect(readReviewState(dir)?.report.read).toBe(1);
  });

  it('uc-307-06: a full review stops at the run budget and leaves the cursor for the next pass', () => {
    commit('c-1', ['src/a.ts']);
    commit('c-2', ['src/b.ts']);
    write('.codeloop/config.yaml', 'git:\n  trunk: main\norch:\n  budget:\n    turns: 1\n');
    board([card('c-1', { gate: 'stuck', awaiting: 'owner' }), card('c-2', { gate: 'stuck', awaiting: 'owner' })]);

    const report = reviewPass(dir, { all: true });

    expect(report.fixed.map(l => l.id)).toEqual(['c-1']);
    expect(find('c-2').stage).toBe('research');
    expect(report.stopped).toMatch(/^budget: 1 turns used/);
    expect(readReviewState(dir)?.at).toBeUndefined();
    expect(reportLines(report)[0]).toBe('review pass: read 1 story, stopped: budget: 1 turns used (orch.budget.turns is 1)');
  });

  it('uc-307-07: two passes never ask the same question twice on one story', () => {
    commit('c-2', ['src/b.ts']);
    board([card('c-2', { stage: 'spec', gate: 'spec', awaiting: 'owner' })]);

    const first = reviewPass(dir, { all: true });
    const second = reviewPass(dir, { all: true });

    expect(first.asked.map(l => l.id)).toEqual(['c-2']);
    expect(second.asked).toEqual([]);
    expect(reviewQuestions('c-2')).toHaveLength(1);
    expect(existsSync(join(dir, 'specs/c-2/interview.md'))).toBe(true);
  });
});
