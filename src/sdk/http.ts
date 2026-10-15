/**
 * The http transport: fetch against the Hono API. Browser-safe: nothing from node is imported,
 * so the workspace app bundles it as is. Writes carry the token `codeloop serve` printed; reads
 * send the last ETag seen for the path and reuse the cached body on a 304.
 */
import { ApiError, CodeloopClient, followCardActivity, type AnswerInput, type AskInput, type CardWithEvents, type Transport } from './client.js';
import { CARD_FACETS, type ActivityQuery, type CardActivity, type CardListFilter, type CardsQuery, type InboxQuery, type LiveEvent, type NewCardInput, type PageWrite, type PagesQuery, type ProposalInput, type RoleOption, type RunRecord, type RunStreamItem, type Session } from './types.js';

export interface HttpOptions {
  /** `http://127.0.0.1:4040`; empty for same-origin in a browser. */
  baseUrl?: string;
  /** Sent as `x-codeloop-token` on every write. A function is read per request. */
  token?: string | (() => string);
  /** Defaults to the global fetch; a Hono app's `request` works in tests. */
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  /** Added to every request: a server render passes `{ cache: 'no-store', signal }`. A function is read per request. */
  init?: RequestInit | (() => RequestInit);
  /**
   * The hub's id for this project: every `/api/...` path is sent as `/api/p/<project>/...`
   * instead, so the hub routes the request to this project's own context and no other. Omit it
   * (or leave it empty) to talk to a standalone `codeloop serve`, whose routes are unprefixed. A
   * function is read per request, so a browser client can follow the current page's project.
   */
  project?: string | (() => string | undefined);
}

const encode = (id: string) => id.split('/').map(encodeURIComponent).join('/');

/** Query string for the card list: a multi-valued facet is sent as repeated keys. */
export function cardsSearch(query: CardsQuery = {}, cursor?: string, extra: Record<string, string> = {}): string {
  const qs = new URLSearchParams();
  if (query.q) qs.set('q', query.q);
  for (const k of CARD_FACETS) for (const v of query[k] ?? []) qs.append(k, v);
  if (query.gate) qs.set('gate', query.gate);
  if (query.questions) qs.set('questions', query.questions);
  if (query.shippedSince) qs.set('shippedSince', query.shippedSince);
  if (query.stuck) qs.set('stuck', '1');
  if (query.needsMe) qs.set('needsMe', '1');
  if (query.sort) qs.set('sort', query.sort);
  if (query.limit) qs.set('limit', String(query.limit));
  if (cursor) qs.set('cursor', cursor);
  for (const [k, v] of Object.entries(extra)) qs.set(k, v);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

const search = (params: Record<string, string | number | boolean | undefined>): string => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && v !== false) qs.set(k, String(v));
  const s = qs.toString();
  return s ? `?${s}` : '';
};

export function httpTransport(options: HttpOptions = {}): Transport {
  const base = (options.baseUrl ?? '').replace(/\/$/, '');
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const token = () => (typeof options.token === 'function' ? options.token() : options.token ?? '');
  const extra = () => (typeof options.init === 'function' ? options.init() : options.init ?? {});
  const etags = new Map<string, { etag: string; body: unknown }>();
  // `/api/cards` -> `/api/p/<project>/cards`: the hub routes on that id, not on anything this
  // client guesses from the path, so a project id that resolves to nothing is the hub's 404 to make,
  // not this client's to swallow.
  const scoped = (path: string): string => {
    const project = typeof options.project === 'function' ? options.project() : options.project;
    return project ? path.replace(/^\/api\//, `/api/p/${project}/`) : path;
  };

  async function send(rawPath: string, init: RequestInit = {}): Promise<Response> {
    const path = scoped(rawPath);
    const headers = new Headers(init.headers);
    const method = (init.method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      headers.set('x-codeloop-token', token());
      if (method !== 'DELETE') headers.set('content-type', 'application/json');
    }
    const hit = method === 'GET' ? etags.get(path) : undefined;
    if (hit) headers.set('if-none-match', hit.etag);
    const res = await doFetch(`${base}${path}`, { ...extra(), ...init, headers });
    if (res.status === 304 && hit) return new Response(JSON.stringify(hit.body), { status: 200, headers: { 'content-type': 'application/json', etag: hit.etag } });
    if (!res.ok) {
      const body = (res.headers.get('content-type') ?? '').includes('json') ? await res.json().catch(() => ({})) : {};
      throw new ApiError(res.status, (body as { error?: string }).error ?? `Request failed (${res.status})`);
    }
    return res;
  }

  // A route the server does not have may fall through to an HTML page with a 200, so the content
  // type is checked as well as the status; a missing route surfaces as 404.
  async function json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await send(path, init);
    if (!(res.headers.get('content-type') ?? '').includes('json')) throw new ApiError(404, `No API route for ${path}`);
    const body = (await res.json()) as T;
    const etag = res.headers.get('etag');
    // Same key send() reads back with: scoped() is deterministic for one client, so this and
    // send()'s own lookup always agree on which project's cache entry a path refers to.
    if ((init.method ?? 'GET') === 'GET' && etag) etags.set(scoped(path), { etag, body });
    return body;
  }
  const post = <T,>(path: string, body: unknown) => json<T>(path, { method: 'POST', body: JSON.stringify(body) });
  const missing = async <T,>(run: Promise<T>): Promise<T | undefined> => {
    try {
      return await run;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return undefined;
      throw e;
    }
  };
  const role = (opts?: RoleOption) => (opts?.as ? { as: opts.as } : {});

  // One SSE frame: its event name (default `message`) and its data lines joined.
  async function* frames(rawPath: string, signal?: AbortSignal): AsyncIterable<{ event: string; data: string }> {
    const path = scoped(rawPath);
    const res = await doFetch(`${base}${path}`, { ...extra(), signal, headers: { accept: 'text/event-stream' } });
    if (!res.ok || !res.body) throw new ApiError(res.status, `${path} stream failed (${res.status})`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let at: number;
        while ((at = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, at);
          buffer = buffer.slice(at + 2);
          const lines = frame.split('\n');
          const event = lines.find(l => l.startsWith('event:'))?.slice(6).trim() ?? 'message';
          const data = lines.filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n');
          if (lines.some(l => l.startsWith('data:'))) yield { event, data };
        }
      }
    } finally {
      reader.cancel().catch(() => undefined);
    }
  }

  async function* events(signal?: AbortSignal): AsyncIterable<LiveEvent> {
    for await (const { data } of frames('/api/events', signal)) if (data.trim()) yield JSON.parse(data) as LiveEvent;
  }

  async function* streamRun(runId: string, signal?: AbortSignal): AsyncIterable<RunStreamItem> {
    for await (const { event, data } of frames(`/api/runs/${encodeURIComponent(runId)}/stream`, signal)) {
      if (event === 'end') {
        yield { end: JSON.parse(data) as RunRecord };
        return;
      }
      yield { line: data };
    }
  }

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  return {
    listCards: (query = {}, cursor, opts = {}) => {
      const include = [opts.includeEvents && 'events', opts.includeInbox && 'inbox'].filter(Boolean).join(',');
      return json(`/api/cards${cardsSearch(query, cursor, { ...(include ? { include } : {}), ...(opts.facets ? { facets: '1' } : {}) })}`);
    },
    getCard: ref => missing(json<{ card: CardWithEvents }>(`/api/cards/${encodeURIComponent(ref)}`).then(b => b.card)),
    cardFull: ref => json(`/api/cards/${encodeURIComponent(ref)}/full`),
    showCard: ref => json(`/api/cards/${encodeURIComponent(ref)}/show`),
    cardRecords: async (filter: CardListFilter = {}) => {
      // The store's copy with versions is not served; the index's list carries a version too.
      const facets = { lane: filter.lane, stage: filter.stage, initiative: filter.initiative, epic: filter.epic, feature: filter.feature, band: filter.band?.toUpperCase(), persona: filter.persona, size: filter.size };
      const query: CardsQuery = { limit: 5000 };
      for (const [k, v] of Object.entries(facets)) if (v) query[k as keyof typeof facets] = [v];
      const { cards } = await json<{ cards: CardWithEvents[] }>(`/api/cards${cardsSearch(query, undefined, { include: 'events' })}`);
      return cards.filter(c => (filter.all || c.stage !== 'dropped') && (filter.points === undefined || String(c.points) === String(filter.points)));
    },
    createCard: (input: NewCardInput, opts) => post('/api/cards', { ...input, ...role(opts) }),
    proposeCard: (input: ProposalInput, opts) => post('/api/cards', { ...input, propose: true, ...role(opts) }),
    advanceCard: (ref, opts = {}) => {
      if (!ref) throw new ApiError(400, 'say which card: the http transport cannot pick the active one');
      return post(`/api/cards/${encodeURIComponent(ref)}/advance`, { event: opts.event });
    },
    shapeProblem: (problem, opts) => post('/api/shape', { problem, ...role(opts) }),
    approveCard: (ref, opts = {}) => post<{ decision: Awaited<ReturnType<Transport['approveCard']>> }>(`/api/cards/${encodeURIComponent(ref)}/approve`, { note: opts.note }).then(b => b.decision),
    parkCard: (ref, note) => post<{ parked: Awaited<ReturnType<Transport['parkCard']>> }>(`/api/cards/${encodeURIComponent(ref)}/park`, { note }).then(b => b.parked),
    placeCard: (ref, stage) => post<{ placed: Awaited<ReturnType<Transport['placeCard']>> }>(`/api/cards/${encodeURIComponent(ref)}/place`, { stage }).then(b => b.placed),
    closeCard: (ref, outcome, note) => post<{ closed: Awaited<ReturnType<Transport['closeCard']>> }>(`/api/cards/${encodeURIComponent(ref)}/close`, { outcome, note }).then(b => b.closed),
    rejectCard: (ref, note) => post<{ decision: Awaited<ReturnType<Transport['rejectCard']>> }>(`/api/cards/${encodeURIComponent(ref)}/reject`, { note }).then(b => b.decision),
    brief: async ref => (await send(`/api/cards/${encodeURIComponent(ref)}/brief`)).text(),
    runCard: (ref, opts = {}) => post(`/api/cards/${encodeURIComponent(ref)}/run`, { agent: opts.agent }),
    // Runs change on disk, so the ETag cache is bypassed with a cache-busting query.
    getRun: runId => missing(json(`/api/runs/${encodeURIComponent(runId)}?t=${Date.now()}`)),
    waitRun: async runId => {
      for (;;) {
        const run = await json<RunRecord & { log: string }>(`/api/runs/${encodeURIComponent(runId)}?t=${Date.now()}`);
        if (run.status !== 'running') {
          const { log: _log, ...record } = run;
          return { ...record, logPath: '' };
        }
        await sleep(250);
      }
    },
    streamRun,
    // A page past the end today has lines tomorrow, so the ETag cache is bypassed like a run's.
    cardActivity: (ref, query: ActivityQuery = {}) => json<CardActivity>(`/api/cards/${encodeURIComponent(ref)}/activity${search({ after: query.after, limit: query.limit, t: Date.now() })}`),
    activityStream: (ref, opts = {}) => followCardActivity(ref, opts, events, (r, q) => json<CardActivity>(`/api/cards/${encodeURIComponent(r)}/activity${search({ after: q.after, limit: q.limit, t: Date.now() })}`)),
    handback: (ref, input) => post(`/api/cards/${encodeURIComponent(ref)}/handback`, input),
    gate: (ref, input) => post(`/api/cards/${encodeURIComponent(ref)}/gate`, input),
    worktree: ref => post(`/api/cards/${encodeURIComponent(ref)}/worktree`, {}),
    merge: ref => post(`/api/cards/${encodeURIComponent(ref)}/merge`, {}),
    orchRun: (ref, opts = {}) => post(`/api/cards/${encodeURIComponent(ref)}/orch`, opts),
    orchResume: ref => post(`/api/cards/${encodeURIComponent(ref)}/orch/resume`, {}),
    orchStatus: () => json(`/api/orch/status?t=${Date.now()}`),
    orchView: ref => json(`/api/cards/${encodeURIComponent(ref)}/orch?t=${Date.now()}`),
    gates: ref => json(`/api/cards/${encodeURIComponent(ref)}/gates?t=${Date.now()}`),
    handbacks: ref => json(`/api/cards/${encodeURIComponent(ref)}/handbacks?t=${Date.now()}`),
    stageOutput: ref => json(`/api/cards/${encodeURIComponent(ref)}/output?t=${Date.now()}`),
    writeStageOutput: (ref, text) => json(`/api/cards/${encodeURIComponent(ref)}/output`, { method: 'PUT', body: JSON.stringify({ text }) }),
    splitCard: (ref, titles) => post(`/api/cards/${encodeURIComponent(ref)}/split`, { titles }),
    detectSetup: () => post('/api/setup/detect', {}),
    adoptSkills: (opts = {}) => post('/api/setup/adopt', opts),
    setupStatus: () => json(`/api/setup/status?t=${Date.now()}`),
    skillsList: async () => {
      throw new ApiError(501, 'skill eval reads templates/skills/ and fixtures/skills/ from disk; use the local transport');
    },
    skillShow: async () => {
      throw new ApiError(501, 'skill eval reads templates/skills/ from disk; use the local transport');
    },
    skillEval: async () => {
      throw new ApiError(501, 'skill eval starts a headless agent against the local filesystem; use the local transport');
    },
    migrateStories: async () => {
      throw new ApiError(501, 'migrate-stories runs against the project files; use the local transport');
    },
    migrateFeatures: async () => {
      throw new ApiError(501, 'migrate-features runs against the project files; use the local transport');
    },
    questions: ref => json<{ questions: Awaited<ReturnType<Transport['questions']>> }>(`/api/cards/${encodeURIComponent(ref)}/questions`).then(b => b.questions),
    ask: (ref, items: AskInput[]) => post(`/api/cards/${encodeURIComponent(ref)}/questions`, { questions: items }),
    answer: async (ref, n, reply: AnswerInput) => {
      const { questions } = await post<{ questions: Awaited<ReturnType<Transport['questions']>> }>(`/api/cards/${encodeURIComponent(ref)}/questions/${n}/answer`, reply);
      const q = questions.find(x => x.n === n);
      if (!q) throw new ApiError(404, `${ref} has no question Q${n}`);
      return q;
    },
    rubricScaffold: ref => post(`/api/cards/${encodeURIComponent(ref)}/rubric/scaffold`, {}),
    acceptAll: ref => post(`/api/cards/${encodeURIComponent(ref)}/questions/accept-all`, {}),
    inbox: (query: InboxQuery = {}) => json(`/api/inbox${search({ ...query, needsMe: query.needsMe ? '1' : undefined })}`),
    board: (opts = {}) => json(`/api/board${search({ lane: opts.lane })}`),
    home: () => json('/api/home'),
    inboxReport: (opts = {}) => json(`/api/inbox/report${search({ sort: opts.sort })}`),
    markInboxSeen: () => post('/api/inbox/seen', {}).then(() => undefined),
    lanes: () => json<{ lanes: Awaited<ReturnType<Transport['lanes']>> }>('/api/lanes').then(b => b.lanes),
    initiatives: () => json<{ initiatives: Awaited<ReturnType<Transport['initiatives']>> }>('/api/initiatives').then(b => b.initiatives),
    initiativeTree: id => missing(json<{ initiative: NonNullable<Awaited<ReturnType<Transport['initiativeTree']>>> }>(`/api/initiatives/${encodeURIComponent(id)}/tree`).then(b => b.initiative)),
    epics: () => json<{ epics: Awaited<ReturnType<Transport['epics']>> }>('/api/epics').then(b => b.epics),
    epicTree: id => missing(json<{ epic: NonNullable<Awaited<ReturnType<Transport['epicTree']>>> }>(`/api/epics/${encodeURIComponent(id)}/tree`).then(b => b.epic)),
    createEpic: input => post<{ epic: Awaited<ReturnType<Transport['createEpic']>> }>('/api/epics', input).then(b => b.epic),
    features: () => json<{ features: Awaited<ReturnType<Transport['features']>> }>('/api/features').then(b => b.features),
    feature: id => missing(json<{ feature: NonNullable<Awaited<ReturnType<Transport['feature']>>> }>(`/api/features/${encodeURIComponent(id)}`).then(b => b.feature)),
    createFeature: input => post<{ feature: Awaited<ReturnType<Transport['createFeature']>> }>('/api/features', input).then(b => b.feature),
    scoreFeature: (id, rice) => post<{ feature: Awaited<ReturnType<Transport['scoreFeature']>> }>(`/api/features/${encodeURIComponent(id)}/score`, rice).then(b => b.feature),
    listPages: (query: PagesQuery = {}, cursor) => json(`/api/pages${search({ ...query, cursor })}`),
    getPage: id => missing(json<{ page: Awaited<ReturnType<Transport['getPage']>> }>(`/api/pages/${encode(id)}`).then(b => b.page)),
    // 201 on create, 200 on update, 409 when expectVersion is stale.
    putPage: async (id, write: PageWrite) => {
      const res = await send(`/api/pages/${encode(id)}`, { method: 'PUT', body: JSON.stringify(write) });
      const { page } = (await res.json()) as { page: NonNullable<Awaited<ReturnType<Transport['getPage']>>> };
      return { page, created: res.status === 201 };
    },
    deletePage: async id => (await missing(json(`/api/pages/${encode(id)}`, { method: 'DELETE' }))) !== undefined,
    artifacts: () => json<{ artifacts: Awaited<ReturnType<Transport['artifacts']>> }>('/api/artifacts').then(b => b.artifacts),
    evidence: nnn => missing(json(`/api/evidence/${encodeURIComponent(nnn)}`)),
    stats: () => json('/api/stats'),
    config: () => json<{ config: Awaited<ReturnType<Transport['config']>> }>('/api/config').then(b => b.config),
    // The only GET that sends the token: the server reads it to say whether THIS request could
    // write, which the default GET headers (token only on a write) would never carry.
    sessionInfo: async (): Promise<Session> => {
      const res = await doFetch(`${base}${scoped('/api/session')}`, { ...extra(), headers: { 'x-codeloop-token': token() } });
      if (!res.ok) throw new ApiError(res.status, `session check failed (${res.status})`);
      return res.json();
    },
    nextAction: () => json('/api/next'),
    login: (user, password) => post('/api/session/login', { user, password }),
    logout: () => post('/api/session/logout', {}),
    changeBoardAuth: input => post('/api/settings/board-auth', input),
    events,
    wikiEntries: () => json<{ entries: Awaited<ReturnType<Transport['wikiEntries']>> }>('/api/wiki/entries').then(b => b.entries),
    wikiInject: files => json<{ entries: Awaited<ReturnType<Transport['wikiInject']>> }>(`/api/wiki/inject?${files.map(f => `file=${encodeURIComponent(f)}`).join('&')}`).then(b => b.entries),
    wikiLint: () => json('/api/wiki/lint'),
    wikiOutline: async () => {
      throw new ApiError(501, 'wiki-outline scans the project files; use the local transport');
    },
    writeWikiOutline: async () => {
      throw new ApiError(501, 'wiki-outline writes the project files; use the local transport');
    },
    migrateWiki: async () => {
      throw new ApiError(501, 'wiki migrate writes the project files; use the local transport');
    },
    wikiMerge: async () => {
      throw new ApiError(501, 'wiki merge writes the project files; use the local transport');
    },
    procs: async () => {
      throw new ApiError(501, 'ps reads this machine\'s processes; use the local transport');
    },
    killOrphans: async () => {
      throw new ApiError(501, 'ps --kill-orphans signals this machine\'s processes; use the local transport');
    },
    clearAgent: async () => {
      throw new ApiError(501, 'agent clear writes the project state; use the local transport');
    },
    migrateDecisions: async () => {
      throw new ApiError(501, 'wiki migrate-decisions writes the project files; use the local transport');
    },
    // Served, unlike the other wiki-outline operations: the home page and sidebar need it over
    // http from `codeloop serve`, not only from a CLI process holding the local transport.
    wikiShape: () => json<{ shape: Awaited<ReturnType<Transport['wikiShape']>> }>('/api/wiki/shape').then(b => b.shape),
    buildWiki: async () => {
      throw new ApiError(501, 'wiki build scans the project files and runs a local agent; use the local transport');
    },
    close: async () => {
      etags.clear();
    },
  };
}

/** A client over http: `createHttpClient({ baseUrl: 'http://127.0.0.1:4040', token })`. */
export const createHttpClient = (options: HttpOptions = {}) => new CodeloopClient(httpTransport(options));
