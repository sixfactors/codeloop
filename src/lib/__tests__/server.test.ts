import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createApp } from '../server.js';

describe('server', () => {
  let tmpDir: string;
  let app: ReturnType<typeof createApp>['app'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'codeloop-server-'));
    mkdirSync(join(tmpDir, '.codeloop/lanes'), { recursive: true });
    writeFileSync(join(tmpDir, '.codeloop/config.yaml'), 'project:\n  name: demo\n');
    writeFileSync(join(tmpDir, '.codeloop/cards.json'), JSON.stringify({ version: 1, cards: [] }));
    const created = createApp(tmpDir, undefined, { token: 'test-token' });
    app = { request: (path: string, init: RequestInit = {}) => created.app.request(path, { ...init, headers: { ...init.headers, 'x-codeloop-token': 'test-token' } }) } as typeof created.app;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('retired task board', () => {
    it('serves the six-state board at /api/board, not the legacy task board, and no /api/tasks', async () => {
      const board = await (await app.request('/api/board')).json() as { columns: { state: string }[] };
      expect(board.columns.map(c => c.state)).toEqual(['up-next', 'in-progress', 'needs-you', 'done']);
      expect((await app.request('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status).toBe(404);
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
