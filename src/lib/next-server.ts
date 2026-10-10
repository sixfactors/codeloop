import { createReadStream, existsSync, readFileSync, statSync } from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';
import { createRequire } from 'module';
import { extname, join, resolve, sep } from 'path';

export type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Hono answers these; everything else is a page. */
export const isApiPath = (url: string) => /^\/(api|mocks)(\/|\?|$)/.test(url);

/**
 * Where a standalone workspace build lives: the packaged one first, then a dev checkout's own
 * `next build` output (nested under `standalone/workspace/` when Next traced from the repo root).
 * `CODELOOP_WORKSPACE_DIR` names one explicitly, or `none` to serve no app.
 */
export function findWorkspaceBuild(packageRoot: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  const wanted = env.CODELOOP_WORKSPACE_DIR;
  if (wanted === 'none') return undefined;
  const standalone = join(packageRoot, 'workspace', '.next', 'standalone');
  const candidates = wanted ? [wanted] : [join(packageRoot, 'dist', 'workspace'), standalone, join(standalone, 'workspace')];
  return candidates.find(dir => existsSync(join(dir, 'server.js')) && existsSync(join(dir, '.next', 'BUILD_ID')));
}

/**
 * The config `next build` froze into the standalone output, so no next.config.ts is needed at run
 * time. `output` is dropped: the build already applied it, and `next()` in server mode warns that
 * "next start" does not work with `output: standalone` when it sees the key again.
 */
export function frozenConfig(dir: string): Record<string, unknown> | undefined {
  const file = join(dir, '.next', 'required-server-files.json');
  if (!existsSync(file)) return undefined;
  try {
    const conf = (JSON.parse(readFileSync(file, 'utf-8')) as { config?: Record<string, unknown> }).config;
    if (!conf) return undefined;
    const { output: _output, ...rest } = conf;
    return rest;
  } catch {
    return undefined;
  }
}

/**
 * Starts Next in server mode over a build and returns its request handler, or undefined when no
 * `next` can be found: the build's own node_modules (a standalone build ships one), then this
 * package's optional peer. Without it `codeloop serve` falls back to the static board.
 */
export async function loadNext(dir: string, opts: { hostname: string; port: number }): Promise<NodeHandler | undefined> {
  type NextFactory = (o: Record<string, unknown>) => { prepare(): Promise<void>; getRequestHandler(): NodeHandler };
  let next: NextFactory | undefined;
  try {
    next = createRequire(join(dir, 'package.json'))('next') as NextFactory;
  } catch {
    try {
      const name = 'next';
      next = ((await import(name)) as { default: NextFactory }).default;
    } catch {
      return undefined;
    }
  }
  const conf = frozenConfig(dir);
  // The standalone build does not ship Next's webpack bundle. Next's own standalone server.js avoids
  // loading it by handing the frozen config through this env var before `next()` is called, and by
  // taking the internal (customServer:false) path; do both.
  if (conf && !process.env.__NEXT_PRIVATE_STANDALONE_CONFIG) process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(conf);
  const app = next({ dev: false, dir, hostname: opts.hostname, port: opts.port, customServer: false, ...(conf ? { conf } : {}) });
  await app.prepare();
  return app.getRequestHandler();
}

/**
 * One listener for one port: `/api/*` and `/mocks/*` go to Hono, the rest to the pages handler.
 * Pages are server-rendered with board data, so they get the same loopback-host rule as the API.
 */
const CHUNK_MIME: Record<string, string> = { '.js': 'application/javascript', '.css': 'text/css', '.map': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.txt': 'text/plain' };

/**
 * Serves `/_next/static/*` straight from the build. Next's internal server does not serve its own
 * static chunks when it is mounted in-process (it expects a CDN or `next start` to), and the
 * hashed names are safe to cache forever.
 */
export function staticChunks(buildDir: string): NodeHandler | undefined {
  const root = resolve(buildDir, '.next', 'static');
  if (!existsSync(root)) return undefined;
  return (req, res) => {
    const path = decodeURIComponent((req.url ?? '').split('?')[0].replace(/^\/_next\/static\//, ''));
    const file = resolve(root, path);
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': CHUNK_MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' });
    createReadStream(file).pipe(res);
  };
}

export function splitListener(api: NodeHandler, pages: NodeHandler, opts: { anyHost?: boolean; chunks?: NodeHandler } = {}): NodeHandler {
  return (req, res) => {
    const url = req.url ?? '/';
    if (isApiPath(url)) return api(req, res);
    if (opts.chunks && url.startsWith('/_next/static/')) return opts.chunks(req, res);
    const host = (req.headers.host ?? '').replace(/:\d+$/, '');
    if (!opts.anyHost && !LOOPBACK.has(host)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `this board answers only on localhost, not ${req.headers.host}` }));
      return;
    }
    return pages(req, res);
  };
}
