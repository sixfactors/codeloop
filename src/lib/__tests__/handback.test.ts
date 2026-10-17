import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { cardActivity, listHandbacks, recordHandback } from '../services.js';
import { RefusalError, readCards } from '../cards.js';
import { createCard } from '../engine.js';
import { spawnSync } from 'child_process';
import { runCli } from '../../__tests__/cli.js';

let dir: string;
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-handback-')));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/config.yaml'), 'project:\n  name: demo\n');
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: code\n    done: { cmd: "true" }\n');
  createCard(dir, { lane: 'build', title: 'Founders can read the launch post' });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const input = (proof: string) => ({ branch: 'feat/x', head: 'abc123', proof, left: 'nothing', blocked: '' });

describe('recordHandback', () => {
  it('runs a passing proof, stores exit 0, lists it, and writes an activity line and a card event', () => {
    const rec = recordHandback(dir, 'c-001', input('true'));
    expect(rec.proof.exit).toBe(0);
    expect(rec.stage).toBe('code');
    expect(listHandbacks(dir, 'c-001').map(h => h.head)).toEqual(['abc123']);
    expect(cardActivity(dir, 'c-001').lines.some(l => l.kind === 'handback')).toBe(true);
    expect(readCards(dir).cards[0].events.some(e => e.action === 'handback')).toBe(true);
  });

  it('records a failing proof with its exit code and does not refuse', () => {
    const rec = recordHandback(dir, 'c-001', input('echo boom; false'));
    expect(rec.proof.exit).toBe(1);
    expect(rec.proof.output).toContain('boom');
    expect(listHandbacks(dir, 'c-001')).toHaveLength(1);
  });

  it('refuses an empty proof and writes nothing', () => {
    expect(() => recordHandback(dir, 'c-001', input('  '))).toThrow(RefusalError);
    expect(() => recordHandback(dir, 'c-001', input('  '))).toThrow('a hand-back needs a proof command');
    expect(listHandbacks(dir, 'c-001')).toEqual([]);
  });

  it('lists newest first', () => {
    recordHandback(dir, 'c-001', { ...input('true'), head: 'one' });
    recordHandback(dir, 'c-001', { ...input('true'), head: 'two' });
    expect(listHandbacks(dir, 'c-001').map(h => h.head)).toEqual(['two', 'one']);
  });
});

describe('codeloop card handback', () => {
  const git = (cwd: string, ...args: string[]) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf-8' });
  const env = { ...process.env, CODELOOP_CARD: '', CODELOOP_ROLE: '', CODELOOP_PROJECT_DIR: '', CODELOOP_WORK_DIR: '' };

  it('runs the proof in the linked worktree it is called from, where the branch is checked out', () => {
    git(dir, 'init', '-q');
    git(dir, 'commit', '-q', '--allow-empty', '-m', 'init');
    const wt = `${dir}-wt`;
    git(dir, 'worktree', 'add', '-q', wt);
    writeFileSync(join(wt, 'only-on-the-branch'), '');
    try {
      const run = runCli(['card', 'handback', 'c-001', '--branch', 'b', '--head', 'abc', '--proof', 'test -f only-on-the-branch'], { cwd: wt, encoding: 'utf-8', env });
      expect(run.stdout).toMatch(/proof exit 0/);
      expect(listHandbacks(dir, 'c-001')[0].proof.cwd).toBe(realpathSync(wt));
    } finally {
      rmSync(wt, { recursive: true, force: true });
    }
  });

  it('prints the cwd, the exact command and the output head when the proof fails', () => {
    const run = runCli(['card', 'handback', 'c-001', '--branch', 'b', '--head', 'abc', '--proof', 'echo first line; exit 4'], { cwd: dir, encoding: 'utf-8', env });
    expect(run.stderr).toContain('proof failed with exit 4');
    expect(run.stderr).toContain(`cwd: ${dir}`);
    expect(run.stderr).toContain('command (/bin/sh -c): echo first line; exit 4');
    expect(run.stderr).toContain('first line');
  });
});
