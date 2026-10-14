// The app's one way to the API: the SDK's http transport, scoped to the current project (if any)
// so the same build serves both `codeloop serve --standalone` and the hub without knowing which
// one it is. Same-origin by default, since both host the Next server next to the API; a server
// component reaches the API's internal address (`codeloop serve`/`codeloop hub` set it), and the
// public env var is only for a build served from somewhere else.
import { ApiError, createHttpClient, type CodeloopClient } from '@protoboxai/codeloop/sdk';
import type { AdvanceReport, Artifact, Band, BoardView, Card, CardFull, CardOutput, CardShow, CardsPage, CardsQuery, Config, Evidence, FeatureRow, HomeView, InboxPayload, InboxQuery, Initiative, InitiativeRow, InitiativeTree, Lane, NextAction, Page, PageWrite, PagesPage, PagesQuery, Question, Rice, Run, Session, SetupAdopt, SetupDetect, SetupStatus, SplitResult, Stats, TreeEpic, TreeFeature, WikiShapeCount } from './types';
import type { NewCardInput, ProposalInput } from '@protoboxai/codeloop/sdk';
import { currentProjectBrowser, currentProjectServer, hubModeBrowser, hubModeServer } from './project';

export type { NewCardInput, ProposalInput };

export { ApiError, cardsSearch } from '@protoboxai/codeloop/sdk';

export const API_BASE = (process.env.NEXT_PUBLIC_CODELOOP_API ?? '').replace(/\/$/, '');

function base(): string {
  if (typeof window !== 'undefined') return API_BASE;
  return (process.env.CODELOOP_API_INTERNAL ?? `http://127.0.0.1:${process.env.CODELOOP_PORT ?? process.env.PORT ?? '4043'}`).replace(/\/$/, '');
}

// `codeloop serve`/`codeloop hub` print a URL carrying a token; every write sends it back. Kept
// for the tab's lifetime so a reload or an in-app link without the query string still works. The
// first request that carries it (GET /api/session, fired on mount) makes the server set a cookie
// good for this host, so `?token=` is dropped from the address bar right away: it would otherwise
// stay visible (and copy-pasteable) for no further benefit once that cookie exists. One mode at a
// time is ever live in a given tab, so standalone's project token and the hub's token share the
// one stored value without colliding.
export function token(): string {
  if (typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('token');
  if (fromUrl) {
    try { window.sessionStorage.setItem('codeloop-token', fromUrl); } catch { /* private window */ }
    url.searchParams.delete('token');
    try { window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`); } catch { /* non-browser test environment */ }
    return fromUrl;
  }
  try { return window.sessionStorage.getItem('codeloop-token') ?? ''; } catch { return ''; }
}

// One client per project per side, so switching projects (always a full navigation, never a
// client-side one, see the project switcher) never reuses another project's ETag cache. The
// browser clients revalidate with the ETags the SDK keeps; a server render reads fresh and waits
// at most two seconds for the API, past which the client fetches instead.
const browserClients = new Map<string, CodeloopClient>();
const serverClients = new Map<string, CodeloopClient>();

async function client(): Promise<CodeloopClient> {
  if (typeof window !== 'undefined') {
    const project = currentProjectBrowser() ?? '';
    let c = browserClients.get(project);
    if (!c) { c = createHttpClient({ baseUrl: base(), token, project: project || undefined }); browserClients.set(project, c); }
    return c;
  }
  const project = (await currentProjectServer()) ?? '';
  let c = serverClients.get(project);
  if (!c) { c = createHttpClient({ baseUrl: base(), project: project || undefined, init: () => ({ cache: 'no-store', signal: AbortSignal.timeout(2000) }) }); serverClients.set(project, c); }
  return c;
}

const missing = <T,>(value: T | undefined, what: string): T => {
  if (value === undefined) throw new ApiError(404, `${what} not found`);
  return value;
};

export const api = {
  /** One page of cards without their event logs. */
  async cards(query: CardsQuery = {}, cursor?: string): Promise<CardsPage> {
    const { nextCursor, ...page } = await (await client()).cards.list(query, cursor);
    return { ...page, next: nextCursor ?? undefined };
  },
  /** Facet counts for the filter menus. */
  async cardFacets(): Promise<CardsPage> {
    const { nextCursor, ...page } = await (await client()).cards.list({ limit: 1 }, undefined, { facets: true });
    return { ...page, next: nextCursor ?? undefined };
  },
  /** One card with its event log; a 404 lets the caller fall back to a list's copy. */
  card: async (id: string): Promise<Card> => missing(await (await client()).cards.get(id), `card ${id}`),
  lanes: async (): Promise<Lane[]> => (await client()).lanes(),
  questions: async (id: string): Promise<Question[]> => (await client()).questions.list(id),
  async cardFull(id: string): Promise<CardFull> {
    const full = await (await client()).cards.full(id);
    return { ...full, spec: full.spec?.text ?? undefined, evidence: full.evidence?.files };
  },
  initiatives: async (): Promise<Initiative[]> => (await client()).initiatives(),
  /** Each initiative with its score, the sum of its features'. */
  initiativesList: async (): Promise<InitiativeRow[]> => (await client()).initiatives(),
  /** initiative → epics → features → stories; `features` holds the ones naming no epic. */
  initiativeTree: async (id: string): Promise<InitiativeTree> => missing(await (await client()).initiativeTree(id), `initiative ${id}`),
  epicTree: async (id: string): Promise<TreeEpic> => missing(await (await client()).epics.tree(id), `epic ${id}`),
  feature: async (id: string): Promise<TreeFeature> => missing(await (await client()).features.get(id), `feature ${id}`),
  /** Writes the feature's RICE block; every score and band is derived from it on the next read. */
  scoreFeature: async (id: string, rice: Rice) => (await client()).features.score(id, rice),
  /** One page of page summaries; search hits carry an excerpt. */
  async pages(params: PagesQuery = {}, cursor?: string): Promise<PagesPage> {
    const { pages, nextCursor, total } = await (await client()).pages.list(params, cursor);
    return { pages, next: nextCursor ?? undefined, total };
  },
  page: async (path: string): Promise<Page> => missing(await (await client()).pages.get(path), `page ${path}`),
  /** The wiki shape with page counts, pre-joined server side: section order, titles, purpose and which ones have pages at all. */
  wikiShape: async (): Promise<WikiShapeCount[]> => (await client()).wiki.shape(),
  // 201 on create, 200 on update, 409 when expectVersion is stale (ApiError carries the message).
  savePage: async (path: string, write: PageWrite): Promise<Page> => (await (await client()).pages.put(path, write)).page,
  deletePage: async (path: string) => ({ ok: await (await client()).pages.delete(path) }),
  evidence: async (nnn: string): Promise<Evidence> => missing(await (await client()).evidence(nnn), `evidence ${nnn}`),
  artifacts: async (): Promise<Artifact[]> => (await client()).artifacts(),
  /** The inbox lists, each capped at `limit` (50 by default) with its own cursor. */
  inbox: async (q: InboxQuery = {}): Promise<InboxPayload> => (await client()).inbox.get(q),
  stats: async (): Promise<Stats> => (await client()).stats(),
  config: async (): Promise<Config> => (await client()).config(),
  /**
   * Owner mode, sign-in state, token validity, the default-password notice, and the project. In
   * hub mode this is the hub's own sign-in, not the per-project one a standalone server would
   * check: a project mounted under the hub trusts the hub's gate (hub.ts), so asking that project's
   * own `/api/session` would always answer `signedIn: false` no matter who signed in where.
   */
  async session(): Promise<Session> {
    if (typeof window !== 'undefined' ? hubModeBrowser() : await hubModeServer()) {
      const project = typeof window !== 'undefined' ? currentProjectBrowser() : await currentProjectServer();
      const qs = project ? `?project=${encodeURIComponent(project)}` : '';
      const res = await fetch(`${base()}/api/hub/session${qs}`, { headers: { 'x-codeloop-token': token() }, cache: 'no-store' });
      if (!res.ok) throw new ApiError(res.status, `hub session check failed (${res.status})`);
      const hub = (await res.json()) as { signedIn: boolean; tokenValid: boolean; defaultPassword: boolean; project?: { name: string; path: string } };
      // The hub always grants its managed projects owner rights; the per-project local.yaml
      // password (what `owner` would otherwise gate on) applies only to `serve --standalone`.
      return { owner: true, signedIn: hub.signedIn, tokenValid: hub.tokenValid, defaultPassword: hub.defaultPassword, project: hub.project ?? { name: project ?? 'hub', path: '' } };
    }
    return (await client()).session();
  },
  /** The one thing the board's first screen leads with. */
  next: async (): Promise<NextAction> => (await client()).next(),
  /** The board: every story in one row of states (up next, in progress, needs you, done), already grouped server side. */
  board: async (): Promise<BoardView> => (await client()).board.get(),
  /** Home: what needs you, what is failing, what is moving, which agents are working, what shipped. */
  home: async (): Promise<HomeView> => (await client()).home.get(),
  async login(user: string, password: string) {
    if (typeof window !== 'undefined' ? hubModeBrowser() : await hubModeServer()) {
      const res = await fetch(`${base()}/api/hub/session/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user, password }) });
      if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({})))?.error ?? `login failed (${res.status})`);
      return res.json();
    }
    return (await client()).auth.login(user, password);
  },
  async logout() {
    if (typeof window !== 'undefined' ? hubModeBrowser() : await hubModeServer()) {
      const res = await fetch(`${base()}/api/hub/session/logout`, { method: 'POST', headers: { 'content-type': 'application/json' } });
      return res.json();
    }
    return (await client()).auth.logout();
  },
  changeBoardAuth: async (input: { currentPassword: string; user?: string; newPassword?: string }) => (await client()).auth.changeBoardAuth(input),

  /** A card started in its lane (owner) or proposed into the backlog; the engine's story check refuses a mechanism title. */
  newCard: async (input: NewCardInput) => (await client()).cards.new(input),
  proposeCard: async (input: ProposalInput) => (await client()).cards.propose(input),
  /** Starts the shape workflow from a problem statement: brief → interview → breakdown → rank. */
  shapeProblem: async (problem: string) => (await client()).cards.shape(problem),
  async decide(id: string, action: 'approve' | 'reject', note?: string) {
    const c = await client();
    return action === 'approve' ? c.cards.approve(id, { note }) : c.cards.reject(id, note ?? '');
  },
  answer: async (id: string, n: number, body: { text: string } | { accept: true }) => (await client()).questions.answer(id, n, body),
  // Backlog triage goes through the gate routes: approve on a proposal promotes it into its lane's
  // first stage, reject drops it (engine.ts proposeCard).
  promote: async (id: string) => (await client()).cards.approve(id),
  drop: async (id: string) => (await client()).cards.reject(id, 'dropped from the board'),

  /** The card with its stage brief (skill, output path, the check command, substituted) and the Next line. */
  show: async (id: string): Promise<CardShow> => (await client()).cards.show(id),
  /** Runs the stage's check the way `codeloop next` does; the report carries the check's output and the Next line. */
  advance: async (id: string): Promise<AdvanceReport> => (await client()).cards.advance(id),
  /** One or more interview questions, each with a recommended answer the owner can accept in one click. */
  ask: async (id: string, items: { question: string; recommended?: string }[]) => (await client()).questions.ask(id, items),
  /** Every feature with its chain, score, band and release, for the roadmap's columns. */
  features: async (): Promise<FeatureRow[]> => (await client()).features.list(),

  /** Starts a stage run (the check, the agent when it fails, one advance); `useRun` follows it by id. */
  runStage: async (id: string, agent?: string) => (await client()).cards.run(id, agent ? { agent } : undefined),
  run: async (runId: string): Promise<Run> => missing(await (await client()).runs.get(runId), `run ${runId}`),
  /** The SSE stream of a run's log lines; the hook opens it with the browser's EventSource (same exemption as /api/events), so this stays synchronous and browser-only. */
  runStreamUrl: (runId: string) => `${API_BASE}${scopedPath(`/api/runs/${encodeURIComponent(runId)}/stream`)}`,
  /** The current stage's output file: its path, and its text or null before it is written. */
  cardOutput: async (id: string): Promise<CardOutput> => (await client()).cards.output(id),
  saveCardOutput: async (id: string, text: string): Promise<CardOutput> => (await client()).cards.writeOutput(id, text),
  /** Sibling stories under the same feature, each `split_from` this card. */
  splitCard: async (id: string, titles: string[]): Promise<SplitResult> => (await client()).cards.split(id, titles),
  setupStatus: async (): Promise<SetupStatus> => (await client()).setup.status(),
  setupDetect: async (): Promise<SetupDetect> => (await client()).setup.detect(),
  setupAdopt: async (from?: string[]): Promise<SetupAdopt> => (await client()).setup.adopt(from?.length ? { from } : undefined),

  /** The hub's cross-project views; meaningless (and unreachable) under `serve --standalone`. */
  hub: {
    projects: async (): Promise<ListedProject[]> => (await fetch(`${base()}/api/hub/projects`, { cache: 'no-store' }).then(r => r.json())).projects,
    needsYou: async (): Promise<HubNeedsYou> => fetch(`${base()}/api/hub/needs-you`, { cache: 'no-store' }).then(r => r.json()),
    /** Per project: waiting on a person, failing, stale and working, from the monitor (GET /api/hub/attention). */
    attention: async (): Promise<HubAttention[]> => (await fetch(`${base()}/api/hub/attention`, { cache: 'no-store' }).then(r => r.json())).projects,
  },
};

export interface HubAttention {
  id: string;
  name: string;
  needsYou: number;
  failing: number;
  stale: number;
  working: number;
}

export interface ListedProject {
  id: string;
  name: string;
  path: string;
  addedAt: string;
  missing: boolean;
  /**
   * Computed server-side (hub.ts, from the project's own inbox report); absent when the project
   * failed to read. `waitingOnYou` and `storiesWithQuestions` are the same two numbers everywhere
   * they appear, the hub's project grid, its sidebar, and a single project's own inbox page.
   */
  counts?: { active: number; waitingOnYou: number; storiesWithQuestions: number; stuck: number; failing?: number; backlog?: number };
}
export interface HubGateItem {
  id: string;
  title: string;
  lane: string;
  stage: string;
  gate: string;
  awaiting?: string;
  /** From the project's own inbox report (services.inboxReport), same as a card in its board's inbox. */
  band?: Band;
  score?: number;
  feature?: string;
  since?: string;
  project: string;
  projectName: string;
}
export interface HubFailingItem {
  id: string;
  title: string;
  lane: string;
  stage: string;
  retries: number;
  last_check: string;
  since: string;
  project: string;
  projectName: string;
}
export interface HubQuestionItem {
  id: string;
  title: string;
  lane: string;
  stage: string;
  open: number;
  project: string;
  projectName: string;
}
export interface HubNeedsYou {
  gates: HubGateItem[];
  failing?: HubFailingItem[];
  backlog?: number;
  questions: HubQuestionItem[];
  projects: string[];
}

/** `/api/runs/...` -> `/api/p/<project>/runs/...` in hub mode, unchanged in standalone. Browser-only (both callers are). */
function scopedPath(path: string): string {
  const project = currentProjectBrowser();
  return project ? path.replace(/^\/api\//, `/api/p/${encodeURIComponent(project)}/`) : path;
}

/** The SSE stream of every card/page change on this project, same exemption as runStreamUrl. */
export const eventsUrl = () => `${API_BASE}${scopedPath('/api/events')}`;

// The server serves mocks at /mocks/<path> (standalone) or /api/p/<project>/mocks/<path> (hub);
// cards carry the unscoped form already, so this is the one place that adds the project back in.
export const mockUrl = (mock: string) => {
  if (mock.startsWith('http')) return mock;
  const path = mock.startsWith('/') ? mock : `/mocks/${mock}`;
  const project = currentProjectBrowser();
  return `${API_BASE}${project ? path.replace(/^\/mocks\//, `/api/p/${encodeURIComponent(project)}/mocks/`) : path}`;
};
