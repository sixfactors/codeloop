import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readActivity } from '../activity.js';
import { readCards } from '../cards.js';
import { createCard } from '../engine.js';
import { recordHandback } from '../handback.js';
import { orchInbox, orchResume, orchTurn, readOrch } from '../orch.js';

const GIT = 'git -c user.email=a@b -c user.name=t';
const LANE = 'id: build\nversion: 1\nretries: 3\nmetric: { name: m, source: cards }\nstages:\n  - id: code\n    done: { cmd: "true" }\n  - id: ship\n    done: { cmd: "true" }\n';

let root: string;
let dir: string;
const sh = (cmd: string, cwd = dir) => execSync(cmd, { cwd, encoding: 'utf8' }).trim();
const quiet = () => {
  const log = console.log;
  console.log = () => {};
  return () => void (console.log = log);
};

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-orchpeer-')));
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

const kinds = () => readActivity(dir, 'c-001').items.map(i => i.kind);

describe('peer and person builders', () => {
  it('briefs a person without waiting, then resume gates, merges and advances once a hand-back exists', async () => {
    const back = quiet();
    const turn = await orchTurn(dir, 'c-001', { builder: 'person', wait: false });
    back();
    expect(turn.outcome).toBe('briefed');
    expect(readFileSync(join(dir, '.codeloop/state/orch/outbox/person.md'), 'utf-8')).toContain('codeloop card handback c-001');
    const line = readActivity(dir, 'c-001').items.find(i => i.kind === 'orch-brief');
    expect(line).toMatchObject({ to: 'person' });
    expect(orchInbox(dir, undefined)).toHaveLength(1);
    expect(() => orchResume(dir, 'c-001')).toThrow(/no hand-back/);

    writeFileSync(join(turn.worktree, 'built.txt'), 'built\n');
    sh(`git add -A && ${GIT} commit -qm "feat: built" -m "Card: c-001"`, turn.worktree);
    recordHandback(dir, 'c-001', { branch: turn.branch, head: sh('git rev-parse HEAD', turn.worktree), proof: 'test -f built.txt', left: 'built.txt exists', worktree: turn.worktree });
    const done = orchResume(dir, 'c-001');
    expect(done).toMatchObject({ outcome: 'merged', gate: { verdict: 'pass' } });
    expect(existsSync(join(dir, 'built.txt'))).toBe(true);
    expect(readCards(dir).cards[0].stage).toBe('ship');
    expect(readOrch(dir, 'c-001').turns[0].outcome).toBe('merged');
    expect(orchInbox(dir, undefined)).toHaveLength(0);
  }, 60_000);

  it('addresses a session builder brief to that session in the outbox', async () => {
    mkdirSync(join(dir, '.codeloop/state/active'), { recursive: true });
    const now = new Date().toISOString();
    writeFileSync(join(dir, '.codeloop/state/active/sess-1.json'), JSON.stringify({ session: 'sess-1', card: 'c-001', startedAt: now, updatedAt: now, host: 'claude', machine: 'm', label: 'fake' }));
    const back = quiet();
    const turn = await orchTurn(dir, 'c-001', { builder: 'session:fake', wait: false });
    back();
    expect(turn.outcome).toBe('briefed');
    expect(readFileSync(join(dir, '.codeloop/state/orch/outbox/sess-1.md'), 'utf-8')).toContain('orch-brief c-001 turn 1');
    expect(readActivity(dir, 'c-001').items.find(i => i.kind === 'orch-brief')).toMatchObject({ to: 'fake' });
    expect(orchInbox(dir, 'sess-1')).toHaveLength(1);
    await expect(orchTurn(dir, 'c-001', { builder: 'session:nobody', wait: false })).rejects.toThrow(/no live session/);
  }, 60_000);

  it('ends the turn as failed when no hand-back arrives within the wait', async () => {
    const back = quiet();
    const turn = await orchTurn(dir, 'c-001', { builder: 'person', wait: 0.05 });
    back();
    expect(turn.outcome).toBe('failed');
    expect(turn.findings).toEqual(['no hand-back within the wait']);
    expect(readCards(dir).cards[0].retries.code).toBe(1);
    expect(kinds()).toContain('orch');
  }, 60_000);
});
