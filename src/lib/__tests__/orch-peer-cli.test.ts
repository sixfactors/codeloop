import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createCard } from '../engine.js';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'dist', 'index.js');
const GIT = 'git -c user.email=a@b -c user.name=t';
const LANE = 'id: build\nversion: 1\nretries: 3\nmetric: { name: m, source: cards }\nstages:\n  - id: code\n    done: { cmd: "true" }\n  - id: ship\n    done: { cmd: "true" }\n';

let root: string;
let dir: string;
const sh = (cmd: string, cwd = dir, env: Record<string, string> = {}) => execSync(cmd, { cwd, encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const cli = (args: string, cwd = dir, env: Record<string, string> = {}) => sh(`node ${CLI} ${args} 2>&1`, cwd, env);

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-orchcli-')));
  dir = join(root, 'demo');
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/config.yaml'), 'project:\n  name: demo\n');
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), LANE);
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  writeFileSync(join(dir, '.gitignore'), '.codeloop/state/\n');
  sh(`git init -q -b main && git add -A && ${GIT} commit -qm init`);
  createCard(dir, { lane: 'build', title: 'Founders can read the launch post' });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('codeloop orch, the built CLI', () => {
  it('routes --builder person, inbox and resume to their own commands, not to the card argument', () => {
    expect(existsSync(CLI)).toBe(true);
    expect(cli('orch c-001 --builder person --no-wait')).toContain('briefed');
    expect(cli('orch inbox')).toContain('=== c-001 turn 1 (for person) ===');
    let refused = '';
    try {
      cli('orch resume c-001');
    } catch (e) {
      refused = String((e as { stdout?: string }).stdout);
    }
    expect(refused).toMatch(/no hand-back/);

    const wt = join(root, 'demo-wt-c-001');
    const branch = sh('git rev-parse --abbrev-ref HEAD', wt);
    writeFileSync(join(wt, 'built.txt'), 'built\n');
    sh(`git add -A && ${GIT} commit -qm "feat: built" -m "Card: c-001"`, wt);
    cli(`card handback c-001 --branch ${branch} --head "$(git rev-parse HEAD)" --proof "test -f built.txt" --left "built.txt exists" --worktree "$PWD"`, wt, { CODELOOP_PROJECT_DIR: dir });
    expect(cli('orch resume c-001')).toContain('merged');
    expect(existsSync(join(dir, 'built.txt'))).toBe(true);
    expect(cli('orch inbox')).toContain('no briefs waiting');
  }, 60_000);
});
