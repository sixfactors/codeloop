import { execSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createCard } from '../engine.js';
import { holdsLease } from '../orch-isolation.js';
import { orchTurn } from '../orch.js';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'dist', 'index.js');
const GIT = 'git -c user.email=a@b -c user.name=t';
let root: string;
let dir: string;
const sh = (cmd: string) => execSync(cmd, { cwd: dir, encoding: 'utf8' }).trim();

// A builder in the main tree: waits its card's delay, writes its card's file, commits only that file
// with the trailer, and hands back with no --worktree. PROOF picks the proof command.
const BUILDER = (proof: string) => `#!/bin/sh
set -e
case "$CODELOOP_CARD" in c-001) f=a.txt; d=1.2 ;; c-002) f=b.txt; d=2.4 ;; *) f=a.txt; d=0.2 ;; esac
sleep $d
echo "$CODELOOP_CARD" >> $f
git add $f
${GIT} commit -qm "feat: $f

Card: $CODELOOP_CARD"
node "${CLI}" card handback "$CODELOOP_CARD" --branch main --head "$(git rev-parse HEAD)" --proof "${proof}" --left "$f written"
`;

function project(builder: string, orch = '') {
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, 'builder.sh'), builder);
  chmodSync(join(dir, 'builder.sh'), 0o755);
  writeFileSync(join(dir, '.codeloop/config.yaml'), `project:\n  name: demo\nagents:\n  default: fake\n  fake:\n    cmd: "sh ${join(dir, 'builder.sh')} {brief}"\n    timeout_minutes: 2\norch:\n  quick_exit_seconds: 0\n${orch}`);
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), 'id: build\nversion: 1\nretries: 3\nmetric: { name: m, source: cards }\nstages:\n  - id: code\n    done: { cmd: "true" }\n  - id: ship\n    done: { cmd: "true" }\n');
  writeFileSync(join(dir, '.gitignore'), '.codeloop/state/\n');
  writeFileSync(join(dir, 'a.txt'), '');
  writeFileSync(join(dir, 'b.txt'), '');
  sh(`git init -q -b main && ${GIT} add -A && ${GIT} commit -qm init`);
  // Each story's plan leases the file it changes; c-003 overlaps c-001.
  const plans: Record<string, string> = { 'c-001': 'a.txt', 'c-002': 'b.txt', 'c-003': 'a.txt' };
  for (const [id, file] of Object.entries(plans)) {
    createCard(dir, { lane: 'build', title: `Story ${id}`, id });
    const spec = `specs/${id.slice(2)}`;
    mkdirSync(join(dir, spec), { recursive: true });
    writeFileSync(join(dir, spec, 'plan.md'), `# Plan\n\n## Files\n\n- ${file}\n`);
  }
  const board = JSON.parse(readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8'));
  for (const c of board.cards) c.spec = `specs/${c.id.slice(2)}`;
  writeFileSync(join(dir, '.codeloop/cards.json'), JSON.stringify(board, null, 2));
}

const worktrees = () => readdirSync(root).filter(f => f.includes('-wt-'));
const waitFor = async (ok: () => boolean) => {
  for (let i = 0; i < 100 && !ok(); i++) await new Promise(r => setTimeout(r, 50));
};

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-tree-')));
  dir = join(root, 'demo');
  mkdirSync(dir);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('tree mode, the default', () => {
  it('two builders on disjoint plans work the main tree at once, both commit on the trunk, both gate pass, no worktree', async () => {
    expect(existsSync(CLI)).toBe(true);
    project(BUILDER('test -s $f || true'));
    const [one, two] = await Promise.all([orchTurn(dir, 'c-001'), orchTurn(dir, 'c-002')]);
    expect([one.outcome, two.outcome]).toEqual(['merged', 'merged']);
    expect([one.mode, two.mode]).toEqual(['tree', 'tree']);
    expect([one.gate?.verdict, two.gate?.verdict]).toEqual(['pass', 'pass']);
    // The second builder started before the first finished: the lock was not held while they worked.
    expect(Date.parse(two.startedAt)).toBeLessThan(Date.parse(one.endedAt!));
    expect(worktrees()).toEqual([]);
    const log = sh('git log --format=%B main');
    expect(log).toContain('Card: c-001');
    expect(log).toContain('Card: c-002');
    expect(sh('git rev-parse --abbrev-ref HEAD')).toBe('main');
    expect(holdsLease(dir, 'c-001') || holdsLease(dir, 'c-002')).toBe(false);
  }, 60_000);

  it('a story whose plan overlaps a held lease waits naming the holder, then runs after it hands back', async () => {
    project(BUILDER('true'));
    const first = orchTurn(dir, 'c-001');
    await waitFor(() => holdsLease(dir, 'c-001'));
    const waiting = await orchTurn(dir, 'c-003');
    expect(waiting.outcome).toBe('waiting-lease');
    expect(waiting.note).toBe('a.txt is leased by c-001 (Story c-001), held by orch-c-001');
    expect((await first).outcome).toBe('merged');
    const after = await orchTurn(dir, 'c-003');
    expect(after.outcome).toBe('merged');
    expect(after.mode).toBe('tree');
  }, 60_000);

  it('orch.max_builders 1 queues the second builder', async () => {
    project(BUILDER('true'), '  max_builders: 1\n');
    const first = orchTurn(dir, 'c-001');
    await waitFor(() => holdsLease(dir, 'c-001'));
    const second = await orchTurn(dir, 'c-002');
    expect(second.outcome).toBe('queued');
    expect(second.note).toMatch(/1 builder\(s\) already running \(c-001\); orch.max_builders is 1/);
    expect((await first).outcome).toBe('merged');
  }, 60_000);

  it('a failed gate leaves HEAD as the builder left it and records the finding to fix forward', async () => {
    project(BUILDER('false'));
    const turn = await orchTurn(dir, 'c-001');
    expect(turn.outcome).toBe('failed');
    expect(turn.findings).toContain('fix forward with a new commit on the branch; nothing was reset or reverted');
    expect(sh('git rev-parse HEAD')).toBe(turn.handback?.head);
    expect(sh('git log -1 --format=%B')).toContain('Card: c-001');
    expect(holdsLease(dir, 'c-001')).toBe(false);
  }, 60_000);
});
