import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { cors } from 'hono/cors';
import { existsSync, readFileSync } from 'fs';
import { join, extname } from 'path';
import {
  loadBoard,
  saveBoard,
  addTask,
  updateTask,
  deleteTask,
  getTask,
  type Board,
  type AddTaskInput,
  type Task,
} from './board.js';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
};

export function createApp(projectDir: string, uiDir?: string) {
  const app = new Hono();

  app.use('*', cors());

  // Track SSE clients for broadcasting
  const sseClients = new Set<(board: Board) => void>();

  function broadcast() {
    const board = loadBoard(projectDir);
    for (const send of sseClients) {
      send(board);
    }
  }


  // GET /api/board — full board
  app.get('/api/board', (c) => {
    const board = loadBoard(projectDir);
    return c.json(board);
  });

  // POST /api/tasks — create task
  app.post('/api/tasks', async (c) => {
    const body = await c.req.json<AddTaskInput>();
    let board = loadBoard(projectDir);
    board = addTask(board, body);
    saveBoard(projectDir, board);

    const task = board.tasks[board.tasks.length - 1];
    broadcast();
    return c.json(task, 201);
  });

  // PATCH /api/tasks/:id — update task
  app.patch('/api/tasks/:id', async (c) => {
    const id = c.req.param('id');
    const patch = await c.req.json<Partial<Omit<Task, 'id' | 'createdAt'>>>();

    let board = loadBoard(projectDir);
    try {
      board = updateTask(board, id, patch);
    } catch (e: any) {
      return c.json({ error: e.message }, 404);
    }

    saveBoard(projectDir, board);
    const task = getTask(board, id)!;
    broadcast();
    return c.json(task);
  });

  // DELETE /api/tasks/:id — remove task
  app.delete('/api/tasks/:id', (c) => {
    const id = c.req.param('id');
    let board = loadBoard(projectDir);

    try {
      board = deleteTask(board, id);
    } catch (e: any) {
      return c.json({ error: e.message }, 404);
    }

    saveBoard(projectDir, board);
    broadcast();
    return c.json({ ok: true });
  });

  // GET /api/events — SSE stream
  app.get('/api/events', (c) => {
    return streamSSE(c, async (stream) => {
      // Send initial board state
      const board = loadBoard(projectDir);
      await stream.writeSSE({ data: JSON.stringify(board), event: 'board' });

      // Register for broadcasts
      const handler = async (board: Board) => {
        try {
          await stream.writeSSE({ data: JSON.stringify(board), event: 'board' });
        } catch {
          // Client disconnected
          sseClients.delete(handler);
        }
      };
      sseClients.add(handler);

      // Keep alive until client disconnects
      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          sseClients.delete(handler);
          resolve();
        });
      });
    });
  });

  // Static file serving for the UI
  if (uiDir) {
    app.get('*', (c) => {
      const urlPath = c.req.path === '/' ? '/index.html' : c.req.path;
      const filePath = join(uiDir, urlPath);

      if (existsSync(filePath)) {
        const content = readFileSync(filePath);
        const ext = extname(filePath);
        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        return new Response(content, {
          headers: { 'Content-Type': mime },
        });
      }

      // SPA fallback — serve index.html for unmatched routes
      const indexPath = join(uiDir, 'index.html');
      if (existsSync(indexPath)) {
        const content = readFileSync(indexPath);
        return new Response(content, {
          headers: { 'Content-Type': 'text/html' },
        });
      }

      return c.text('Not found', 404);
    });
  }

  return { app, broadcast };
}
