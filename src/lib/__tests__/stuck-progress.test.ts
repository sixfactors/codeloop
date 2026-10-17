import { execSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readCards } from '../cards.js';
import { storyCommits } from '../diff-budget.js';
import { ensureStoryWorktree, liveState, showCard } from '../services.js';
import { doctorTick } from '../run.js';

let root: string;
let dir: string;
const sh = (cmd: string, cwd = dir) => execSync(cmd, { cwd, encoding: 'utf8' }).trim();
const GIT = 'git -c user.email=a@b -c user.name=t';
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
};
const STUCK_AT = new Date(Date.now() - 3 * 3_600_000).toISOString();
const card = (extra: Record<string, unknown> = {}) => ({
  id: 'c-1', title: 'Card c-1', lane: 'build', laneVersion: 1, stage: 'draft', retries: { draft: 3 }, evidence: [], createdAt: STUCK_AT, updatedAt: STUCK_AT, spec: 'specs/001', gate: 'stuck', awaiting: 'owner',
  events: [{ at: STUCK_AT, actor: 'engine', human: false, action: 'fail', stage: 'draft', note: '20 of 20 tasks open' }, { at: STUCK_AT, actor: 'engine', human: false, action: 'stuck', stage: 'draft', note: '20 of 20 tasks open' }],
  ...extra,
});
const setCheck = (cmd: string) => write('.codeloop/lanes/build.yaml', `id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: draft\n    done: { cmd: "${cmd}" }\n  - id: ship\n    done: { cmd: "false" }\n`);

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-progress-')));
  dir = join(root, 'demo');
  mkdirSync(dir);
  setCheck('test -f out.md');
  write('.codeloop/config.yaml', 'project:\n  name: demo\n');
  write('.claude/keep', '');
  write('specs/001/tasks.md', '- [ ] T001 [api] first thing\n- [ ] T002 [ui] second thing\n');
  write('.codeloop/cards.json', JSON.stringify({ version: 1, cards: [card()] }, null, 2));
  write('a.txt', 'a\n');
  sh(`git init -q -b main && git add -A && ${GIT} commit -qm init`);
  // tasks.md was written "before" the card stuck.
  const past = new Date(Date.now() - 4 * 3_600_000);
  utimesSync(join(dir, 'specs/001/tasks.md'), past, past);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('storyCommits', () => {
  it('finds a trailered commit on a worktree branch as unmerged, then merged after the merge', () => {
    const wt = join(root, 'wt');
    sh(`git worktree add -q -b feat/c-1-work ${wt} main`);
    writeFileSync(join(wt, 'b.txt'), 'b\n');
    sh(`git add -A && ${GIT} commit -qm "feat: b" -m "Card: c-1"`, wt);
    writeFileSync(join(wt, 'other.txt'), 'x\n');
    sh(`git add -A && ${GIT} commit -qm "feat: other card" -m "Card: c-2"`, wt);

    const before = storyCommits(dir, 'c-1');
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ subject: 'feat: b', merged: false, branches: ['feat/c-1-work'] });

    sh(`${GIT} merge -q --no-ff -m merge feat/c-1-work`);
    expect(storyCommits(dir, 'c-1')[0].merged).toBe(true);
  });
});

describe('moving', () => {
  it('a stuck story with a newer tasks.md tick is moving; one with nothing newer is not', () => {
    expect(liveState(dir, readCards(dir).cards[0], 0)?.moving).toBeUndefined();
    write('specs/001/tasks.md', '- [x] T001 [api] first thing\n- [ ] T002 [ui] second thing\n');
    const s = liveState(dir, readCards(dir).cards[0], 0);
    expect(s).toMatchObject({ health: 'stuck', moving: true });
  });

  it('a trailered commit on a branch makes it moving', () => {
    sh(`git branch feat/c-1-work`);
    sh(`git checkout -q feat/c-1-work && ${GIT} commit -q --allow-empty -m "feat: x" -m "Card: c-1" && git checkout -q main`);
    expect(liveState(dir, readCards(dir).cards[0], 0)?.moving).toBe(true);
  });
});

describe('the doctor tick', () => {
  it('reruns the check of a moving stuck story and, on a pass, advances it and clears stuck', async () => {
    write('specs/001/tasks.md', '- [x] T001 [api] first thing\n- [x] T002 [ui] second thing\n');
    write('out.md', 'done\n');
    const actions = await doctorTick(dir, new Date());
    expect(actions.map(a => [a.id, a.action])).toEqual([['c-1', 'rerun-check']]);
    const after = readCards(dir).cards[0];
    expect(after.stage).toBe('ship');
    expect(after.gate).toBeUndefined();
  });

  it('leaves a moving stuck story stuck when the check still fails, and a second tick on unchanged work adds nothing', async () => {
    write('specs/001/tasks.md', '- [x] T001 [api] first thing\n- [ ] T002 [ui] second thing\n');
    // The first tick records its failed check at a whole-millisecond time and file times are finer,
    // so the work is dated a minute back to land plainly before that failure.
    const landed = new Date(Date.now() - 60_000);
    utimesSync(join(dir, 'specs/001/tasks.md'), landed, landed);
    utimesSync(join(dir, 'specs/001'), landed, landed);
    await doctorTick(dir, new Date());
    expect(readCards(dir).cards[0].gate).toBe('stuck');
    const events = readCards(dir).cards[0].events.length;
    await doctorTick(dir, new Date());
    expect(readCards(dir).cards[0].events.length).toBe(events);
  });
});

describe('card show', () => {
  it('lists the current tasks with ticks, the evidence files and the commits', () => {
    write('specs/001/tasks.md', '- [x] T001 [api] first thing\n- [ ] T002 [ui] second thing\n');
    write('evidence/001/review.md', 'ok\n');
    const shown = showCard(dir, 'c-1');
    expect(shown.tasks).toEqual([{ id: 'T001', done: true, layer: 'api', text: 'first thing' }, { id: 'T002', done: false, layer: 'ui', text: 'second thing' }]);
    expect(shown.evidenceFiles.map(f => f.path)).toEqual(['evidence/001/review.md']);
    expect(shown.card.display?.moving).toBe(true);
  });
});

describe('ensureStoryWorktree', () => {
  it('renders the Claude hooks into the new worktree and records a hooks line', () => {
    const w = ensureStoryWorktree(dir, 'c-1');
    const settings = JSON.parse(readFileSync(join(w.path, '.claude/settings.json'), 'utf-8'));
    expect(Object.keys(settings.hooks).length).toBeGreaterThan(0);
    expect(existsSync(join(w.path, '.cursor/hooks.json'))).toBe(false);
    expect(w.hooks?.some(h => h.name === '.claude/settings.json')).toBe(true);
    expect(readFileSync(join(dir, '.codeloop/state/activity/c-1.jsonl'), 'utf-8')).toMatch(/"kind":"hooks"/);
  });
});
