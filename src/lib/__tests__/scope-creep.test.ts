import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { checkScope, scopeCreep } from '../scope-creep.js';

let dir: string;
const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'pipe' }).toString();
function put(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}
const review = (rows: string) => put('evidence/001/review.md', `# Review c-001\n\n## Scope\n\n| File | Verdict | Reason |\n|---|---|---|\n${rows}\n\nverdict: approve\n`);
const TEN = 'the helper is shared with a and the split would double the work';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-scope-'));
  git('init', '-q');
  put('.codeloop/cards.json', JSON.stringify({ version: 1, cards: [
    { id: 'c-001', title: 't', spec: 'specs/001' },
    { id: 'c-002', title: 'u' },
  ] }));
  put('specs/001/plan.md', '# Plan\n\n## Files\n\n- `src/a.ts`\n');
  put('seed.txt', 'x\n');
  git('add', '-A'); git('commit', '-q', '-m', 'chore: seed');
  put('src/a.ts', 'a\n'); put('src/b.ts', '1\n2\n3\n');
  put('evidence/001/verify.md', 'result: pass\n');
  git('add', '-A'); git('commit', '-q', '-m', 'feat: story', '-m', 'Card: c-001');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('scopeCreep', () => {
  it('returns only the changed file the plan does not allow, with its line count', () => {
    expect(scopeCreep(dir, 'c-001')).toEqual([{ path: 'src/b.ts', lines: 3 }]);
  });
});

describe('checkScope', () => {
  it('fails naming src/b.ts when there is no review.md', () => {
    const problems = checkScope(dir, 'c-001');
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('src/b.ts');
    expect(problems[0]).toContain('no `## Scope` row');
  });

  it('passes with a keep row whose reason is ten words', () => {
    review(`| src/b.ts | keep | ${TEN} |`);
    expect(checkScope(dir, 'c-001')).toEqual([]);
  });

  it('fails a keep row with a three-word reason', () => {
    review('| src/b.ts | keep | needed by a |');
    expect(checkScope(dir, 'c-001')[0]).toContain('at least 10 words, has 3');
  });

  it('fails move to a card that does not exist, passes for one that does', () => {
    review('| src/b.ts | move to c-999 | belongs to the other story |');
    expect(checkScope(dir, 'c-001')[0]).toContain('c-999 names no existing card');
    review('| src/b.ts | move to c-002 | belongs to the other story |');
    expect(checkScope(dir, 'c-001')).toEqual([]);
  });

  it('passes a revert row with a reason and fails an unknown verdict', () => {
    review('| src/b.ts | revert | not part of this story |');
    expect(checkScope(dir, 'c-001')).toEqual([]);
    review('| src/b.ts | fine | whatever |');
    expect(checkScope(dir, 'c-001')[0]).toContain('is not keep, revert or move to');
  });

  it('passes with no review when every changed file is in the plan', () => {
    put('specs/001/plan.md', '# Plan\n\n## Files\n\n- `src/a.ts`\n- `src/b.ts`\n');
    expect(checkScope(dir, 'c-001')).toEqual([]);
  });
});
