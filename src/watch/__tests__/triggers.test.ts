import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { processSignal } from '../triggers.js';
import type { WatchSignal } from '../signals.js';
import { loadBoard, saveBoard, addTask, type Board, type AddTaskInput } from '../../lib/board.js';

describe('processSignal', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'codeloop-triggers-'));
    // Create a minimal board
    mkdirSync(join(tmpDir, '.codeloop'), { recursive: true });
    const board: Board = {
      version: 1,
      columns: ['backlog', 'planned', 'in_progress', 'review', 'done'],
      tasks: [],
    };
    saveBoard(tmpDir, board);
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

  it('appends commit SHA to active task', () => {
    // Create an active task
    let board = loadBoard(tmpDir);
    board = addTask(board, { title: 'Fix bug', status: 'in_progress' });
    saveBoard(tmpDir, board);

    const signal: WatchSignal = {
      type: 'git_commit',
      timestamp: new Date().toISOString(),
      data: { sha: 'abc1234', previousSha: 'def5678', message: 'fix: the bug' },
    };

    const results = processSignal(tmpDir, signal);
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe('commit_tracked');
    expect(results[0].details).toContain('abc1234');

    // Verify commit was actually saved to board
    const updated = loadBoard(tmpDir);
    const task = updated.tasks[0];
    expect(task.commits).toContain('abc1234');
  });

  it('reports untracked commit when no active task', () => {
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
