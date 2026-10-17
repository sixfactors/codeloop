import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { createServer, request, type Server } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import { getRequestListener } from '@hono/node-server';
import { createCard } from '../engine.js';
import { closeIndex } from '../index/index.js';
import { readCards, writeCards } from '../cards.js';
import { writeMocksIndex } from '../mock.js';
import { appMockRoutes, findWorkspaceBuild, frozenConfig, hubListener, splitListener } from '../next-server.js';
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

describe('mocks: an in-app mock page goes to Next, an HTML mock and the gallery stay on Hono', () => {
  const write = (path: string, text: string) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); };
  const appMocks = new Set(['118-holder']);
  beforeEach(() => {
    write('.codeloop/config.yaml', 'project:\n  name: demo\nmock:\n  target: app\n  app_dir: workspace/app\n');
    createCard(dir, { lane: 'build', title: 'Holder', id: 'c-118' });
    const file = readCards(dir);
    writeCards(dir, file, file.cards.map(c => (c.id === 'c-118' ? { ...c, spec: 'specs/118-holder' } : c)));
    write('specs/118-holder/spec.md', '# Holder\n');
    write('workspace/app/mocks/118-holder/page.tsx', '<section data-screen="story-properties" />\n');
    write('.codeloop/mocks/c-1.html', '<html><title>c-1 One card</title><body>the html mock</body></html>');
    writeMocksIndex(dir);
  });
  const pagesSeen = (seen: { url: string; project?: string }[]) => (req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
    seen.push({ url: req.url ?? '', project: req.headers['x-codeloop-project'] as string | undefined });
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html>page</html>');
  };
  const listen = async (handler: import('http').RequestListener) => {
    server = createServer(handler);
    await new Promise<void>(r => server!.listen(0, '127.0.0.1', r));
    return (server.address() as { port: number }).port;
  };

  it('at the board: the gallery links both, the app mock opens as a page and the HTML mock from Hono', async () => {
    const { app } = createApp(dir);
    const seen: { url: string; project?: string }[] = [];
    const port = await listen(splitListener(getRequestListener(app.fetch), pagesSeen(seen), { appMocks }));
    const gallery = `http://127.0.0.1:${port}/mocks/`;
    const html = await (await fetch(gallery)).text();
    const links = [...html.matchAll(/<a href="([^"]+)">(c-[^<]+)<\/a>/g)].map(m => ({ href: m[1], id: m[2] }));
    expect(links.map(l => l.id).sort()).toEqual(['c-1', 'c-118']);
    const appLink = new URL(links.find(l => l.id === 'c-118')!.href, gallery);
    expect(appLink.pathname).toBe('/mocks/118-holder/');
    expect((await fetch(appLink)).status).toBe(200);
    expect(seen).toEqual([{ url: '/mocks/118-holder/', project: undefined }]);
    const htmlMock = await fetch(new URL(links.find(l => l.id === 'c-1')!.href, gallery));
    expect(await htmlMock.text()).toContain('the html mock');
    // A folder the build has no page for is not handed to Next.
    expect((await fetch(`http://127.0.0.1:${port}/mocks/132-unbuilt/`)).status).toBe(404);
    expect(seen).toHaveLength(1);
  });

  it('under the hub: the gallery link to an app mock is sent to the project page, which reaches Next with the project', async () => {
    const seen: { url: string; project?: string }[] = [];
    const apiSeen: string[] = [];
    const api = (req: import('http').IncomingMessage, res: import('http').ServerResponse) => {
      apiSeen.push(req.url ?? '');
      res.writeHead(404);
      res.end();
    };
    const port = await listen(hubListener(api, pagesSeen(seen), { appMocks }));
    const host = `localhost:${port}`;
    expect(await getAs(host, port, '/api/p/demo/mocks/118-holder/')).toMatchObject({ status: 302, location: '/p/demo/mocks/118-holder/' });
    expect((await getAs(host, port, '/p/demo/mocks/118-holder/')).status).toBe(200);
    expect(seen).toEqual([{ url: '/mocks/118-holder/', project: 'demo' }]);
    await getAs(host, port, '/api/p/demo/mocks/@/.codeloop/mocks/c-1.html');
    expect(apiSeen).toEqual(['/api/p/demo/mocks/@/.codeloop/mocks/c-1.html']);
  });

  it('reads the app mocks a build can render from its route manifest', () => {
    const root = mkdtempSync(join(tmpdir(), 'codeloop-routes-'));
    expect(appMockRoutes(root)).toEqual(new Set());
    mkdirSync(join(root, '.next'), { recursive: true });
    writeFileSync(join(root, '.next/app-path-routes-manifest.json'), JSON.stringify({ '/mocks/page': '/mocks', '/mocks/118-holder/page': '/mocks/118-holder', '/cards/[id]/page': '/cards/[id]' }));
    expect(appMockRoutes(root)).toEqual(new Set(['118-holder']));
    rmSync(root, { recursive: true, force: true });
  });
});
