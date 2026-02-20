import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import {
  createBoard,
  addTask,
  updateTask,
  moveTask,
  deleteTask,
  getTask,
  nextId,
  loadBoard,
  saveBoard,
  type Board,
} from '../board.js';

describe('board', () => {
  describe('createBoard', () => {
    it('returns board with 5 default columns', () => {
      const board = createBoard();
      expect(board.columns).toEqual(['backlog', 'planned', 'in_progress', 'review', 'done']);
    });

    it('has empty tasks array', () => {
      const board = createBoard();
      expect(board.tasks).toEqual([]);
    });

    it('has version 1', () => {
      const board = createBoard();
      expect(board.version).toBe(1);
    });
  });

  describe('nextId', () => {
    it('returns t-001 for empty board', () => {
      const board = createBoard();
      expect(nextId(board)).toBe('t-001');
    });

    it('returns next sequential ID', () => {
      let board = createBoard();
      board = addTask(board, { title: 'First' });
      expect(nextId(board)).toBe('t-002');
    });

    it('zero-pads to 3 digits', () => {
      const board = createBoard();
      expect(nextId(board)).toBe('t-001');
    });
  });

  describe('addTask', () => {
    it('adds task with auto-incrementing ID', () => {
      let board = createBoard();
      board = addTask(board, { title: 'First task' });
      expect(board.tasks).toHaveLength(1);
      expect(board.tasks[0].id).toBe('t-001');

      board = addTask(board, { title: 'Second task' });
      expect(board.tasks).toHaveLength(2);
      expect(board.tasks[1].id).toBe('t-002');
    });

    it('defaults status to backlog', () => {
      const board = addTask(createBoard(), { title: 'Test' });
      expect(board.tasks[0].status).toBe('backlog');
    });

    it('sets createdAt and updatedAt', () => {
      const before = new Date().toISOString();
      const board = addTask(createBoard(), { title: 'Test' });
      const after = new Date().toISOString();

      expect(board.tasks[0].createdAt).toBeDefined();
      expect(board.tasks[0].updatedAt).toBeDefined();
      expect(board.tasks[0].createdAt >= before).toBe(true);
      expect(board.tasks[0].createdAt <= after).toBe(true);
    });

    it('accepts optional labels and steps', () => {
      const board = addTask(createBoard(), {
        title: 'With extras',
        labels: ['feat', 'backend'],
        steps: [{ text: 'Step 1', done: false }],
      });

      expect(board.tasks[0].labels).toEqual(['feat', 'backend']);
      expect(board.tasks[0].steps).toEqual([{ text: 'Step 1', done: false }]);
    });

    it('defaults labels to empty array', () => {
      const board = addTask(createBoard(), { title: 'Test' });
      expect(board.tasks[0].labels).toEqual([]);
    });

    it('defaults steps to empty array', () => {
      const board = addTask(createBoard(), { title: 'Test' });
      expect(board.tasks[0].steps).toEqual([]);
    });

    it('defaults commits to empty array', () => {
      const board = addTask(createBoard(), { title: 'Test' });
      expect(board.tasks[0].commits).toEqual([]);
    });

    it('does not mutate original board', () => {
      const original = createBoard();
      const updated = addTask(original, { title: 'Test' });
      expect(original.tasks).toHaveLength(0);
      expect(updated.tasks).toHaveLength(1);
    });
  });

  describe('updateTask', () => {
    let board: Board;

    beforeEach(() => {
      board = addTask(createBoard(), { title: 'Original' });
    });

    it('merges patch into existing task', () => {
      const updated = updateTask(board, 't-001', { title: 'Updated' });
      expect(updated.tasks[0].title).toBe('Updated');
    });

    it('updates updatedAt timestamp', () => {
      const originalTime = board.tasks[0].updatedAt;
      // Small delay to ensure timestamp changes
      const updated = updateTask(board, 't-001', { title: 'Updated' });
      expect(updated.tasks[0].updatedAt).toBeDefined();
      // updatedAt should be >= original
      expect(updated.tasks[0].updatedAt >= originalTime).toBe(true);
    });

    it('throws on unknown task ID', () => {
      expect(() => updateTask(board, 't-999', { title: 'Nope' })).toThrow(
        'Task t-999 not found'
      );
    });

    it('does not mutate original board', () => {
      const updated = updateTask(board, 't-001', { title: 'Updated' });
      expect(board.tasks[0].title).toBe('Original');
      expect(updated.tasks[0].title).toBe('Updated');
    });

    it('preserves other fields when patching', () => {
      const withLabels = addTask(createBoard(), {
        title: 'Test',
        labels: ['feat'],
      });
      const updated = updateTask(withLabels, 't-001', { title: 'Changed' });
      expect(updated.tasks[0].labels).toEqual(['feat']);
    });
  });

  describe('moveTask', () => {
    it('changes task status', () => {
      const board = addTask(createBoard(), { title: 'Test' });
      const moved = moveTask(board, 't-001', 'in_progress');
      expect(moved.tasks[0].status).toBe('in_progress');
    });

    it('updates updatedAt', () => {
      const board = addTask(createBoard(), { title: 'Test' });
      const originalTime = board.tasks[0].updatedAt;
      const moved = moveTask(board, 't-001', 'done');
      expect(moved.tasks[0].updatedAt >= originalTime).toBe(true);
    });
  });

  describe('deleteTask', () => {
    it('removes task from board', () => {
      let board = addTask(createBoard(), { title: 'First' });
      board = addTask(board, { title: 'Second' });
      const deleted = deleteTask(board, 't-001');
      expect(deleted.tasks).toHaveLength(1);
      expect(deleted.tasks[0].id).toBe('t-002');
    });

    it('throws on unknown task ID', () => {
      const board = createBoard();
      expect(() => deleteTask(board, 't-999')).toThrow('Task t-999 not found');
    });

    it('does not mutate original board', () => {
      const board = addTask(createBoard(), { title: 'Test' });
      const deleted = deleteTask(board, 't-001');
      expect(board.tasks).toHaveLength(1);
      expect(deleted.tasks).toHaveLength(0);
    });
  });

  describe('getTask', () => {
    it('returns task by ID', () => {
      const board = addTask(createBoard(), { title: 'Test' });
      const task = getTask(board, 't-001');
      expect(task).toBeDefined();
      expect(task!.title).toBe('Test');
    });

    it('returns undefined for unknown ID', () => {
      const board = createBoard();
      expect(getTask(board, 't-999')).toBeUndefined();
    });
  });

  describe('loadBoard / saveBoard', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'codeloop-test-'));
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('round-trips board through file system', () => {
      let board = createBoard();
      board = addTask(board, { title: 'Persisted task' });

      saveBoard(tmpDir, board);
      const loaded = loadBoard(tmpDir);

      expect(loaded.version).toBe(1);
      expect(loaded.tasks).toHaveLength(1);
      expect(loaded.tasks[0].title).toBe('Persisted task');
    });

    it('returns empty board when file missing', () => {
      const board = loadBoard(tmpDir);
      expect(board.version).toBe(1);
      expect(board.tasks).toEqual([]);
      expect(board.columns).toEqual(['backlog', 'planned', 'in_progress', 'review', 'done']);
    });

    it('writes atomically (temp file + rename)', () => {
      const board = createBoard();
      saveBoard(tmpDir, board);

      // The file should exist at .codeloop/board.json
      const boardPath = join(tmpDir, '.codeloop', 'board.json');
      expect(existsSync(boardPath)).toBe(true);

      // The temp file should NOT exist
      const tmpPath = boardPath + '.tmp';
      expect(existsSync(tmpPath)).toBe(false);
    });

    it('creates .codeloop directory if missing', () => {
      const board = createBoard();
      saveBoard(tmpDir, board);
      expect(existsSync(join(tmpDir, '.codeloop'))).toBe(true);
    });

    it('handles pre-existing board.json', () => {
      // Save once
      let board = addTask(createBoard(), { title: 'First' });
      saveBoard(tmpDir, board);

      // Save again (overwrite)
      board = addTask(board, { title: 'Second' });
      saveBoard(tmpDir, board);

      const loaded = loadBoard(tmpDir);
      expect(loaded.tasks).toHaveLength(2);
    });
  });
});
