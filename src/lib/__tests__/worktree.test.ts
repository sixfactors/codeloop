import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { cardActivity, ensureStoryWorktree, mergeStory, recordHandback, removeStoryWorktree, runGate } from '../services.js';
import { RefusalError, readCards } from '../cards.js';
import { createCard } from '../engine.js';

let root: string;
let dir: string;
const sh = (cmd: string, cwd = dir) => execSync(cmd, { cwd, encoding: 'utf8' }).trim();
const GIT = 'git -c user.email=a@b -c user.name=t';

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-wt-')));
  dir = join(root, 'demo');
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/config.yaml'), 'project:\n  name: demo\n');
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: code\n    done: { cmd: "true" }\n');
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  sh(`git init -q -b main && git add -A && ${GIT} commit -qm init`);
  createCard(dir, { lane: 'build', title: 'Founders can read the launch post' });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const land = (wt: string, file = 'b.txt') => {
  writeFileSync(join(wt, file), 'b\n');
  sh(`git add -A && ${GIT} commit -qm work`, wt);
  const head = sh('git rev-parse HEAD', wt);
  recordHandback(dir, 'c-001', { branch: sh('git rev-parse --abbrev-ref HEAD', wt), head, proof: 'true', worktree: wt });
  return runGate(dir, 'c-001');
};

describe('ensureStoryWorktree', () => {
  it('creates the worktree and branch and records both on the card, then reuses them', () => {
    const first = ensureStoryWorktree(dir, 'c-001');
    expect(first.created).toBe(true);
    expect(first.path).toBe(join(root, 'demo-wt-c-001'));
    expect(first.branch).toBe('feat/build-founders-can-read-the-launch-post');
    expect(sh('git rev-parse --abbrev-ref HEAD', first.path)).toBe(first.branch);
    const card = readCards(dir).cards[0];
    expect(card.worktree).toBe(first.path);
    expect(card.branch).toBe(first.branch);
    expect(cardActivity(dir, 'c-001').lines.some(l => l.kind === 'worktree')).toBe(true);

    const second = ensureStoryWorktree(dir, 'c-001');
    expect(second).toMatchObject({ created: false, path: first.path, branch: first.branch });
  });
});

describe('mergeStory with a trunk that moved', () => {
  const commitOn = (cwd: string, file: string, text: string) => {
    mkdirSync(join(cwd, file, '..'), { recursive: true });
    writeFileSync(join(cwd, file), text);
    sh(`git add -A && ${GIT} commit -qm ${file.replace(/\W/g, '_')}`, cwd);
  };
  const handBack = (wt: string) => {
    recordHandback(dir, 'c-001', { branch: sh('git rev-parse --abbrev-ref HEAD', wt), head: sh('git rev-parse HEAD', wt), proof: 'true', worktree: wt });
    return runGate(dir, 'c-001');
  };

  it('takes the branch version of a story file the trunk also added, and names it', () => {
    const w = ensureStoryWorktree(dir, 'c-001');
    commitOn(w.path, 'specs/001-x/research.md', 'branch research\n');
    commitOn(dir, 'specs/001-x/research.md', 'scaffold stub\n');
    expect(handBack(w.path).verdict).toBe('pass');
    const merged = mergeStory(dir, 'c-001');
    expect(merged.resolved).toEqual(['specs/001-x/research.md']);
    expect(readFileSync(join(dir, 'specs/001-x/research.md'), 'utf8')).toBe('branch research\n');
    expect(existsSync(join(dir, '.git/MERGE_HEAD'))).toBe(false);
    expect(cardActivity(dir, 'c-001').lines.find(l => l.kind === 'merge')?.resolved).toEqual(['specs/001-x/research.md']);
  });

  it('aborts on a conflict outside the story folders, leaves no merge in progress and names the file', () => {
    const w = ensureStoryWorktree(dir, 'c-001');
    commitOn(w.path, 'src/a.ts', 'branch\n');
    commitOn(dir, 'src/a.ts', 'trunk\n');
    expect(handBack(w.path).verdict).toBe('pass');
    expect(() => mergeStory(dir, 'c-001')).toThrow(/merge conflict in src\/a\.ts: merge the trunk into the branch and hand back again/);
    expect(existsSync(join(dir, '.git/MERGE_HEAD'))).toBe(false);
    expect(readFileSync(join(dir, 'src/a.ts'), 'utf8')).toBe('trunk\n');
  });
});

describe('mergeStory', () => {
  it('refuses with no passing gate', () => {
    ensureStoryWorktree(dir, 'c-001');
    expect(() => mergeStory(dir, 'c-001')).toThrow(RefusalError);
    expect(() => mergeStory(dir, 'c-001')).toThrow(/no gate record/);
  });

  it('fast-forwards a gated branch into the trunk and records the merge on the card', () => {
    const w = ensureStoryWorktree(dir, 'c-001');
    expect(land(w.path).verdict).toBe('pass');
    const result = mergeStory(dir, 'c-001');
    expect(result.mode).toBe('ff');
    expect(sh('git rev-parse HEAD')).toBe(result.sha);
    expect(existsSync(join(dir, 'b.txt'))).toBe(true);
    const events = readCards(dir).cards[0].events;
    expect(events.some(e => e.action === 'merge' && e.note?.includes(result.sha.slice(0, 8)))).toBe(true);
    expect(cardActivity(dir, 'c-001').lines.some(l => l.kind === 'merge' && l.sha === result.sha)).toBe(true);

    removeStoryWorktree(dir, 'c-001');
    expect(existsSync(w.path)).toBe(false);
    expect(sh(`git branch --list ${w.branch}`)).toContain(w.branch);
  });

  it('refuses when a file the branch changed is dirty in the main tree', () => {
    const w = ensureStoryWorktree(dir, 'c-001');
    land(w.path, 'a.txt');
    writeFileSync(join(dir, 'a.txt'), 'local edit\n');
    expect(() => mergeStory(dir, 'c-001')).toThrow(/overlap the branch: a\.txt/);
    expect(sh('git log --oneline').split('\n')).toHaveLength(1);
  });
});

describe('pruneWorktrees', () => {
  it('removes a worktree whose branch is merged and tree is clean, and keeps an unmerged or dirty one', async () => {
    const { pruneWorktrees } = await import('../worktree.js');
    const merged = ensureStoryWorktree(dir, 'c-001');
    expect(land(merged.path).verdict).toBe('pass');
    mergeStory(dir, 'c-001');
    createCard(dir, { lane: 'build', title: 'Founders can export invoices' });
    const open = ensureStoryWorktree(dir, 'c-002');
    writeFileSync(join(open.path, 'c.txt'), 'c\n');
    sh(`git add -A && ${GIT} commit -qm open`, open.path);

    expect(pruneWorktrees(dir, { dryRun: true }).filter(r => r.removed)).toEqual([]);
    const rows = pruneWorktrees(dir);
    expect(rows.find(r => r.path === merged.path)).toMatchObject({ removed: true });
    expect(rows.find(r => r.path === open.path)).toMatchObject({ removed: false, why: `${open.branch} is not merged into main` });
    expect(existsSync(merged.path)).toBe(false);
    expect(existsSync(open.path)).toBe(true);
    expect(readCards(dir).cards.find(c => c.id === 'c-001')!.worktree).toBeUndefined();
  });
});
