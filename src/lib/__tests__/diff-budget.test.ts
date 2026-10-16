import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { checkBudget, storyDiff } from '../diff-budget.js';

let dir: string;
const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'pipe' }).toString();
function put(path: string, lines: number): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), Array.from({ length: lines }, (_, i) => `line ${i}`).join('\n') + '\n');
}
function commit(msg: string, trailer?: string): void {
  git('add', '-A');
  git('commit', '-q', '-m', msg, ...(trailer ? ['-m', trailer] : []));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-budget-'));
  git('init', '-q');
  put('seed.txt', 1);
  commit('chore: seed');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('storyDiff', () => {
  it('sums two Card: commits, counts each file once, and ignores untrailered commits', () => {
    put('a.ts', 10); put('b.ts', 10);
    commit('feat: one', 'Card: c-001');
    put('c.ts', 20);
    commit('feat: two', 'Feature: c-001');
    put('other.ts', 500);
    commit('feat: someone else', 'Card: c-002');
    put('noise.ts', 500);
    commit('feat: no trailer');
    expect(storyDiff(dir, 'c-001')).toEqual({ files: 3, lines: 40, commits: 2 });
  });

  it('excludes evidence, specs, .codeloop and CHANGELOG paths', () => {
    put('a.ts', 5); put('evidence/001/verify.md', 50); put('specs/001/spec.md', 50); put('.codeloop/x.yaml', 50); put('CHANGELOG.md', 50);
    commit('feat: one', 'Card: c-001');
    expect(storyDiff(dir, 'c-001')).toEqual({ files: 1, lines: 5, commits: 1 });
  });
});

describe('a page under docs/', () => {
  it('counts as a file but adds no lines, so a trivial story with a 433-line page stays within budget', () => {
    put('docs/architecture/enterprise-architecture.html', 430); put('docs/README.md', 3); put('src/x.ts', 4);
    commit('docs: the page', 'Card: c-001');
    expect(storyDiff(dir, 'c-001')).toEqual({ files: 3, lines: 4, commits: 1 });
    expect(checkBudget(dir, 'c-001', 'trivial').pass).toBe(true);
  });
});

describe('checkBudget', () => {
  it('fails an S card over 8 files and names S', () => {
    for (let i = 0; i < 9; i++) put(`f${i}.ts`, 1);
    commit('feat: wide', 'Card: c-001');
    const v = checkBudget(dir, 'c-001', 'S');
    expect(v.pass).toBe(false);
    expect(v.message).toBe('diff 9 files / 9 lines exceeds the S budget (8 files / 300 lines); split the story');
  });

  it('passes the same diff for an M card, and uses M when the card has no size', () => {
    for (let i = 0; i < 9; i++) put(`f${i}.ts`, 1);
    commit('feat: wide', 'Card: c-001');
    expect(checkBudget(dir, 'c-001', 'M').pass).toBe(true);
    expect(checkBudget(dir, 'c-001', undefined).size).toBe('M');
  });

  it('budget: off passes however large the diff', () => {
    mkdirSync(join(dir, '.codeloop'), { recursive: true });
    writeFileSync(join(dir, '.codeloop/config.yaml'), 'budget: off\n');
    for (let i = 0; i < 9; i++) put(`f${i}.ts`, 1);
    commit('feat: wide', 'Card: c-001');
    expect(checkBudget(dir, 'c-001', 'S')).toMatchObject({ pass: true, limit: 'off' });
  });

  it('a per-size override replaces the default for that size only', () => {
    mkdirSync(join(dir, '.codeloop'), { recursive: true });
    writeFileSync(join(dir, '.codeloop/config.yaml'), 'diff_budget:\n  S: { files: 2 }\n');
    put('a.ts', 1); put('b.ts', 1); put('c.ts', 1);
    commit('feat: three', 'Card: c-001');
    const v = checkBudget(dir, 'c-001', 'S');
    expect(v.pass).toBe(false);
    expect(v.limit).toEqual({ files: 2, lines: 300 });
  });
});
