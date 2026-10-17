import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { checkHealth } from '../health.js';

let dir: string;
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
};
const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'pipe' }).toString().trim();
const commit = (msg: string) => { git('add', '-A'); git('commit', '-q', '-m', msg); };
const gotcha = (name: string, scope: string) => write(`.codeloop/wiki/gotchas/${name}.md`, `---\ntitle: ${name}\nseverity: critical\nscope:\n  - ${scope}\n---\nbody\n`);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-health-scope-'));
  git('init', '-q', '-b', 'main');
  write('src/a.ts', 'export const a = 1;\n');
  write('src/a.test.ts', "import { it } from 'vitest';\nit('a', () => {});\nit('b', () => {});\n");
  commit('base');
  write('src/a.ts', 'export const a = 2;\n');
  commit('feat: change a\n\nCard: c-1');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("a story's health delta", () => {
  it('ignores a critical gotcha outside the files the story changed, and counts one inside them', () => {
    write('other/b.ts', 'export const b = 1;\n');
    gotcha('elsewhere', 'other/**');
    commit('docs: a gotcha from another story\n\nCard: c-2');
    const outside = checkHealth(dir, 'c-1');
    expect(outside.state).toBe('measured');
    expect(outside.delta).toBe(0);

    gotcha('here', 'src/**');
    commit('docs: a gotcha on the story\'s file\n\nCard: c-1');
    expect(checkHealth(dir, 'c-1').delta).toBeLessThan(0);
  });

  it('counts a critical gotcha with an empty scope, which applies to every file', () => {
    write('.codeloop/wiki/gotchas/everywhere.md', '---\ntitle: everywhere\nseverity: critical\nscope: []\n---\nbody\n');
    commit('docs: a gotcha with no scope\n\nCard: c-1');
    expect(checkHealth(dir, 'c-1').delta).toBeLessThan(0);
  });

  it('on its own branch counts every file since the merge-base, not only those of the trailered commits', () => {
    git('checkout', '-q', '-b', 'story');
    write('README.md', 'one line\n');
    commit('docs: readme\n\nCard: c-1');
    write('src/b.ts', 'export const b = 1;\n');
    gotcha('src-wide', 'src/**');
    commit('feat: b');
    expect(checkHealth(dir, 'c-1').delta).toBeLessThan(0);
  });

  it("on trunk counts an untrailered commit that touches the story's files or its plan, never another story's", () => {
    write('src/a.ts', 'export const a = 3;\nexport const shared = 1;\n');
    write('src/c.ts', 'export const c = 1;\n');
    gotcha('on-c', 'src/c.ts');
    commit('fix: a and c');
    expect(checkHealth(dir, 'c-1').delta, 'the untrailered commit touched src/a.ts, which c-1 changed').toBeLessThan(0);

    rmSync(join(dir, '.codeloop/wiki/gotchas/on-c.md'));
    write('src/e.ts', 'export const e = 1;\n');
    gotcha('on-e', 'src/e.ts');
    commit('feat: e\n\nCard: c-2');
    write('specs/001-one/plan.md', '# Plan\n\n## Files\n\n- `src/d.ts`\n');
    write('.codeloop/cards.json', JSON.stringify({ version: 1, cards: [{ id: 'c-1', title: 'one', lane: 'build', stage: 'build', spec: 'specs/001-one' }] }));
    commit('chore: plan for c-1');
    const base = checkHealth(dir, 'c-1').delta!;
    expect(base, "c-2's gotcha on its own file stays out").toBe(0);

    write('src/d.ts', 'export const d = 1;\n');
    gotcha('on-d', 'src/d.ts');
    commit('feat: d');
    expect(checkHealth(dir, 'c-1').delta, 'the untrailered commit touched src/d.ts, in the plan').toBeLessThan(0);
  });
});
