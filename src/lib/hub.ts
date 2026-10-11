/**
 * The hub: one process serving every registered project's board, each under its own path, so the
 * data never mixes while several agents write to different projects at once. Every request under
 * `/api/p/:id/*` resolves one `ProjectContext` from that `:id` and is handled entirely inside it —
 * its own store, its own index, its own SSE subscribers — never anything reached by another
 * project's id or by a path on disk this module guessed at itself. No module-level mutable state
 * here is keyed by anything but a project id, and nothing on this path reads the process's own
 * current directory (checked by src/lib/__tests__/no-cwd.test.ts): a hub run from any directory
 * must behave identically.
 */
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { randomBytes, timingSafeEqual } from 'crypto';
import { existsSync } from 'fs';
import { checkHubPassword, readHubAuth } from './hub-auth.js';
import { findProject, listProjects, type ListedProject } from './hub-registry.js';
import { createApp } from './server.js';
import * as services from './services.js';

const IDLE_CLOSE_MS = 30 * 60 * 1000;
const SWEEP_MS = 60 * 1000;

interface ProjectContext {
  id: string;
  /** The project's own write token (createApp's `token`), forwarded on a write the hub already authorised. */
  token: string;
  app: ReturnType<typeof createApp>['app'];
  close: () => Promise<void>;
  lastUsed: number;
}

export interface HubOptions {
  /** Sent as `x-codeloop-token`, same header as a project server, same meaning: an agent or the SDK's standing write credential. Printed once at startup. */
  token?: string;
  anyHost?: boolean;
  /** Overrides the 30-minute idle close, for tests. */
  idleMs?: number;
  /** Overrides how often the idle sweep runs (default one minute), for tests. */
  sweepMs?: number;
}

export interface HubApp {
  app: Hono;
  token: string;
  /** Stops the idle-context sweep and closes every open project context; call in tests and on shutdown. */
  close: () => Promise<void>;
  /** For tests: how many project contexts are currently open. */
  openContexts: () => number;
}

/** A gate item as the hub's needs-you feed lists it: a project's own inbox row, labelled with that project. */
type Labelled<T> = T & { project: string; projectName: string };

export function createHubApp(opts: HubOptions = {}): HubApp {
  const app = new Hono();
  const token = opts.token ?? randomBytes(24).toString('hex');
  const idleMs = opts.idleMs ?? IDLE_CLOSE_MS;
  const SESSION_COOKIE = 'codeloop_hub_session';
  const sessions = new Set<string>();
  const sameToken = (given: string | undefined) => !!given && given.length === token.length && timingSafeEqual(Buffer.from(given), Buffer.from(token));
  const signedIn = (c: Context) => {
    const sid = getCookie(c, SESSION_COOKIE);
    return !!sid && sessions.has(sid);
  };
  const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
  const sameHost = (origin: string, host: string) => {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  };

  // Same four protections as a project server (server.ts): loopback-only unless told otherwise, no
  // CORS, sign-in/out exempt from needing a session, every other write needs the hub's own session
  // or token. A project mounted under the hub trusts THIS gate, not its own local.yaml password.
  app.use('*', async (c, next) => {
    const host = c.req.header('host') ?? new URL(c.req.url).host;
    if (!opts.anyHost && !LOOPBACK.has(host.replace(/:\d+$/, ''))) return c.json({ error: `this hub answers only on localhost, not ${host}` }, 403);
    if (c.req.method === 'GET' || c.req.method === 'HEAD') return next();
    const origin = c.req.header('origin');
    if (origin && !sameHost(origin, host)) return c.json({ error: 'cross-origin requests are not accepted' }, 403);
    const path = new URL(c.req.url).pathname;
    if (path === '/api/hub/session/login' || path === '/api/hub/session/logout') return next();
    if (!sameToken(c.req.header('x-codeloop-token')) && !signedIn(c)) return c.json({ error: 'missing or wrong token: sign in, or run `codeloop open` for a link that can' }, 403);
    return next();
  });

  // One context per project, built on first request and reused after. Nothing here is keyed by
  // anything but the project's own id, so two projects can never read or write through each other's.
  const contexts = new Map<string, ProjectContext>();
  function contextFor(id: string): ProjectContext | undefined {
    const open = contexts.get(id);
    if (open) {
      open.lastUsed = Date.now();
      return open;
    }
    const project = findProject(id);
    if (!project || !existsSync(project.path)) return undefined;
    const built = createApp(project.path, undefined, { owner: true, apiBase: `/api/p/${id}`, mocksBase: `/api/p/${id}/mocks` });
    const ctx: ProjectContext = { id, token: built.token, app: built.app, close: () => built.index.close(), lastUsed: Date.now() };
    contexts.set(id, ctx);
    return ctx;
  }
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [id, ctx] of contexts) {
      if (now - ctx.lastUsed < idleMs) continue;
      contexts.delete(id);
      void ctx.close();
    }
  }, opts.sweepMs ?? SWEEP_MS);
  sweep.unref?.();

  const knownIds = () => listProjects().filter(p => !p.missing).map(p => p.id);

  // Every project route lives at /api/p/:id/*, dispatched to that project's own app untouched. A
  // write that reached here already cleared the hub's own gate above, so it is forwarded with this
  // project's own write token: the project's app knows nothing of the hub and checks that token the
  // same way it would under `codeloop serve --standalone`.
  app.all('/api/p/:id/*', async c => {
    const id = c.req.param('id');
    const ctx = contextFor(id);
    if (!ctx) return c.json({ error: `unknown project "${id}"`, known: knownIds() }, 404);
    const req = c.req.raw;
    if (req.method === 'GET' || req.method === 'HEAD') return ctx.app.fetch(req);
    const headers = new Headers(req.headers);
    headers.set('x-codeloop-token', ctx.token);
    const forwarded = new Request(req.url, { method: req.method, headers, body: req.body, duplex: 'half' } as RequestInit);
    return ctx.app.fetch(forwarded);
  });

  // Each known project's own numbers, computed here from its files (services.inboxReport), the
  // same source /api/hub/needs-you reads — never walked client-side, so a 5k-card project costs
  // the hub home page the same as a 5-card one. A project that fails to read (not a codeloop
  // project, or unreadable right now) is listed without counts, not dropped from the list.
  app.get('/api/hub/projects', c => {
    const projects = listProjects().map(p => {
      if (p.missing) return p;
      try {
        const report = services.inboxReport(p.path);
        const active = report.numbers.reduce((n, l) => n + l.active, 0);
        const stuck = report.needs_you.filter(g => g.gate === 'stuck').length;
        return { ...p, counts: { active, waitingOnYou: report.needs_you.length + report.questions.length, stuck } };
      } catch {
        return p;
      }
    });
    return c.json({ projects });
  });

  // "Needs you" across every registered, existing project in one response, each item labelled with
  // its project: computed from each project's own files directly (services.inboxReport), not from
  // a ProjectContext, so listing it never opens a context or touches another project's watcher.
  app.get('/api/hub/needs-you', c => {
    const gates: Labelled<services.Inbox['needs_you'][number]>[] = [];
    const questions: Labelled<services.Inbox['questions'][number]>[] = [];
    for (const p of listProjects()) {
      if (p.missing) continue;
      let report: services.Inbox;
      try {
        report = services.inboxReport(p.path);
      } catch {
        continue; // not a codeloop project, or unreadable right now; skip it, not the whole list
      }
      for (const g of report.needs_you) gates.push({ ...g, project: p.id, projectName: p.name });
      for (const q of report.questions) questions.push({ ...q, project: p.id, projectName: p.name });
    }
    return c.json({ gates, questions, projects: knownIds() });
  });

  app.get('/api/hub/session', c => {
    const projectId = c.req.query('project');
    const project = projectId ? findProject(projectId) : undefined;
    return c.json({
      signedIn: signedIn(c),
      tokenValid: sameToken(c.req.header('x-codeloop-token')),
      defaultPassword: readHubAuth().isDefault,
      ...(project ? { project: { name: project.name, path: project.path } } : {}),
    });
  });
  app.post('/api/hub/session/login', async c => {
    const body = await c.req.json<{ user?: string; password?: string }>().catch(() => ({}) as { user?: string; password?: string });
    const auth = readHubAuth();
    if (body.user !== auth.user || !checkHubPassword(auth, body.password ?? '')) return c.json({ error: 'wrong username or password' }, 401);
    const sid = randomBytes(24).toString('hex');
    sessions.add(sid);
    setCookie(c, SESSION_COOKIE, sid, { httpOnly: true, sameSite: 'Strict', path: '/' });
    return c.json({ ok: true });
  });
  app.post('/api/hub/session/logout', c => {
    const sid = getCookie(c, SESSION_COOKIE);
    if (sid) sessions.delete(sid);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  return {
    app,
    token,
    openContexts: () => contexts.size,
    close: async () => {
      clearInterval(sweep);
      await Promise.all([...contexts.values()].map(ctx => ctx.close()));
      contexts.clear();
    },
  };
}

export type { ListedProject };
