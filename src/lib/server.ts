import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { randomBytes, timingSafeEqual } from 'crypto';
import { existsSync, readFileSync, statSync } from 'fs';
import { join, extname, resolve, sep } from 'path';
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
import { ConflictError, readCards, RefusalError } from './cards.js';
import { rejectCard } from './engine.js';
import { approveFlow } from './flow.js';
import { buildInbox } from './inbox.js';
import { loadLanes } from './lane.js';
import { findMock, MOCKS_DIR } from './mock.js';

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

/** Cards, the lanes they move through and the inbox summary: everything the Cards view draws. */
export function cardsPayload(projectDir: string, owner: boolean) {
  const file = readCards(projectDir);
  const inbox = buildInbox(projectDir);
  return {
    version: file.version,
    owner,
    // `mock` is where the board serves the card's mock, when it has one.
    cards: file.cards.map(c => {
      const mock = findMock(projectDir, c.id);
      return mock ? { ...c, mock: `/${mock.replace(`${MOCKS_DIR}/`, 'mocks/')}` } : c;
    }),
    lanes: loadLanes(projectDir).map(l => ({ id: l.id, version: l.version, stages: l.stages.map(s => ({ id: s.id, skill: s.skill, output: s.output, gate: s.gate })) })),
    inbox: { summary: inbox.summary, needs_you: inbox.needs_you },
  };
}

/**
 * `owner` is set only by `codeloop serve --owner`. Without it the board is read-only for cards.
 * With it, approve and reject still need the start-up token like every other write.
 */
export function createApp(projectDir: string, uiDir?: string, opts: { owner?: boolean; token?: string; anyHost?: boolean } = {}) {
  const app = new Hono();
  const token = opts.token ?? randomBytes(24).toString('hex');
  const sameToken = (given: string | undefined) => !!given && given.length === token.length && timingSafeEqual(Buffer.from(given), Buffer.from(token));
  const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
  const sameHost = (origin: string, host: string) => {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  };

  // There is no login, so the server protects itself three ways. It answers only to a loopback
  // host name (a rebound DNS name cannot read the board). It sends no CORS headers, so other
  // origins cannot read responses. And every write needs the token printed at start-up, a JSON
  // content type, and no foreign Origin, which a page on another site cannot provide.
  app.use('*', async (c, next) => {
    const host = c.req.header('host') ?? new URL(c.req.url).host;
    if (!opts.anyHost && !LOOPBACK.has(host.replace(/:\d+$/, ''))) return c.json({ error: `this board answers only on localhost, not ${host}` }, 403);
    if (c.req.method === 'GET' || c.req.method === 'HEAD') return next();

    const origin = c.req.header('origin');
    if (origin && !sameHost(origin, host)) return c.json({ error: 'cross-origin requests are not accepted' }, 403);
    if (!sameToken(c.req.header('x-codeloop-token'))) return c.json({ error: 'missing or wrong token: open the URL that `codeloop serve` printed' }, 403);
    if (c.req.method !== 'DELETE' && !(c.req.header('content-type') ?? '').startsWith('application/json')) return c.json({ error: 'content type must be application/json' }, 415);
    return next();
  });

  // Track SSE clients for broadcasting
  const sseClients = new Set<(board: Board) => void>();

  const cardClients = new Set<(payload: string) => void>();
  const owner = opts.owner === true;

  function broadcast() {
    const board = loadBoard(projectDir);
    for (const send of sseClients) {
      send(board);
    }
  }

  function broadcastCards() {
    const payload = JSON.stringify(cardsPayload(projectDir, owner));
    for (const send of cardClients) send(payload);
  }

  app.get('/api/cards', (c) => c.json(cardsPayload(projectDir, owner)));

  // Approve and reject go through the same engine as the CLI, as the owner.
  const decide = (run: (id: string, note: string) => void) => async (c: Context) => {
    if (!owner) return c.json({ error: 'read-only: start the server with `codeloop serve --owner` to approve or reject from the board' }, 403);
    const body = await c.req.json<{ note?: string }>().catch(() => ({ note: undefined }));
    try {
      run(c.req.param('id'), body.note ?? '');
    } catch (e) {
      if (e instanceof RefusalError) return c.json({ error: e.message }, 400);
      if (e instanceof ConflictError) return c.json({ error: e.message }, 409);
      throw e;
    }
    broadcastCards();
    return c.json(cardsPayload(projectDir, owner));
  };
  app.post('/api/cards/:id/approve', decide((id, note) => void approveFlow(projectDir, id, 'owner', note || undefined)));
  app.post('/api/cards/:id/reject', decide((id, note) => void rejectCard(projectDir, id, 'owner', note)));


  // The mock gallery and each mock, straight from docs/mocks. Read-only, and nothing outside that folder.
  app.get('/mocks/*', (c) => {
    const root = resolve(projectDir, MOCKS_DIR);
    let wanted: string;
    try {
      wanted = decodeURIComponent(c.req.path.replace(/^\/mocks\/?/, '')) || 'index.html';
    } catch {
      return c.text('Not found', 404);
    }
    const file = resolve(root, wanted);
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return c.text('Not found', 404);
    return new Response(readFileSync(file), { headers: { 'Content-Type': MIME_TYPES[extname(file)] || 'application/octet-stream' } });
  });
  app.get('/mocks', (c) => c.redirect('/mocks/'));

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

      const sendCards = async (payload: string) => {
        try {
          await stream.writeSSE({ data: payload, event: 'cards' });
        } catch {
          cardClients.delete(sendCards);
        }
      };
      await sendCards(JSON.stringify(cardsPayload(projectDir, owner)));
      cardClients.add(sendCards);

      // Keep alive until client disconnects
      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          sseClients.delete(handler);
          cardClients.delete(sendCards);
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

  return { app, broadcast, broadcastCards, token };
}
