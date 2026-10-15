import { execSync } from 'child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';
import { storyCommits, storyCommitTimes, withCommitIndex } from '../diff-budget.js';

let dir: string;
const sh = (c: string) => execSync(c, { cwd: dir, encoding: 'utf8' }).trim();
const commit = (file: string, msg: string) => {
  writeFileSync(join(dir, file), file);
  sh(`git add -A && git -c user.email=a@b -c user.name=t commit -q -m "${msg}"`);
};

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-ci-')));
  mkdirSync(dir, { recursive: true });
  sh('git init -q -b main');
  commit('a', 'one\n\nCard: c-001');
  sh('git checkout -q -b side');
  commit('b', 'two\n\nCard: c-001\nCard: c-002');
  commit('c', 'three\n\nFeature: c-002');
  sh('git checkout -q main');
  commit('d', 'four\n\nno trailer');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('withCommitIndex', () => {
  it('gives every card the same commit times as its own git log, branches and repeated trailers included', () => {
    const own = ['c-001', 'c-002', 'c-003'].map(id => storyCommitTimes(dir, id).sort());
    expect(own.map(t => t.length)).toEqual([2, 2, 0]);
    const indexed = withCommitIndex(dir, () => ['c-001', 'c-002', 'c-003'].map(id => storyCommitTimes(dir, id).sort()));
    expect(indexed).toEqual(own);
  });

  it('is gone after the block: a commit made later is seen', () => {
    withCommitIndex(dir, () => storyCommitTimes(dir, 'c-003'));
    commit('e', 'five\n\nCard: c-003');
    expect(storyCommitTimes(dir, 'c-003')).toHaveLength(1);
  });
});

/** The per-commit git calls storyCommits made before the graph: the reference the graph must agree with. */
function legacy(cardId: string) {
  const log = sh('git log --all --format=%H%x00%b%x01').split('\u0001');
  const shas = log.flatMap(r => {
    const [sha, body] = r.replace(/^\n/, '').split('\u0000');
    return sha && body && body.split('\n').some(l => new RegExp(`^(?:Card|Feature):\\s*${cardId}\\s*$`).test(l)) ? [sha] : [];
  });
  return shas.map(sha => ({
    sha,
    merged: spawnSync('git', ['merge-base', '--is-ancestor', sha, 'main'], { cwd: dir }).status === 0,
    branches: sh(`git branch --contains ${sha} --format='%(refname:short)'`).split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('(') && l !== 'main'),
  }));
}

describe('storyCommits from the commit graph', () => {
  it('agrees with per-commit git branch --contains and merge-base on branches, a merge and an unmerged branch', () => {
    sh('git checkout -q side');
    commit('f', 'six\n\nCard: c-001');
    sh('git checkout -q main && git -c user.email=a@b -c user.name=t merge -q --no-ff side -m merge');
    sh('git checkout -q -b later && echo z > z && git add -A');
    commit('g', 'seven\n\nCard: c-001');
    sh('git checkout -q main');
    for (const id of ['c-001', 'c-002']) {
      const got = storyCommits(dir, id).map(c => ({ sha: c.sha, merged: c.merged, branches: c.branches })).sort((a, b) => a.sha.localeCompare(b.sha));
      const want = legacy(id).sort((a, b) => a.sha.localeCompare(b.sha));
      expect(want.length).toBeGreaterThan(0);
      expect(got).toEqual(want);
    }
  });

  it('sees a branch created after the graph was cached', () => {
    storyCommits(dir, 'c-001');
    sh('git branch holds-it side');
    expect(storyCommits(dir, 'c-001').flatMap(c => c.branches)).toContain('holds-it');
  });
});

describe('readAllActivity', () => {
  it('returns the same lines as paging the stream, and picks up a line appended later', async () => {
    const { readActivity, readAllActivity, appendActivity } = await import('../activity.js');
    mkdirSync(join(dir, '.codeloop'), { recursive: true });
    for (let i = 0; i < 2500; i++) appendActivity(dir, 'c-001', { kind: 'edit', at: new Date(1_700_000_000_000 + i * 1000).toISOString(), file: `f${i}` });
    const paged: unknown[] = [];
    for (let page = readActivity(dir, 'c-001', { limit: 1000 }); ; page = readActivity(dir, 'c-001', { after: page.next, limit: 1000 })) {
      paged.push(...page.items);
      if (!page.next) break;
    }
    expect(readAllActivity(dir, 'c-001')).toEqual(paged);
    expect(paged).toHaveLength(2500);
    appendActivity(dir, 'c-001', { kind: 'cmd', text: 'x' });
    expect(readAllActivity(dir, 'c-001')).toHaveLength(2501);
  });
});
