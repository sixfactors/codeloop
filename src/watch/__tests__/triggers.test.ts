import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { processSignal } from '../triggers.js';
import type { WatchSignal } from '../signals.js';
import { setActiveCard } from '../../lib/active-card.js';
import { createCard } from '../../lib/engine.js';

describe('processSignal', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'codeloop-triggers-'));
    mkdirSync(join(tmpDir, '.codeloop/lanes'), { recursive: true });
    writeFileSync(join(tmpDir, '.codeloop/lanes/build.yaml'), `id: build
version: 1
metric: { name: m, source: cards }
stages:
  - id: research
    done: { cmd: "true" }
`);
    writeFileSync(join(tmpDir, '.codeloop/cards.json'), JSON.stringify({ version: 1, cards: [] }));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('tracks file changes', () => {
    const signal: WatchSignal = {
      type: 'file_change',
      timestamp: new Date().toISOString(),
      data: { file: 'src/index.ts' },
    };

    const results = processSignal(tmpDir, signal);
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe('file_tracked');
    expect(results[0].details).toContain('src/index.ts');
  });

  it('appends commit SHA to the active card', () => {
    createCard(tmpDir, { lane: 'build', title: 'Fix bug', id: 'c-1' });
    setActiveCard(tmpDir, 'c-1');

    const signal: WatchSignal = {
      type: 'git_commit',
      timestamp: new Date().toISOString(),
      data: { sha: 'abc1234', previousSha: 'def5678', message: 'fix: the bug' },
    };

    const results = processSignal(tmpDir, signal);
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe('commit_tracked');
    expect(results[0].details).toContain('abc1234');
    expect(results[0].details).toContain('c-1');

    const cards = JSON.parse(readFileSync(join(tmpDir, '.codeloop/cards.json'), 'utf-8'));
    const events = cards.cards[0].events.map((e: { action: string; note?: string }) => e);
    expect(events.some((e: { action: string; note?: string }) => e.action === 'commit' && e.note?.includes('abc1234'))).toBe(true);
  });

  it('reports untracked commit when no active card', () => {
    const signal: WatchSignal = {
      type: 'git_commit',
      timestamp: new Date().toISOString(),
      data: { sha: 'abc1234', previousSha: null, message: 'initial' },
    };

    const results = processSignal(tmpDir, signal);
    expect(results[0].action).toBe('commit_untracked');
  });

  it('tracks idle timeout', () => {
    const signal: WatchSignal = {
      type: 'idle',
      timestamp: new Date().toISOString(),
      data: { idleSeconds: 300 },
    };

    const results = processSignal(tmpDir, signal);
    expect(results[0].action).toBe('idle_timeout');
    expect(results[0].details).toContain('300s');
  });

  it('tracks test results', () => {
    const signal: WatchSignal = {
      type: 'test_result',
      timestamp: new Date().toISOString(),
      data: { passed: 42, total: 45 },
    };

    const results = processSignal(tmpDir, signal);
    expect(results[0].action).toBe('test_tracked');
    expect(results[0].details).toContain('42/45');
  });

  it('tracks build status', () => {
    const signal: WatchSignal = {
      type: 'build_status',
      timestamp: new Date().toISOString(),
      data: { status: 'success' },
    };

    const results = processSignal(tmpDir, signal);
    expect(results[0].action).toBe('build_tracked');
  });
});
