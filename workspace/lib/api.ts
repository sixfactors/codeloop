// The app's one way to the API: the SDK's http transport. Same-origin by default, since
// `codeloop serve` hosts the Next server next to the API; a server component reaches the API's
// internal address (`codeloop serve` sets it), and the public env var is only for a build served
// from somewhere else.
import { ApiError, createHttpClient, type CodeloopClient } from '@protoboxai/codeloop/sdk';
import type { AdvanceReport, Artifact, Card, CardFull, CardOutput, CardShow, CardsPage, CardsQuery, Config, Evidence, FeatureRow, InboxPayload, InboxQuery, Initiative, InitiativeRow, InitiativeTree, Lane, Page, PageWrite, PagesPage, PagesQuery, Question, Rice, Run, SetupAdopt, SetupDetect, SetupStatus, SplitResult, Stats, TreeEpic, TreeFeature } from './types';
import type { NewCardInput, ProposalInput } from '@protoboxai/codeloop/sdk';

export type { NewCardInput, ProposalInput };

export { ApiError, cardsSearch } from '@protoboxai/codeloop/sdk';

export const API_BASE = (process.env.NEXT_PUBLIC_CODELOOP_API ?? '').replace(/\/$/, '');

function base(): string {
  if (typeof window !== 'undefined') return API_BASE;
  return (process.env.CODELOOP_API_INTERNAL ?? `http://127.0.0.1:${process.env.CODELOOP_PORT ?? process.env.PORT ?? '4043'}`).replace(/\/$/, '');
}

// `codeloop serve` prints a URL carrying a token; every write sends it back. Kept for the tab's
// lifetime so a reload or an in-app link without the query string still works.
export function token(): string {
  if (typeof window === 'undefined') return '';
  const fromUrl = new URLSearchParams(window.location.search).get('token');
  if (fromUrl) {
    try { window.sessionStorage.setItem('codeloop-token', fromUrl); } catch { /* private window */ }
    return fromUrl;
  }
  try { return window.sessionStorage.getItem('codeloop-token') ?? ''; } catch { return ''; }
}

// One client per side. The browser one revalidates with the ETags the SDK keeps; a server render
// reads fresh and waits at most two seconds for the API, past which the client fetches instead.
let browser: CodeloopClient | undefined;
let server: CodeloopClient | undefined;
function client(): CodeloopClient {
  if (typeof window !== 'undefined') return (browser ??= createHttpClient({ baseUrl: base(), token }));
  return (server ??= createHttpClient({ baseUrl: base(), init: () => ({ cache: 'no-store', signal: AbortSignal.timeout(2000) }) }));
}

const missing = <T,>(value: T | undefined, what: string): T => {
  if (value === undefined) throw new ApiError(404, `${what} not found`);
  return value;
};

export const api = {
  /** One page of cards without their event logs. */
  async cards(query: CardsQuery = {}, cursor?: string): Promise<CardsPage> {
    const { nextCursor, ...page } = await client().cards.list(query, cursor);
    return { ...page, next: nextCursor ?? undefined };
  },
  /** Facet counts for the filter menus. */
  async cardFacets(): Promise<CardsPage> {
    const { nextCursor, ...page } = await client().cards.list({ limit: 1 }, undefined, { facets: true });
    return { ...page, next: nextCursor ?? undefined };
  },
  /** One card with its event log; a 404 lets the caller fall back to a list's copy. */
  card: async (id: string): Promise<Card> => missing(await client().cards.get(id), `card ${id}`),
  lanes: (): Promise<Lane[]> => client().lanes(),
  questions: (id: string): Promise<Question[]> => client().questions.list(id),
  async cardFull(id: string): Promise<CardFull> {
    const full = await client().cards.full(id);
    return { ...full, spec: full.spec?.text ?? undefined, evidence: full.evidence?.files };
  },
  initiatives: (): Promise<Initiative[]> => client().initiatives(),
  /** Each initiative with its score, the sum of its features'. */
  initiativesList: (): Promise<InitiativeRow[]> => client().initiatives(),
  /** initiative → epics → features → stories; `features` holds the ones naming no epic. */
  initiativeTree: async (id: string): Promise<InitiativeTree> => missing(await client().initiativeTree(id), `initiative ${id}`),
  epicTree: async (id: string): Promise<TreeEpic> => missing(await client().epics.tree(id), `epic ${id}`),
  feature: async (id: string): Promise<TreeFeature> => missing(await client().features.get(id), `feature ${id}`),
  /** Writes the feature's RICE block; every score and band is derived from it on the next read. */
  scoreFeature: (id: string, rice: Rice) => client().features.score(id, rice),
  /** One page of page summaries; search hits carry an excerpt. */
  async pages(params: PagesQuery = {}, cursor?: string): Promise<PagesPage> {
    const { pages, nextCursor, total } = await client().pages.list(params, cursor);
    return { pages, next: nextCursor ?? undefined, total };
  },
  page: async (path: string): Promise<Page> => missing(await client().pages.get(path), `page ${path}`),
  // 201 on create, 200 on update, 409 when expectVersion is stale (ApiError carries the message).
  savePage: async (path: string, write: PageWrite): Promise<Page> => (await client().pages.put(path, write)).page,
  deletePage: async (path: string) => ({ ok: await client().pages.delete(path) }),
  evidence: async (nnn: string): Promise<Evidence> => missing(await client().evidence(nnn), `evidence ${nnn}`),
  artifacts: (): Promise<Artifact[]> => client().artifacts(),
  /** The inbox lists, each capped at `limit` (50 by default) with its own cursor. */
  inbox: (q: InboxQuery = {}): Promise<InboxPayload> => client().inbox.get(q),
  stats: (): Promise<Stats> => client().stats(),
  config: (): Promise<Config> => client().config(),

  /** A card started in its lane (owner) or proposed into the backlog; the engine's story check refuses a mechanism title. */
  newCard: (input: NewCardInput) => client().cards.new(input),
  proposeCard: (input: ProposalInput) => client().cards.propose(input),
  decide: (id: string, action: 'approve' | 'reject', note?: string) =>
    action === 'approve' ? client().cards.approve(id, { note }) : client().cards.reject(id, note ?? ''),
  answer: (id: string, n: number, body: { text: string } | { accept: true }) => client().questions.answer(id, n, body),
  // Backlog triage goes through the gate routes: approve on a proposal promotes it into its lane's
  // first stage, reject drops it (engine.ts proposeCard).
  promote: (id: string) => client().cards.approve(id),
  drop: (id: string) => client().cards.reject(id, 'dropped from the board'),

  /** The card with its stage brief (skill, output path, the check command, substituted) and the Next line. */
  show: (id: string): Promise<CardShow> => client().cards.show(id),
  /** Runs the stage's check the way `codeloop next` does; the report carries the check's output and the Next line. */
  advance: (id: string): Promise<AdvanceReport> => client().cards.advance(id),
  /** One or more interview questions, each with a recommended answer the owner can accept in one click. */
  ask: (id: string, items: { question: string; recommended?: string }[]) => client().questions.ask(id, items),
  /** Every feature with its chain, score, band and release, for the roadmap's columns. */
  features: (): Promise<FeatureRow[]> => client().features.list(),

  /** Starts a stage run (the check, the agent when it fails, one advance); `useRun` follows it by id. */
  runStage: (id: string, agent?: string) => client().cards.run(id, agent ? { agent } : undefined),
  run: async (runId: string): Promise<Run> => missing(await client().runs.get(runId), `run ${runId}`),
  /** The SSE stream of a run's log lines; the hook opens it with the browser's EventSource (same exemption as /api/events). */
  runStreamUrl: (runId: string) => `${API_BASE}/api/runs/${encodeURIComponent(runId)}/stream`,
  /** The current stage's output file: its path, and its text or null before it is written. */
  cardOutput: (id: string): Promise<CardOutput> => client().cards.output(id),
  saveCardOutput: (id: string, text: string): Promise<CardOutput> => client().cards.writeOutput(id, text),
  /** Sibling stories under the same feature, each `split_from` this card. */
  splitCard: (id: string, titles: string[]): Promise<SplitResult> => client().cards.split(id, titles),
  setupStatus: (): Promise<SetupStatus> => client().setup.status(),
  setupDetect: (): Promise<SetupDetect> => client().setup.detect(),
  setupAdopt: (from?: string[]): Promise<SetupAdopt> => client().setup.adopt(from?.length ? { from } : undefined),
};

// The server serves mocks at /mocks/<path>; cards carry that absolute path already.
export const mockUrl = (mock: string) => (mock.startsWith('http') ? mock : `${API_BASE}${mock.startsWith('/') ? '' : '/mocks/'}${mock}`);
