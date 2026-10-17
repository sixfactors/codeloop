import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { orchCommand } from '../../commands/orch.js';
import { readCards, type Card } from '../cards.js';
import { placeCard } from '../engine.js';
import { readQuestions } from '../interview.js';
import { checkResearch } from '../research.js';
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
/** The engine's record of a check that passed and parked at the stage's gate. */
const passed = (stage: string, gate: string) => ({ at: at(3), actor: 'engine', action: 'park', stage, note: `gate ${gate} (after the check passed)` });
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
  write('.codeloop/config.yaml', 'git:\n  trunk: main\nmock:\n  target: app\n  app_dir: workspace/app\ndoctor:\n  review: on\n');
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
      card('c-3', { stage: 'review', events: [passed('review', 'pr'), approve('review')] }),
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

  it('uc-307-01: an approved gate is not a passed stage, so a story whose check never passed is not closed', () => {
    write('.codeloop/lanes/build.yaml', `${LANE}  - id: live
    output: evidence/{nnn}/prod.md
    done: { cmd: "false" }
    gate: { name: prod, approver: owner, outward: true }
`);
    commit('c-1', ['src/a.ts']);
    commit('c-2', ['src/b.ts']);
    board([
      // At live, approved on entry before the deploy ran, then the check failed: not done.
      card('c-1', { stage: 'live', events: [approve('live'), { at: at(1), actor: 'engine', action: 'fail', stage: 'live', note: 'no prod.md' }] }),
      // Approvals written for stages it never reached: review and live never passed.
      card('c-2', { stage: 'verify', events: [passed('verify', 'local'), approve('verify'), approve('review'), approve('live')] }),
    ]);

    const report = reviewPass(dir, { all: true });

    expect(find('c-1').stage).toBe('live');
    expect(find('c-2').stage).toBe('verify');
    expect(report.fixed).toEqual([]);
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
    expect(research).toMatch(/^- gap: source to confirm: src\/a\.ts/m);
  });

  it('uc-307-03: a drafted stage never passes its own check: no sources cited, no verdict, tasks unticked, each a gap', () => {
    commit('c-1', ['src/a.ts']);
    commit('c-2', ['src/b.ts']);
    board([
      card('c-1', { gate: 'stuck', awaiting: 'owner', retries: { research: 3 } }),
      card('c-2', { stage: 'spec', gate: 'stuck', awaiting: 'owner', retries: { spec: 3 } }),
    ]);

    reviewPass(dir, { all: true });

    expect(checkResearch(dir, 'c-1', 1).errors).toEqual([
      'specs/c-1/research.md has no line starting with "verdict:"',
      'specs/c-1/research.md cites 0 sources, needs 1 (`- source: <url or path> - <note>`)',
    ]);
    const tasks = readFileSync(join(dir, 'specs/c-2/tasks.md'), 'utf-8');
    expect(tasks).toMatch(/^- \[ \] T001 \[api\] feat: work for c-2/m);
    expect(tasks).not.toMatch(/^- \[x\]/m);
    expect(reviewQuestions('c-1')[0].question).toMatch(/research: Sources \(the changed files are listed to confirm; none is cited yet\).*research: verdict/);
    expect(reviewQuestions('c-2')[0].question).toMatch(/spec: tasks from the merged commits are unticked/);
  });

  it('uc-307-03: a stage file someone started is never replaced', () => {
    commit('c-7', ['src/g.ts']);
    board([card('c-7', { gate: 'stuck', awaiting: 'owner' })]);
    write('specs/c-7/research.md', '# Research\n\nPartial notes, no verdict yet.\n');

    reviewPass(dir, { all: true });

    expect(find('c-7').stage).toBe('spec');
    expect(readFileSync(join(dir, 'specs/c-7/research.md'), 'utf-8')).toBe('# Research\n\nPartial notes, no verdict yet.\n');
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

  it('uc-307-04: a full interview still lets the place land, and the gaps are asked past the interview cap', () => {
    commit('c-8', ['src/h.ts']);
    board([card('c-8', { gate: 'stuck', awaiting: 'owner' })]);
    write('specs/c-8/interview.md', [1, 2, 3, 4, 5].map(n => `## Q${n} Question ${n}?\nrecommended: yes\nanswer:\n`).join('\n'));

    const report = reviewPass(dir, { all: true });

    expect(find('c-8').stage).toBe('spec');
    expect(report.fixed[0].note).not.toMatch(/could not ask/);
    expect(reviewQuestions('c-8')[0]).toMatchObject({ kind: 'gap' });
  });

  it('the unattended doctor runs no review pass until doctor.review is on', async () => {
    write('.codeloop/config.yaml', 'git:\n  trunk: main\n');
    commit('c-1', ['src/a.ts']);
    board([card('c-1', { stage: 'build' })]);
    await doctorTick(dir, new Date(), { noChecks: true });
    expect(readReviewState(dir)).toBeUndefined();
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

  it('a process started by `run --agent` cannot run the review pass for real, only preview it', async () => {
    commit('c-1', ['src/a.ts']);
    board([card('c-1', { gate: 'stuck', awaiting: 'owner' })]);
    const errors: string[] = [];
    const err = vi.spyOn(console, 'error').mockImplementation((line: string) => void errors.push(line));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code: number) => { throw new Error(`exit ${code}`); }) as never);
    process.env.CODELOOP_PROJECT_DIR = dir;
    process.env.CODELOOP_AGENT_RUN = 'claude';
    try {
      await expect(orchCommand.parseAsync(['run', '--review'], { from: 'user' })).rejects.toThrow('exit 2');
      expect(errors.join('\n')).toMatch(/acts as agent/);
      expect(find('c-1').stage).toBe('research');
      await orchCommand.parseAsync(['run', '--review', '--dry-run'], { from: 'user' });
      expect(find('c-1').stage).toBe('research');
    } finally {
      delete process.env.CODELOOP_PROJECT_DIR;
      delete process.env.CODELOOP_AGENT_RUN;
      // Commander keeps option values between parses of the same command object.
      orchCommand.commands.find(c => c.name() === 'run')!.setOptionValue('dryRun', undefined);
      err.mockRestore();
      log.mockRestore();
      exit.mockRestore();
    }
  });

  it('US5: `orch run --review` prints fixed, asked and could-not-tell, each line naming its evidence', async () => {
    const placed = commit('c-1', ['src/a.ts']);
    const asked = commit('c-2', ['src/b.ts']);
    git(['checkout', '-q', '-b', 'side']);
    const side = commit('c-6', ['src/f.ts']);
    git(['checkout', '-q', 'main']);
    board([
      card('c-1', { gate: 'stuck', awaiting: 'owner' }),
      card('c-2', { stage: 'spec', gate: 'spec', awaiting: 'owner' }),
      card('c-6', { gate: 'stuck', awaiting: 'owner', retries: { research: 3 } }),
    ]);
    const printed: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((line: string) => void printed.push(line));
    process.env.CODELOOP_PROJECT_DIR = dir;
    try {
      await orchCommand.parseAsync(['run', '--review'], { from: 'user' });
    } finally {
      delete process.env.CODELOOP_PROJECT_DIR;
      log.mockRestore();
    }
    const text = printed.map(l => l.trim()).join('\n');
    expect(printed[0]).toBe('  review pass: read 3 stories');
    expect(text).toMatch(new RegExp(`fixed\\nc-1 place: .*\\(evidence: ${placed.slice(0, 8)}\\)`));
    expect(text).toMatch(new RegExp(`asked\\nc-2 ask: .*\\(evidence: ${asked.slice(0, 8)}\\)`));
    expect(text).toMatch(new RegExp(`could not tell\\nc-6 unclear: its work is on side and not merged.*\\(evidence: ${side.slice(0, 8)}\\)`));
  });
});
