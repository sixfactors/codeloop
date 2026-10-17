import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { createServer, request, type Server } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import { getRequestListener } from '@hono/node-server';
import { createCard } from '../engine.js';
import { closeIndex } from '../index/index.js';
import { findWorkspaceBuild, frozenConfig, hubListener, splitListener } from '../next-server.js';
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

describe('the hub\'s listener: /p/<id>/... rewritten for Next, a project id carried as a header', () => {
  it('strips the /p/<id> prefix, defaults a bare project root to / (the board), and tags the request as hub mode', async () => {
    const seen: { url: string; mode: string | undefined; project: string | undefined }[] = [];
    const pages = (req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
      seen.push({ url: req.url ?? '', mode: req.headers['x-codeloop-mode'] as string | undefined, project: req.headers['x-codeloop-project'] as string | undefined });
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html>page</html>');
    };
    const api = (_req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    };
    server = createServer(hubListener(api, pages));
    await new Promise<void>(r => server!.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    // Page requests name localhost: a 127.0.0.1 page request is redirected (next test).
    const get = (path: string) => getAs(`localhost:${port}`, port, path);

    await get('/p/acme');
    await get('/p/acme/');
    await get('/p/acme/cards/c-1');
    await get('/');
    expect((await get('/api/hub/projects')).type).toContain('json');

    expect(seen).toEqual([
      { url: '/', mode: 'hub', project: 'acme' },
      { url: '/', mode: 'hub', project: 'acme' },
      { url: '/cards/c-1', mode: 'hub', project: 'acme' },
      { url: '/', mode: 'hub', project: undefined },
    ]);
  });
});

/** A GET to the listener on 127.0.0.1 carrying the given Host header, without following redirects. */
function getAs(host: string, port: number, path: string): Promise<{ status: number; location?: string; type?: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, headers: { host } }, res => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode ?? 0, location: res.headers.location, type: res.headers['content-type'] }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('the hub sends a 127.0.0.1 page to localhost, where the sign-in cookie lives', () => {
  it('redirects a page request with path and query kept, and leaves the API and static chunks alone', async () => {
    const seen: string[] = [];
    const pages = (req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
      seen.push(req.url ?? '');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html>page</html>');
    };
    const api = (_req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    };
    const chunks = (_req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end('');
    };
    server = createServer(hubListener(api, pages, { chunks }));
    await new Promise<void>(r => server!.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    const loop = `127.0.0.1:${port}`;

    expect(await getAs(loop, port, '/p/acme/cards/c-1?tab=log')).toMatchObject({ status: 302, location: `http://localhost:${port}/p/acme/cards/c-1?tab=log` });
    expect(seen).toEqual([]);
    expect((await getAs(loop, port, '/api/hub/session')).status).toBe(200);
    expect((await getAs(loop, port, '/_next/static/x.js')).status).toBe(200);
    expect((await getAs(`localhost:${port}`, port, '/p/acme/')).status).toBe(200);
    expect(seen).toEqual(['/']);
  });
});
