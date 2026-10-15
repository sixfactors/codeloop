import { execSync } from 'child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { storyCommitTimes, withCommitIndex } from '../diff-budget.js';

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
