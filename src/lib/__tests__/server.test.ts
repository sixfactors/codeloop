import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createBoard, addTask, saveBoard, loadBoard } from '../board.js';
import { createApp } from '../server.js';

describe('server', () => {
  let tmpDir: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'codeloop-server-'));
    // Seed with an empty board
    saveBoard(tmpDir, createBoard());
    app = createApp(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('REST API', () => {
    it('GET /api/board returns board contents', async () => {
      const res = await app.request('/api/board');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.version).toBe(1);
      expect(body.columns).toEqual(['backlog', 'planned', 'in_progress', 'review', 'done']);
      expect(body.tasks).toEqual([]);
    });

    it('POST /api/tasks creates task and persists', async () => {
      const res = await app.request('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New task', labels: ['feat'] }),
      });

      expect(res.status).toBe(201);
      const task = await res.json();
      expect(task.id).toBe('t-001');
      expect(task.title).toBe('New task');
      expect(task.labels).toEqual(['feat']);
      expect(task.status).toBe('backlog');

      // Verify persisted to disk
      const board = loadBoard(tmpDir);
      expect(board.tasks).toHaveLength(1);
      expect(board.tasks[0].title).toBe('New task');
    });

    it('PATCH /api/tasks/:id updates task', async () => {
      // Create a task first
      let board = addTask(createBoard(), { title: 'Original' });
      saveBoard(tmpDir, board);

      const res = await app.request('/api/tasks/t-001', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated', status: 'in_progress' }),
      });

      expect(res.status).toBe(200);
      const task = await res.json();
      expect(task.title).toBe('Updated');
      expect(task.status).toBe('in_progress');

      // Verify persisted
      board = loadBoard(tmpDir);
      expect(board.tasks[0].title).toBe('Updated');
    });

    it('PATCH /api/tasks/:id returns 404 for bad ID', async () => {
      const res = await app.request('/api/tasks/t-999', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Nope' }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('not found');
    });

    it('DELETE /api/tasks/:id removes task', async () => {
      let board = addTask(createBoard(), { title: 'To delete' });
      saveBoard(tmpDir, board);

      const res = await app.request('/api/tasks/t-001', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);

      // Verify removed from disk
      board = loadBoard(tmpDir);
      expect(board.tasks).toHaveLength(0);
    });

    it('DELETE /api/tasks/:id returns 404 for bad ID', async () => {
      const res = await app.request('/api/tasks/t-999', {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });
  });

  describe('SSE', () => {
    it('GET /api/events returns event stream', async () => {
      const res = await app.request('/api/events');
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
    });
  });
});
