import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { createServer, request, type Server } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import { getRequestListener } from '@hono/node-server';
import { createCard } from '../engine.js';
import { closeIndex } from '../index/index.js';
import { findWorkspaceBuild, frozenConfig, splitListener } from '../next-server.js';
import { createApp } from '../server.js';

let dir: string;
let server: Server | undefined;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-next-')));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/config.yaml'), 'project:\n  name: demo\n');
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: draft\n    done: { cmd: "true" }\n');
  createCard(dir, { lane: 'build', title: 'One card', id: 'c-1' });
});

afterEach(async () => {
  await new Promise<void>(r => (server ? server.close(() => r()) : r()));
  await closeIndex(dir);
  rmSync(dir, { recursive: true, force: true });
});

describe('one port, two handlers', () => {
  it('hands /wiki/x to the pages handler and keeps /api/* and /mocks/* on Hono', async () => {
    const { app } = createApp(dir);
    const seen: string[] = [];
    // Stands in for Next's request handler: records the path and answers like a rendered page.
    const pages = (req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
      seen.push(req.url ?? '');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html>page</html>');
    };
    server = createServer(splitListener(getRequestListener(app.fetch), pages));
    await new Promise<void>(r => server!.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    const base = `http://127.0.0.1:${port}`;

    const page = await fetch(`${base}/wiki/x`);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toBe('<html>page</html>');

    const cards = await (await fetch(`${base}/api/cards`)).json();
    expect(cards.cards.map((c: { id: string }) => c.id)).toEqual(['c-1']);
    expect((await fetch(`${base}/mocks/`)).status).toBe(404);
    expect(seen).toEqual(['/wiki/x']);

    // A rebound DNS name reaches the same port, and the pages are refused like the API is.
    // (fetch refuses to set Host, so a raw request carries the foreign name.)
    const status = await new Promise<number>(r => request({ host: '127.0.0.1', port, path: '/wiki/x', headers: { Host: 'board.attacker.example' } }, res => r(res.statusCode ?? 0)).end());
    expect(status).toBe(403);
    expect(seen).toEqual(['/wiki/x']);
  });

  it('finds the packaged standalone build before a checkout build, and nothing without a server and a BUILD_ID', () => {
    const root = mkdtempSync(join(tmpdir(), 'codeloop-pkg-'));
    const build = (dir: string) => {
      mkdirSync(join(root, dir, '.next'), { recursive: true });
      writeFileSync(join(root, dir, '.next/BUILD_ID'), 'x');
      writeFileSync(join(root, dir, 'server.js'), '');
    };
    expect(findWorkspaceBuild(root, {})).toBeUndefined();
    build('workspace/.next/standalone/workspace');
    expect(findWorkspaceBuild(root, {})).toBe(join(root, 'workspace/.next/standalone/workspace'));
    build('dist/workspace');
    expect(findWorkspaceBuild(root, {})).toBe(join(root, 'dist/workspace'));
    expect(findWorkspaceBuild(root, { CODELOOP_WORKSPACE_DIR: 'none' })).toBeUndefined();
    rmSync(root, { recursive: true, force: true });
  });

  it('drops `output` from the frozen build config so server mode does not warn about standalone', () => {
    const root = mkdtempSync(join(tmpdir(), 'codeloop-conf-'));
    mkdirSync(join(root, '.next'), { recursive: true });
    writeFileSync(join(root, '.next/required-server-files.json'), JSON.stringify({ config: { output: 'standalone', basePath: '', distDir: '.next' } }));
    expect(frozenConfig(root)).toEqual({ basePath: '', distDir: '.next' });
    expect(frozenConfig(root)).not.toHaveProperty('output');
    rmSync(root, { recursive: true, force: true });
  });
});
