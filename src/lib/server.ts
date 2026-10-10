import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { existsSync, readFileSync, statSync } from 'fs';
import { join, extname, resolve, sep } from 'path';
import {
  loadBoard,
  saveBoard,
  addTask,
  updateTask,
  deleteTask,
  getTask,
  type AddTaskInput,
  type Task,
} from './board.js';
import { ConflictError, RefusalError } from './cards.js';
import { getIndex, type Diff, type ProjectIndex } from './index/index.js';
import { readInboxSeen } from './inbox.js';
import { MOCKS_DIR } from './mock.js';
import * as services from './services.js';
import { openStore, type Store } from './store/index.js';
import type { StoryFlags } from './story.js';

export { cardFilter, cardsPayload } from './services.js';

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

/** `include=events,inbox`: which optional parts of a cards response the caller wants. */
export const includes = (qs: URLSearchParams) => new Set((qs.get('include') ?? '').split(',').map(s => s.trim()).filter(Boolean));

const int = (value: string | null | undefined) => (value ? parseInt(value, 10) || undefined : undefined);

/**
 * The HTTP face of the service layer: every route parses the request, calls one function in
 * services.ts and shapes the status. `owner` is set only by `codeloop serve --owner`. Without it
 * the board is read-only for cards. With it, approve and reject still need the start-up token
 * like every other write.
 */
export function createApp(projectDir: string, uiDir?: string, opts: { owner?: boolean; token?: string; anyHost?: boolean; store?: Store } = {}) {
  const app = new Hono();
  const store = opts.store ?? openStore(projectDir);
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

  const index: ProjectIndex = getIndex(projectDir, store);
  const owner = opts.owner === true;
  const role = owner ? 'owner' : 'agent';

  // Live clients get one diff per changed entity. The index is the only source: a write made
  // here, by the CLI in another process, or by an editor on a file all reach it the same way.
  type Sink = (diffs: Diff[]) => void;
  const sinks = new Set<Sink>();
  index.subscribe(diffs => {
    for (const send of sinks) send(diffs);
  });
  const legacyBoard = (id: string, kind: 'put' | 'remove') => {
    const diff = { repo: 'board', id, version: statSync(join(projectDir, '.codeloop/board.json'), { throwIfNoEntry: false })?.mtimeMs ?? 0, kind } as unknown as Diff;
    for (const send of sinks) send([diff]);
  };

  // After an engine write in this process the index is patched before the response, so the
  // caller's next read sees it; the file watcher's later report of the same file is a no-op.
  const refreshCards = () => index.patch({ repo: 'cards' });
  /** For `codeloop watch` and the serve watcher: cards.json or board.json moved on disk. */
  const broadcast = () => void refreshCards();
  const broadcastCards = broadcast;

  // One ETag per response, from the collections' counters and the query. `no-cache` makes the
  // browser revalidate every time, and a match answers 304 with no body.
  const etag = (...parts: (string | number)[]) => `"${createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16)}"`;
  const matches = (c: Context, tag: string) => (c.req.header('if-none-match') ?? '').split(',').map(t => t.trim().replace(/^W\//, '')).includes(tag);
  const cached = (c: Context, tag: string, body: () => Promise<object> | object) => {
    c.header('Cache-Control', 'no-cache');
    c.header('ETag', tag);
    if (matches(c, tag)) return c.body(null, 304);
    return Promise.resolve(body()).then(data => c.json(data));
  };
  const v = index.versions;
  const query = (c: Context) => new URL(c.req.url).searchParams;
  const pageId = (c: Context) => decodeURIComponent(c.req.path.replace(/^\/api\/pages\//, ''));
  const notFound = (c: Context, what: string) => c.json({ error: `${what} not found` }, 404);
  const readOnly = (c: Context, what: string) => c.json({ error: `read-only: start the server with \`codeloop serve --owner\` to ${what} from the board` }, 403);

  // A read: the engine's refusals are 400, or 404 when they say "not found".
  const handled = (fn: (c: Context) => Promise<Response>) => async (c: Context) => {
    try {
      await index.ready;
      return await fn(c);
    } catch (e) {
      if (e instanceof RefusalError) return c.json({ error: e.message }, e.message.includes('not found') ? 404 : 400);
      throw e;
    }
  };
  // A write: 400 for a refusal whatever its wording, 409 for a version conflict.
  const writing = (fn: (c: Context) => Promise<Response>) => async (c: Context) => {
    try {
      await index.ready;
      return await fn(c);
    } catch (e) {
      if (e instanceof RefusalError) return c.json({ error: e.message }, 400);
      if (e instanceof ConflictError) return c.json({ error: e.message }, 409);
      throw e;
    }
  };
  const json = <T,>(c: Context, fallback: T) => c.req.json<T>().catch(() => fallback);

  app.get('/api/cards', async c => {
    await index.ready;
    const qs = query(c);
    const include = includes(qs);
    return cached(c, etag('cards', v.cards, v.lanes, v.pages, v.features, owner ? 1 : 0, qs.toString()), () =>
      services.cardsPayload(index, owner, {
        filter: services.cardFilter(qs, role),
        cursor: qs.get('cursor') ?? undefined,
        limit: int(qs.get('limit')),
        includeEvents: include.has('events'),
        includeInbox: include.has('inbox'),
        facets: qs.get('facets') === '1',
      }),
    );
  });

  app.get('/api/inbox', async c => {
    await index.ready;
    const qs = query(c);
    const seen = readInboxSeen(projectDir);
    const sort = qs.get('sort');
    return cached(c, etag('inbox', v.cards, v.lanes, v.pages, v.features, seen, owner ? 1 : 0, qs.toString()), () =>
      services.inboxPaged(projectDir, index, {
        shippedSince: qs.get('shippedSince') ?? undefined,
        initiative: qs.get('initiative') ?? undefined,
        epic: qs.get('epic') ?? undefined,
        feature: qs.get('feature') ?? undefined,
        band: qs.get('band') ?? undefined,
        needsMe: qs.get('needsMe') === '1' ? role : undefined,
        sort: sort === 'age' ? 'age' : 'score',
        limit: int(qs.get('limit')),
        cursor: qs.get('cursor') ?? undefined,
        questionsCursor: qs.get('questionsCursor') ?? undefined,
        shippedCursor: qs.get('shippedCursor') ?? undefined,
      }),
    );
  });
  // The inbox as `codeloop inbox` prints it, for the SDK's http transport.
  app.get('/api/inbox/report', handled(async c => c.json(services.inboxReport(projectDir, { sort: query(c).get('sort') === 'age' ? 'age' : 'score' }))));
  app.post('/api/inbox/seen', writing(async c => {
    services.inboxSeen(projectDir);
    return c.json({ ok: true });
  }));

  // Approve and reject go through the same engine as the CLI, as the owner.
  const decide = (run: (id: string, note: string) => services.DecisionReport) => writing(async c => {
    if (!owner) return readOnly(c, 'approve or reject');
    const body = await json(c, { note: undefined as string | undefined });
    const decision = run(c.req.param('id'), body.note ?? '');
    await refreshCards();
    return c.json({ ...(await services.cardsPayload(index, owner, { includeInbox: true })), decision });
  });
  app.post('/api/cards/:id/approve', decide((id, note) => services.approve(projectDir, id, 'owner', note || undefined)));
  app.post('/api/cards/:id/reject', decide((id, note) => services.reject(projectDir, id, 'owner', note)));

  // Advancing runs the stage's check the way `codeloop next` does; it changes the board, so it is a token write.
  app.post('/api/cards/:id/advance', writing(async c => {
    const body = await json(c, { event: undefined as string | undefined });
    const report = services.advance(projectDir, c.req.param('id'), { event: body.event });
    await refreshCards();
    return c.json(report);
  }));

  const patchQuestions = async (ref: string) => {
    await refreshCards();
    const card = await index.cards.get(ref);
    if (card?.specDir) await index.patch({ repo: 'questions', path: `${card.specDir}/interview.md` });
  };
  app.get('/api/cards/:id/questions', handled(async c => c.json(services.questions(projectDir, c.req.param('id')))));
  app.post('/api/cards/:id/questions', writing(async c => {
    const body = await json(c, { questions: [] as { question: string; recommended?: string }[] });
    const added = services.ask(projectDir, c.req.param('id'), body.questions ?? [], role);
    await patchQuestions(c.req.param('id'));
    return c.json(added, 201);
  }));
  // An answer is the owner's decision, so it needs the same standing as an approval.
  app.post('/api/cards/:id/questions/:n/answer', writing(async c => {
    if (!owner) return readOnly(c, 'answer');
    const body = await json(c, {} as { text?: string; accept?: boolean });
    services.answer(projectDir, c.req.param('id'), parseInt(c.req.param('n'), 10), { text: body.text, accept: body.accept === true }, 'owner');
    await patchQuestions(c.req.param('id'));
    return c.json(services.questions(projectDir, c.req.param('id')));
  }));

  app.get('/api/cards/:id/brief', handled(async c => c.text(services.brief(projectDir, c.req.param('id')))));

  // A stage run: the check, the configured agent when it fails, one advance. The run goes on after
  // the response; /api/runs/:runId reads it and /stream follows its log.
  app.post('/api/cards/:id/run', writing(async c => {
    const body = await json(c, { agent: undefined as string | undefined });
    const started = services.runCard(projectDir, c.req.param('id'), { agent: body.agent || undefined });
    return c.json({ runId: started.runId }, 202);
  }));
  app.get('/api/runs/:runId', handled(async c => {
    const found = services.run(projectDir, c.req.param('runId'));
    if (!found) return notFound(c, `run ${c.req.param('runId')}`);
    await refreshCards();
    return c.json(found);
  }));
  app.get('/api/runs/:runId/stream', async c => {
    const runId = c.req.param('runId');
    if (!services.runExists(projectDir, runId)) return notFound(c, `run ${runId}`);
    return streamSSE(c, async stream => {
      const controller = new AbortController();
      stream.onAbort(() => controller.abort());
      for await (const item of services.runStream(projectDir, runId, controller.signal)) {
        if ('line' in item) await stream.writeSSE({ data: item.line });
        else {
          await refreshCards();
          await stream.writeSSE({ event: 'end', data: JSON.stringify(item.end) });
        }
      }
    });
  });

  // The current stage's output file, by the path the lane names; nothing outside the project.
  app.get('/api/cards/:id/output', handled(async c => c.json(services.stageOutput(projectDir, c.req.param('id')))));
  app.put('/api/cards/:id/output', writing(async c => {
    const body = await json(c, { text: undefined as string | undefined });
    const written = services.writeStageOutput(projectDir, c.req.param('id'), body.text as string, role);
    await refreshCards();
    return c.json(written);
  }));

  // Siblings under the same feature, each with `split_from`; the story check runs on every title first.
  app.post('/api/cards/:id/split', writing(async c => {
    const body = await json(c, { titles: [] as string[] });
    const made = services.splitCard(projectDir, c.req.param('id'), body.titles, role);
    await refreshCards();
    return c.json(made, 201);
  }));

  // Setup: what init would detect, the skills index, and where the project stands.
  app.post('/api/setup/detect', writing(async c => c.json(services.detectSetup(projectDir))));
  app.post('/api/setup/adopt', writing(async c => {
    const body = await json(c, { from: undefined as string[] | undefined, replace: undefined as boolean | undefined });
    const { entries: _entries, ...counts } = services.adoptSkills(projectDir, { from: body.from, replace: body.replace === true });
    return c.json(counts);
  }));
  app.get('/api/setup/status', handled(async c => c.json(services.setupStatus(projectDir))));
  app.get('/api/cards/:id/show', handled(async c => c.json(services.showCard(projectDir, c.req.param('id')))));
  app.get('/api/cards/:id/full', handled(async c => c.json(await services.cardFull(index, store, c.req.param('id')))));

  // One card with its event log, by id or number.
  app.get('/api/cards/:id', handled(async c => {
    const card = await services.getCard(index, c.req.param('id'));
    if (!card) return notFound(c, `card ${c.req.param('id')}`);
    return cached(c, etag('card', card.id, card.version), () => ({ card }));
  }));

  app.get('/api/lanes', handled(async c => cached(c, etag('lanes', v.lanes), async () => ({ lanes: await index.lanes.list() }))));
  app.get('/api/initiatives', handled(async c => cached(c, etag('initiatives', v.initiatives, v.features), async () => ({ initiatives: await index.initiatives.list() }))));
  app.get('/api/initiatives/:id/tree', handled(async c => {
    const initiative = await services.initiativeTree(index, c.req.param('id'));
    return initiative ? cached(c, etag('initiative-tree', c.req.param('id'), v.initiatives, v.epics, v.features, v.cards), () => ({ initiative })) : notFound(c, `initiative ${c.req.param('id')}`);
  }));

  // The roadmap pages: epics and features with their scores, and the trees down to stories.
  app.get('/api/epics', handled(async c => cached(c, etag('epics', v.epics, v.features), async () => ({ epics: await services.listEpics(index) }))));
  app.get('/api/epics/:id/tree', handled(async c => {
    const epic = await services.epicTree(index, c.req.param('id'));
    return epic ? cached(c, etag('epic-tree', c.req.param('id'), v.epics, v.features, v.cards), () => ({ epic })) : notFound(c, `epic ${c.req.param('id')}`);
  }));
  app.post('/api/epics', writing(async c => c.json({ epic: await services.newEpic(projectDir, await json(c, {} as services.EpicInput)) }, 201)));
  app.get('/api/features', handled(async c => cached(c, etag('features', v.features), async () => ({ features: await services.listFeatures(index) }))));
  app.get('/api/features/:id', handled(async c => {
    const feature = await services.featureDetail(index, c.req.param('id'));
    return feature ? cached(c, etag('feature', c.req.param('id'), v.features, v.cards), () => ({ feature })) : notFound(c, `feature ${c.req.param('id')}`);
  }));
  app.post('/api/features', writing(async c => c.json({ feature: await services.newFeature(projectDir, await json(c, {} as services.FeatureInput)) }, 201)));
  app.post('/api/features/:id/score', writing(async c => c.json({ feature: await services.scoreFeature(projectDir, c.req.param('id'), await json(c, {} as services.FeatureInput['rice'] & object)) })));

  app.get('/api/pages', handled(async c => {
    const qs = query(c);
    return cached(c, etag('pages', v.pages, qs.toString()), () => services.listPagesIndexed(index, { folder: qs.get('folder') ?? undefined, q: qs.get('q') ?? undefined }, qs.get('cursor') ?? undefined, int(qs.get('limit'))));
  }));
  // No markdown renderer is a dependency, so the body is served raw for the app to render.
  app.get('/api/pages/*', handled(async c => {
    const id = pageId(c);
    const page = await services.getPage(index, id);
    if (!page) return notFound(c, `page ${id}`);
    return cached(c, etag('page', id, String(page.version)), () => ({ page }));
  }));
  app.put('/api/pages/*', writing(async c => {
    const { page, created } = await services.putPage(index, store, pageId(c), await json(c, {} as services.PageWrite));
    return c.json({ page }, created ? 201 : 200);
  }));
  app.delete('/api/pages/*', writing(async c => ((await services.deletePage(index, store, pageId(c))) ? c.json({ ok: true }) : notFound(c, `page ${pageId(c)}`))));

  app.get('/api/evidence/:nnn', handled(async c => {
    const found = await services.evidenceDetail(projectDir, store, c.req.param('nnn'));
    return found ? c.json(found) : notFound(c, `evidence ${c.req.param('nnn')}`);
  }));

  app.get('/api/artifacts', handled(async c => cached(c, etag('artifacts', v.artifacts), async () => ({ artifacts: await services.artifacts(index) }))));
  app.get('/api/stats', handled(async c => cached(c, etag('stats', v.cards, v.lanes), () => services.stats(index))));
  app.get('/api/config', handled(async c => c.json({ config: await services.publicConfig(store) })));

  // The wiki pages the engine injects before a stage, as `codeloop wiki list|inject|lint` read them.
  app.get('/api/wiki/entries', handled(async c => c.json({ entries: services.wikiEntries(projectDir) })));
  app.get('/api/wiki/inject', handled(async c => c.json({ entries: services.wikiInject(projectDir, query(c).getAll('file')) })));
  app.get('/api/wiki/lint', handled(async c => c.json(services.wikiLint(projectDir))));
  // The outline a repo scan would seed (dry run) and the write that seeds it, for the Setup screen.
  app.get('/api/wiki/outline', handled(async c => c.json(services.wikiOutline(projectDir))));
  app.post('/api/wiki/outline', handled(async c => {
    const body = await c.req.json<{ force?: boolean }>().catch(() => ({}) as { force?: boolean });
    return c.json(services.writeWikiOutline(projectDir, { force: !!body.force }));
  }));

  // A new card or a proposal, made the way `codeloop card new` and `card propose` make one: the
  // story check runs first, so a technical title is refused with the same message the CLI prints.
  app.post('/api/cards', writing(async c => {
    type NewCard = { lane?: string; title?: string; propose?: boolean; id?: string; description?: string; source?: string } & StoryFlags;
    const body = await json(c, {} as NewCard);
    if (!body.lane || !body.title) return c.json({ error: 'lane and title are required' }, 400);
    const input = { ...body, lane: body.lane, title: body.title };
    const made = body.propose ? services.newProposal(projectDir, input, role) : services.newCard(projectDir, input, role);
    await refreshCards();
    return c.json(made, 201);
  }));

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

  // The legacy task board, kept for `codeloop watch`.
  app.get('/api/board', (c) => c.json(loadBoard(projectDir)));

  app.post('/api/tasks', async (c) => {
    const body = await c.req.json<AddTaskInput>();
    let board = loadBoard(projectDir);
    board = addTask(board, body);
    saveBoard(projectDir, board);

    const task = board.tasks[board.tasks.length - 1];
    legacyBoard(task.id, 'put');
    return c.json(task, 201);
  });

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
    legacyBoard(id, 'put');
    return c.json(task);
  });

  app.delete('/api/tasks/:id', (c) => {
    const id = c.req.param('id');
    let board = loadBoard(projectDir);

    try {
      board = deleteTask(board, id);
    } catch (e: any) {
      return c.json({ error: e.message }, 404);
    }

    saveBoard(projectDir, board);
    legacyBoard(id, 'remove');
    return c.json({ ok: true });
  });

  // GET /api/events: a `hello` with the collections' version counters, then one message per
  // changed entity, `{repo, id, version, kind}`. Diffs landing within 50 ms go out together, the
  // last one per entity winning, so a burst of file writes is one flush.
  app.get('/api/events', (c) => {
    return streamSSE(c, async (stream) => {
      let pending = new Map<string, Diff>();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let open = true;
      const flush = async () => {
        timer = undefined;
        const batch = [...pending.values()];
        pending = new Map();
        for (const diff of batch) {
          if (!open) return;
          try {
            await stream.writeSSE({ data: JSON.stringify(diff) });
          } catch {
            open = false;
            sinks.delete(sink);
          }
        }
      };
      const sink: Sink = diffs => {
        for (const d of diffs) pending.set(`${d.repo}:${d.id}`, d);
        timer ??= setTimeout(() => void flush(), 50);
      };
      await index.ready;
      await stream.writeSSE({ data: JSON.stringify({ type: 'hello', versions: { ...index.versions } }) });
      sinks.add(sink);

      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          open = false;
          sinks.delete(sink);
          if (timer) clearTimeout(timer);
          resolve();
        });
      });
    });
  });

  // Static file serving for the UI
  if (uiDir) {
    app.get('*', (c) => {
      const urlPath = c.req.path === '/' ? '/index.html' : c.req.path;
      const root = resolve(uiDir);
      // A static export has a folder per route (`/inbox` -> `inbox/index.html`) and, for a dynamic
      // route built without ids, a `_` folder (`/cards/c-1` -> `cards/_/index.html`) whose page
      // reads the id from the URL. Try them in that order; nothing outside the UI folder is served.
      const candidates = [urlPath, `${urlPath.replace(/\/$/, '')}/index.html`];
      const segments = urlPath.split('/').filter(Boolean);
      if (segments.length >= 2) {
        // Next's client router fetches `<route>/index.txt` for a client-side navigation; without it
        // the router falls back to a full page load on every link.
        candidates.push(urlPath.endsWith('.txt') ? `/${segments[0]}/_/index.txt` : `/${segments[0]}/_/index.html`);
      }
      for (const candidate of candidates) {
        const filePath = resolve(root, `.${candidate}`);
        if (!filePath.startsWith(root + sep) || !existsSync(filePath) || !statSync(filePath).isFile()) continue;
        const content = readFileSync(filePath);
        const ext = extname(filePath);
        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        return new Response(content, { headers: { 'Content-Type': mime } });
      }

      // SPA fallback, serve index.html for unmatched routes
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

  return { app, broadcast, broadcastCards, token, index };
}
