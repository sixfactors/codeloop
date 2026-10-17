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
});
