/**
 * The service layer: every operation the API routes and the SDK's local transport share. Nothing
 * here knows about HTTP or the terminal. Two groups: project functions that read and write the
 * engine's files directly (what the CLI needs, no index, so a one-shot process exits), and
 * index-backed reads that take the server's ProjectIndex (what the board draws).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve, sep } from 'path';
import { buildBrief, loadAgents } from './agent.js';
import { DONE, DROPPED, findCard, inLane, readCards, RefusalError, type Card } from './cards.js';
import { detectProject, type ProjectDetection } from './detect.js';
import { advanceCard, proposeCard, recordEvent, rejectCard, resolveRole, type AdvanceResult, type Role } from './engine.js';
import { loadLane, loadLanes, loadSkillsIndex, substitute } from './lane.js';
import { getRun, readRun, startCardRun, streamRun, waitRun, type RunRecord, type RunView } from './runs.js';
import { defaultSkillDirs, mergeSkillsIndex, scanSkills, type AdoptResult } from './skills.js';
import { approveFlow, describeAdvance, nextHint, stageBrief, startCard } from './flow.js';
import { CARD_FILTERS, type CardFilter, type EpicNode, type FeatureNode, type IndexedEpic, type IndexedFeature, type InboxPayload, type InboxQuery, type InitiativeTree, type ProjectIndex } from './index/index.js';
import { withChain, type Band, type CardChain } from './features.js';
import { buildInbox, markInboxSeen, readInboxSeen, type Inbox } from './inbox.js';
import { addQuestions, readQuestions, writeAnswer, type Question } from './interview.js';
import { MOCKS_DIR } from './mock.js';
import { readTasks, type Task } from './spec.js';
import { computeStats, type Stats } from './stats.js';
import { listFilter, migrateStories, storyFields, type StoryFlags } from './story.js';
import { migrateFeatures } from './migrate-features.js';
import { ConflictError, openStore, type CardRecord, type Epic, type Evidence, type Feature, type Rice, type Store, type WikiPage } from './store/index.js';
import { inject, lintWiki, listPages, WIKI_DIR, type Page as WikiEntry } from './wiki.js';

export type { Inbox } from './inbox.js';
export type { Question } from './interview.js';
export type { Stats } from './stats.js';
export type { Page as WikiEntry } from './wiki.js';
export type { RunRecord, RunView } from './runs.js';
export type { ProjectDetection } from './detect.js';
export type { AdoptResult } from './skills.js';

/** `--as owner|reviewer|agent`, CODELOOP_ROLE, else the terminal decides. */
export type RoleFlag = { as?: string };

export interface NewCardInput extends StoryFlags {
  lane: string;
  title: string;
  id?: string;
  /** The tracker key; a title starting `ACME-412: ` sets it too and the rest becomes the title. */
  ticket?: string;
}

export interface ProposalInput extends NewCardInput {
  description?: string;
  source?: string;
}

/** A card just made, with the one line saying what to do with it now. */
export interface CardCreated {
  card: Card;
  hint: string;
}

export interface CardProposed extends CardCreated {
  /** False when `source` named a finding that was already proposed; `card` is that earlier card. */
  created: boolean;
}

/** What `codeloop next` prints: the engine result plus its lines, the Next line last. */
export interface AdvanceReport {
  result: AdvanceResult;
  lines: string[];
  /** 2 when the check failed or the card is stuck; the CLI exits with it. */
  exitCode: number;
}

export interface DecisionReport {
  card: Card;
  /** The gate that was decided: a stage gate's name, `proposal`, or `stuck`. */
  gate: string;
  /** The first line: what the decision did. */
  summary: string;
  /** What follows the summary, the Next line last. */
  lines: string[];
  exitCode: number;
  advanced?: AdvanceResult;
}

export interface CardShow {
  card: Card;
  brief: ReturnType<typeof stageBrief>;
  hint: string;
}

export type CardListFilter = { lane?: string; stage?: string; initiative?: string; epic?: string; feature?: string; band?: string; persona?: string; size?: string; points?: string | number; all?: boolean };

/** A stored card with its chain, band and score from the feature pages. */
export type ScoredRecord = CardRecord & CardChain;

export interface CardFull {
  card: Card & { mock?: string; openQuestions: number };
  spec: { dir: string; text: string | null } | null;
  tasks: Task[];
  questions: Question[];
  evidence: Evidence | null;
  mock: string | null;
  page: WikiPage | null;
}

export interface PageWrite {
  frontmatter?: Record<string, unknown>;
  body: string;
  /** The version the editor read, so two editors cannot overwrite each other. */
  expectVersion?: string | number;
}

export type EvidenceDetail = Omit<Evidence, 'files'> & { files: (Evidence['files'][number] & { content?: string })[] };

export type Config = Record<string, unknown>;

export type CardsPayload = Awaited<ReturnType<typeof cardsPayload>>;

// --- cards: engine writes and the CLI's reads ------------------------------------------------

// `ACME-412: add CSV export`, a tracker key, a colon, the title. The key is letters and digits, a
// dash and a number, as Jira, Linear and GitHub-style trackers write them.
const TICKET_TITLE = /^([A-Za-z][A-Za-z0-9]*-\d+):\s+(.+)$/s;

/** The ticket a title starts with, split off; `--ticket` wins over the prefix. */
export function splitTicket(title: string, ticket?: string): { title: string; ticket?: string } {
  const m = TICKET_TITLE.exec(title.trim());
  const rest = m ? m[2].trim() : title;
  const key = ticket?.trim() || m?.[1];
  return key ? { title: rest, ticket: key } : { title: rest };
}

/** `codeloop start` / `card new`: the story check runs first, so a technical title is refused. */
export function newCard(projectDir: string, input: NewCardInput, who?: Role): CardCreated {
  const { title, ticket } = splitTicket(input.title, input.ticket);
  const card = startCard(projectDir, { lane: input.lane, title, id: input.id, role: who ?? 'agent', fields: { ...storyFields(title, input), ...(ticket ? { ticket } : {}) } });
  return { card, hint: nextHint(projectDir, card) };
}

/** `card propose`: a `source` names the finding, so the same one is never proposed twice. */
export function newProposal(projectDir: string, input: ProposalInput, who?: Role): CardProposed {
  const { title, ticket } = splitTicket(input.title, input.ticket);
  const fields = { ...storyFields(title, input), ...(ticket ? { ticket } : {}) };
  const { card, created } = proposeCard(projectDir, {
    lane: input.lane,
    title,
    id: input.id,
    description: input.description,
    source: input.source,
    dedupe: input.source ? `${input.lane}:${input.source}:${title}` : undefined,
    role: who ?? 'agent',
    fields,
  });
  return { card, created, hint: nextHint(projectDir, card) };
}

/** Advances one card; with no ref, the one active card, refused when there is not exactly one. */
export function advance(projectDir: string, ref: string | undefined, opts: { event?: string } = {}): AdvanceReport {
  let id = ref;
  if (!id) {
    const active = readCards(projectDir).cards.filter(c => inLane(c) && !c.gate);
    if (active.length !== 1) throw new RefusalError(active.length ? `${active.length} cards are active (${active.map(c => c.id).join(', ')}); say which` : 'no active card; `codeloop start "<title>"` creates one');
    id = active[0].id;
  }
  const result = advanceCard(projectDir, id, { event: opts.event });
  return { result, ...describeAdvance(projectDir, result) };
}

export function approve(projectDir: string, ref: string, who: Role, note?: string): DecisionReport {
  const result = approveFlow(projectDir, ref, who, note);
  const summary = `${result.card.id} ${result.gate === 'stuck' ? 'can be retried' : result.gate === 'proposal' ? `promoted to ${result.card.lane}/${result.card.stage}` : `gate ${result.gate} approved`}`;
  const rest = result.advanced ? describeAdvance(projectDir, result.advanced) : { lines: [nextHint(projectDir, result.card)], exitCode: 0 };
  return { card: result.card, gate: result.gate, summary, advanced: result.advanced, ...rest };
}

export function reject(projectDir: string, ref: string, who: Role, note: string): DecisionReport {
  const before = findCard(readCards(projectDir).cards, ref);
  const card = rejectCard(projectDir, ref, who, note);
  if (card.stage === DROPPED) return { card, gate: 'proposal', summary: `${card.id} dropped; note recorded`, lines: [], exitCode: 0 };
  const returned = card.stage !== before.stage;
  const summary = returned ? `${card.id} returned to ${card.stage}: the ${before.stage} gate was rejected before that stage ran; note recorded` : `${card.id} rejected at ${card.stage}; note recorded`;
  return { card, gate: before.gate ?? card.stage, summary, lines: [nextHint(projectDir, card).replace('Next: run', 'Next: redo with')], exitCode: 0 };
}

// --- a stage run, its output file, and splitting a card -------------------------------------

/** `card run` / `POST /api/cards/:id/run`: the check, the agent when it fails, one advance. Returns at once. */
export function runCard(projectDir: string, ref: string, opts: { agent?: string } = {}): { runId: string; run: RunView } {
  const { record } = startCardRun(projectDir, ref, opts);
  return { runId: record.runId, run: getRun(projectDir, record.runId)! };
}

export const run = (projectDir: string, runId: string): RunView | undefined => getRun(projectDir, runId);
export const runWait = (projectDir: string, runId: string): Promise<RunRecord> => waitRun(projectDir, runId);
export const runStream = (projectDir: string, runId: string, signal?: AbortSignal) => streamRun(projectDir, runId, signal);
export const runExists = (projectDir: string, runId: string): boolean => readRun(projectDir, runId) !== undefined;

export interface StageOutput {
  /** From the project root, as the lane names it with the card's values filled in. */
  path: string;
  /** null when the file does not exist yet. */
  text: string | null;
}

// The lane's output template is text from a file anyone can edit, so the path it yields is
// checked against the project root before anything is read or written through it.
function outputFile(projectDir: string, ref: string): { card: Card; path: string; file: string } {
  const card = findCard(readCards(projectDir).cards, ref);
  const stage = card.stage === DONE || card.stage === 'proposed' || card.stage === DROPPED ? undefined : loadLane(projectDir, card.lane).stages.find(s => s.id === card.stage);
  if (!stage) throw new RefusalError(`card ${card.id} is ${card.stage}; it has no stage output`);
  if (!stage.output) throw new RefusalError(`stage ${stage.id} of lane ${card.lane} names no output file`);
  const path = substitute(stage.output, card);
  const root = resolve(projectDir);
  const file = resolve(root, path);
  if (!file.startsWith(root + sep)) throw new RefusalError(`stage output "${path}" is outside the project`);
  return { card, path, file };
}

/** The current stage's output file: its path, and its text when it exists. */
export function stageOutput(projectDir: string, ref: string): StageOutput {
  const { path, file } = outputFile(projectDir, ref);
  return { path, text: existsSync(file) ? readFileSync(file, 'utf-8') : null };
}

/** Writes the current stage's output file, making its folders; the check is not run. */
export function writeStageOutput(projectDir: string, ref: string, text: string, who: Role = 'agent'): StageOutput {
  if (typeof text !== 'string') throw new RefusalError('text (the file contents) is required');
  const { card, path, file } = outputFile(projectDir, ref);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  recordEvent(projectDir, card.id, () => ({ action: 'output', actor: who, human: who !== 'agent', note: path }));
  return { path, text };
}

/** `card split`: one sibling per title in the same lane, feature, initiative and epic, each marked `split_from`. */
export function splitCard(projectDir: string, ref: string, titles: string[], who?: Role): { from: Card; cards: Card[]; hints: string[] } {
  const from = findCard(readCards(projectDir).cards, ref);
  const clean = (titles ?? []).map(t => (typeof t === 'string' ? t.trim() : '')).filter(Boolean);
  if (!clean.length) throw new RefusalError('titles (one per new card) are required');
  // Every title is checked before any card is made, so a bad third title does not leave two behind.
  for (const t of clean) storyFields(splitTicket(t).title, {});
  const inherited = { initiative: from.initiative, epic: from.epic, feature: from.feature, metric: from.metric };
  const cards = clean.map(t => {
    const { title, ticket } = splitTicket(t);
    return startCard(projectDir, { lane: from.lane, title, role: who ?? 'agent', fields: { ...storyFields(title, inherited), ...(ticket ?? from.ticket ? { ticket: ticket ?? from.ticket } : {}), split_from: from.id } });
  });
  recordEvent(projectDir, from.id, () => ({ action: 'split', actor: who ?? 'agent', human: who === 'owner' || who === 'reviewer', note: `into ${cards.map(c => c.id).join(', ')}` }));
  return { from, cards, hints: cards.map(c => nextHint(projectDir, c)) };
}

// --- setup: what init detects, the skills index, where the project stands -------------------

export const detectSetup = (projectDir: string): ProjectDetection => detectProject(projectDir);

/** `adopt`: scans the dirs (default: the tool folders) and merges into the index; `replace` rebuilds it. */
export function adoptSkills(projectDir: string, opts: { from?: string[]; replace?: boolean } = {}): AdoptResult {
  const dirs = opts.from?.length ? opts.from : defaultSkillDirs(projectDir);
  return mergeSkillsIndex(projectDir, scanSkills(projectDir, dirs), { replace: opts.replace === true });
}

export interface SetupStatus {
  /** `.codeloop/config.yaml` exists. */
  initialised: boolean;
  lanes: number;
  skillsIndexed: number;
  agentsConfigured: number;
  agents: string[];
}

export function setupStatus(projectDir: string): SetupStatus {
  const agents = Object.keys(loadAgents(projectDir).agents);
  return {
    initialised: existsSync(join(projectDir, '.codeloop/config.yaml')),
    lanes: loadLanes(projectDir).length,
    skillsIndexed: loadSkillsIndex(projectDir)?.length ?? 0,
    agentsConfigured: agents.length,
    agents,
  };
}

/** The card by id or number, its current stage brief and the Next line. */
export function showCard(projectDir: string, ref: string): CardShow {
  const card = findCard(readCards(projectDir).cards, ref);
  return { card, brief: stageBrief(projectDir, card), hint: nextHint(projectDir, card) };
}

/**
 * Cards as the store holds them, each with the version a later write can expect and its chain,
 * band and score; dropped proposals only with `all`. `initiative` and `epic` match the chain the
 * feature names, `band` and `feature` the derived fields.
 */
export async function listCards(projectDir: string, filter: CardListFilter = {}): Promise<ScoredRecord[]> {
  const store = openStore(projectDir);
  try {
    const { initiative, epic, ...rest } = filter;
    const scored = withChain(projectDir, (await store.cards.list()) as CardRecord[]);
    return listFilter(scored, rest).filter(c => (!initiative || c.initiative === initiative) && (!epic || c.epic === epic) && (!filter.feature || c.feature === filter.feature) && (!filter.band || c.band === filter.band.toUpperCase())) as ScoredRecord[];
  } finally {
    await store.close();
  }
}

export const migrateStoryFields = (projectDir: string): string[] => migrateStories(projectDir);

/** `card migrate-features`: sets `feature:` and the feature's `initiative` on each card the mapping names; refuses an unknown feature. */
export const migrateFeatureFields = (projectDir: string, mappingFile?: string): { changed: string[]; mapping: string } => migrateFeatures(projectDir, mappingFile);

// --- epics and features: the roadmap pages ---------------------------------------------------

export interface EpicInput {
  id: string;
  title: string;
  initiative: string;
  status?: string;
  goal?: string;
  body?: string;
}

export interface FeatureInput {
  id: string;
  title: string;
  initiative: string;
  epic?: string;
  status?: string;
  release?: string;
  rice?: Rice;
  body?: string;
}

async function withStore<T>(projectDir: string, fn: (store: Store) => Promise<T>): Promise<T> {
  const store = openStore(projectDir);
  try {
    return await fn(store);
  } finally {
    await store.close();
  }
}

/** `epic new`: refused when the page exists or the initiative has no page. */
export function newEpic(projectDir: string, input: EpicInput): Promise<Epic> {
  return withStore(projectDir, async store => {
    if (await store.epics.get(input.id)) throw new RefusalError(`epic "${input.id}" already exists`);
    if (!(await store.initiatives.get(input.initiative))) throw new RefusalError(`initiative "${input.initiative}" has no page under ${WIKI_DIR}/initiatives/`);
    return store.epics.put({ ...input, body: input.body ?? '' });
  });
}

/** `feature new`: refused when the page exists, or the initiative or epic it names has no page. */
export function newFeature(projectDir: string, input: FeatureInput): Promise<Feature> {
  return withStore(projectDir, async store => {
    if (await store.features.get(input.id)) throw new RefusalError(`feature "${input.id}" already exists`);
    if (!(await store.initiatives.get(input.initiative))) throw new RefusalError(`initiative "${input.initiative}" has no page under ${WIKI_DIR}/initiatives/`);
    if (input.epic && !(await store.epics.get(input.epic))) throw new RefusalError(`epic "${input.epic}" has no page under ${WIKI_DIR}/epics/`);
    return store.features.put({ ...input, body: input.body ?? '' });
  });
}

/** `feature score`: writes the rice block; the score itself is derived on every read. */
export function scoreFeature(projectDir: string, id: string, rice: Rice): Promise<Feature> {
  return withStore(projectDir, async store => {
    const found = await store.features.get(id);
    if (!found) throw new RefusalError(`feature "${id}" not found`);
    return store.features.put({ ...found, rice }, found.version);
  });
}

export const listEpics = (index: ProjectIndex): Promise<IndexedEpic[]> => index.epics.list();
export const epicTree = (index: ProjectIndex, id: string): Promise<EpicNode | undefined> => index.epics.tree(id);
export const listFeatures = (index: ProjectIndex): Promise<IndexedFeature[]> => index.features.list();
export const featureDetail = (index: ProjectIndex, id: string): Promise<FeatureNode | undefined> => index.features.detail(id);
export const initiativeTree = (index: ProjectIndex, id: string): Promise<InitiativeTree | undefined> => index.initiatives.tree(id);

export const brief = (projectDir: string, ref: string): string => buildBrief(projectDir, findCard(readCards(projectDir).cards, ref));

// --- questions ------------------------------------------------------------------------------

export function questions(projectDir: string, ref: string): { id: string; questions: Question[] } {
  const card = findCard(readCards(projectDir).cards, ref);
  return { id: card.id, questions: readQuestions(projectDir, card) };
}

export const ask = (projectDir: string, ref: string, items: { question: string; recommended?: string }[], who: Role): { path: string; added: Question[] } => addQuestions(projectDir, ref, items, who);

export const answer = (projectDir: string, ref: string, n: number, reply: { text?: string; accept?: boolean }, who: Role): Question => writeAnswer(projectDir, ref, n, reply, who);

// --- inbox ----------------------------------------------------------------------------------

/** The inbox as `codeloop inbox` prints it, read from the engine's files; `sort` defaults to score. */
export const inboxReport = (projectDir: string, opts: { sort?: 'score' | 'age' } = {}): Inbox => buildInbox(projectDir, undefined, opts);
export const inboxSeen = (projectDir: string): void => markInboxSeen(projectDir);

/** The inbox as three capped, cursor-paged lists from the index; `shippedSince` defaults to the last `--seen`. */
export function inboxPaged(projectDir: string, index: ProjectIndex, q: InboxQuery = {}): Promise<InboxPayload> {
  return index.cards.inbox({ ...q, shippedSince: q.shippedSince?.trim() || readInboxSeen(projectDir) });
}

// --- wiki: the gotcha / decision / concept pages the engine injects --------------------------

export const wikiEntries = (projectDir: string): WikiEntry[] => listPages(projectDir);
export const wikiInject = (projectDir: string, files: string[]): WikiEntry[] => inject(projectDir, files);
export const wikiLint = (projectDir: string): ReturnType<typeof lintWiki> => lintWiki(projectDir);

// --- index-backed reads: what the board draws -----------------------------------------------

/** The query string's filters for the cards index: each facet key may repeat, `q` is full text; `needsMe=1` is read as `role`. */
export function cardFilter(query: Record<string, string[] | undefined> | URLSearchParams, role?: Role): CardFilter {
  const all = (k: string) => (query instanceof URLSearchParams ? query.getAll(k) : (query[k] ?? []));
  const filter: CardFilter = {};
  for (const key of CARD_FILTERS) {
    const values = all(key).flatMap(v => v.split(',')).map(v => v.trim()).filter(Boolean);
    if (values.length) filter[key] = values;
  }
  const q = all('q')[0]?.trim();
  if (q) filter.q = q;
  if (all('gate')[0] === 'waiting') filter.gate = 'waiting';
  if (all('questions')[0] === 'open') filter.questions = 'open';
  const since = all('shippedSince')[0]?.trim();
  if (since) filter.shippedSince = since;
  if (all('stuck')[0] === '1') filter.stuck = true;
  if (all('needsMe')[0] === '1' && role) filter.needsMe = role;
  if (all('sort')[0] === 'score') filter.sort = 'score';
  return filter;
}

/**
 * Cards, the lanes they move through and the inbox summary: everything the Cards view draws.
 * Cards come without their event logs unless `includeEvents`; `getCard` carries them. The
 * inbox's `needs_you` list rides along only with `includeInbox`: at 5k cards it is hundreds of
 * kB that the paged inbox serves on its own.
 */
export async function cardsPayload(index: ProjectIndex, owner: boolean, opts: { filter?: CardFilter; cursor?: string; limit?: number; includeEvents?: boolean; includeInbox?: boolean; facets?: boolean } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 5000);
  const { items, nextCursor, total } = await index.cards.list(opts.filter, opts.cursor, limit);
  const lanes = await index.lanes.list();
  const inbox = await inboxPaged(index.projectDir, index, opts.includeInbox ? { limit: 5000 } : {});
  const cards = opts.includeEvents ? await Promise.all(items.map(async c => ({ ...c, events: await index.cards.events(c.id) }))) : items;
  return {
    version: index.cardsFileVersion,
    owner,
    cards,
    nextCursor,
    total,
    ...(opts.facets ? { facets: await index.cards.facets() } : {}),
    lanes: lanes.map(l => ({ id: l.id, version: l.version, stages: l.stages.map(s => ({ id: s.id, skill: s.skill, output: s.output, gate: s.gate })) })),
    inbox: { summary: inbox.summary, ...(opts.includeInbox ? { needs_you: inbox.needsYou.cards } : {}) },
  };
}

/** One card with its event log, by id or number; undefined when the board has no such card. */
export async function getCard(index: ProjectIndex, ref: string) {
  const card = await index.cards.get(ref);
  return card ? { ...card, events: await index.cards.events(card.id) } : undefined;
}

/** The page's path to the board's `/mocks/*` route. */
export const mockHref = (path: string) => `/${path.replace(`${MOCKS_DIR}/`, 'mocks/')}`;

/** Everything the card screen shows at once: the card, its spec and tasks, questions, evidence, mock and wiki page. */
export async function cardFull(index: ProjectIndex, store: Store, ref: string): Promise<CardFull> {
  const { projectDir } = index;
  const card = findCard(readCards(projectDir).cards, ref);
  const indexed = await index.cards.get(card.id);
  let spec: CardFull['spec'] = null;
  let tasks: Task[] = [];
  const dir = indexed?.specDir;
  if (dir) {
    const file = join(projectDir, dir, 'spec.md');
    spec = { dir, text: existsSync(file) ? readFileSync(file, 'utf-8') : null };
    tasks = existsSync(join(projectDir, dir, 'tasks.md')) ? readTasks(projectDir, dir).tasks : [];
  }
  const mock = index.mockOf(card.id);
  const evidence = (await store.evidence.list()).find(e => e.cardId === card.id) ?? null;
  const page = (await store.pages.get(`${WIKI_DIR}/cards/${card.id}.md`)) ?? null;
  return {
    card: { ...card, ...(mock ? { mock: mockHref(mock) } : {}), openQuestions: index.openQuestions(card.id).length },
    spec,
    tasks,
    questions: readQuestions(projectDir, card),
    evidence,
    mock: mock ? mockHref(mock) : null,
    page,
  };
}

/** Text evidence comes with its contents; an image is a path the caller fetches itself. */
export async function evidenceDetail(projectDir: string, store: Store, nnn: string): Promise<EvidenceDetail | undefined> {
  const found = await store.evidence.get(nnn);
  if (!found) return undefined;
  return { ...found, files: found.files.map(f => (f.kind === 'md' || f.kind === 'json' || f.kind === 'txt' ? { ...f, content: readFileSync(join(projectDir, f.path), 'utf-8') } : f)) };
}

export const artifacts = async (index: ProjectIndex) => (await index.artifacts.list()).map(a => (a.kind === 'mock' ? { ...a, href: mockHref(a.id) } : a));

export const stats = async (index: ProjectIndex): Promise<Stats> => computeStats(await index.cards.all(), await index.lanes.list());

// Anything that looks like a credential is left out of the public config, whatever config.yaml calls it.
const SECRET = /key|token|secret|password/i;
function withoutSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSecrets);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !SECRET.test(k)).map(([k, v]) => [k, withoutSecrets(v)]));
  return value;
}
export const publicConfig = async (store: Store): Promise<Config> => withoutSecrets(await store.config.all()) as Config;

/** The page list carries no bodies; `q` is a full-text search and each hit carries an excerpt. */
export async function listPagesIndexed(index: ProjectIndex, filter: { folder?: string; q?: string } = {}, cursor?: string, limit?: number) {
  const { items, nextCursor, total } = await index.pages.list(filter, cursor, Math.min(Math.max(limit ?? 200, 1), 5000));
  return { pages: items, nextCursor, total };
}

export const getPage = (index: ProjectIndex, id: string) => index.pages.get(id);

/**
 * Create or replace a page with the version the editor read. The store refuses paths outside
 * wiki/ and specs/; a stale `expectVersion` is a ConflictError.
 */
export async function putPage(index: ProjectIndex, store: Store, id: string, write: PageWrite): Promise<{ page: WikiPage; created: boolean }> {
  if (typeof write.body !== 'string') throw new RefusalError('body (markdown text) is required');
  const existing = await store.pages.get(id);
  const page = await store.pages.put({ ...(existing ?? { id, folder: '', title: id }), id, frontmatter: write.frontmatter ?? existing?.frontmatter ?? {}, body: write.body }, write.expectVersion);
  await index.patch({ repo: 'pages', id });
  return { page, created: !existing };
}

/** False when there was no such page. */
export async function deletePage(index: ProjectIndex, store: Store, id: string): Promise<boolean> {
  if (!(await store.pages.get(id))) return false;
  await store.pages.remove(id);
  await index.patch({ repo: 'pages', id });
  return true;
}

export { ConflictError, RefusalError, DONE, resolveRole };
export type { Band, CardChain };

// --- wiki outline: the read the Setup screen and `wiki init --from-repo --dry-run` share --------
import { outlineSummary as wikiOutlineSummary, writeOutline as writeWikiOutlineLib, type OutlineSummary as WikiOutlineSummary, type WriteOutlineResult as WikiOutlineWriteResult } from './wiki-outline.js';
export const wikiOutline = (projectDir: string): WikiOutlineSummary[] => wikiOutlineSummary(projectDir);
/** `wiki init --from-repo --write`: no server route yet, so this is called from the local transport only. */
export const writeWikiOutline = (projectDir: string, opts: { force?: boolean } = {}): WikiOutlineWriteResult => writeWikiOutlineLib(projectDir, opts);
export type { WikiOutlineSummary, WikiOutlineWriteResult };

// --- skill eval: `codeloop skill eval`, replaying a skill's fixtures against a headless agent ---
export { listSkillNames, loadSkillDef, runSkillEval } from './skill-eval.js';
export type { FixtureEvalResult, GradedLine, SkillDef, SkillEvalOptions, SkillEvalReport } from './skill-eval.js';
