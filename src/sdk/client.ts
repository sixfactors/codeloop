import type {
  AdoptCounts,
  AdvanceReport,
  Artifact,
  Card,
  CardCreated,
  CardEvent,
  CardFull,
  CardListFilter,
  CardProposed,
  CardRecord,
  CardShow,
  CardsPayload,
  CardsQuery,
  Config,
  DecisionReport,
  Epic,
  EpicInput,
  EpicNode,
  EvidenceDetail,
  Feature,
  FeatureInput,
  FeatureNode,
  Inbox,
  InboxPayload,
  InboxQuery,
  IndexedCard,
  IndexedEpic,
  IndexedFeature,
  IndexedInitiative,
  InitiativeTree,
  Lane,
  LiveEvent,
  NewCardInput,
  PageWrite,
  PagesPayload,
  PagesQuery,
  ProposalInput,
  Question,
  ProjectDetection,
  Rice,
  RoleOption,
  RunRecord,
  RunStreamItem,
  RunView,
  ScoredRecord,
  SetupStatus,
  SplitResult,
  StageOutput,
  Stats,
  WikiEntry,
  WikiPage,
} from './types.js';

/** A card as `GET /api/cards/:id` serves it: the indexed copy with its event log. */
export type CardWithEvents = IndexedCard & { events: CardEvent[] };

export interface AskInput {
  question: string;
  recommended?: string;
}

export type AnswerInput = { text?: string; accept?: boolean };

/**
 * A refused or failed operation. `status` follows HTTP whatever the transport: 400 a refusal,
 * 403 the board is read-only or the token is wrong, 404 nothing by that id, 409 a version conflict.
 */
export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The operations both transports implement. The http transport sends each to the Hono API; the
 * local one calls the service function that route calls, in process. Over http the server's
 * `--owner` flag decides the role and `as` is ignored.
 */
export interface Transport {
  listCards(query?: CardsQuery, cursor?: string, opts?: { includeEvents?: boolean; includeInbox?: boolean; facets?: boolean }): Promise<CardsPayload>;
  getCard(ref: string): Promise<CardWithEvents | undefined>;
  cardFull(ref: string): Promise<CardFull>;
  showCard(ref: string): Promise<CardShow>;
  cardRecords(filter?: CardListFilter): Promise<ScoredRecord[]>;
  createCard(input: NewCardInput, opts?: RoleOption): Promise<CardCreated>;
  proposeCard(input: ProposalInput, opts?: RoleOption): Promise<CardProposed>;
  advanceCard(ref: string | undefined, opts?: { event?: string }): Promise<AdvanceReport>;
  approveCard(ref: string, opts?: RoleOption & { note?: string }): Promise<DecisionReport>;
  rejectCard(ref: string, note: string, opts?: RoleOption): Promise<DecisionReport>;
  brief(ref: string): Promise<string>;
  /** Starts the card's stage: the check, the agent when it fails, one advance. Returns before it ends. */
  runCard(ref: string, opts?: { agent?: string }): Promise<{ runId: string }>;
  getRun(runId: string): Promise<RunView | undefined>;
  /** Settles once the run is done or failed. */
  waitRun(runId: string): Promise<RunRecord>;
  /** The log's lines as they are written, then `{ end }` with the final record. */
  streamRun(runId: string, signal?: AbortSignal): AsyncIterable<RunStreamItem>;
  stageOutput(ref: string): Promise<StageOutput>;
  writeStageOutput(ref: string, text: string, opts?: RoleOption): Promise<StageOutput>;
  splitCard(ref: string, titles: string[], opts?: RoleOption): Promise<SplitResult>;
  detectSetup(): Promise<ProjectDetection>;
  adoptSkills(opts?: { from?: string[]; replace?: boolean }): Promise<AdoptCounts>;
  setupStatus(): Promise<SetupStatus>;
  /** Fills the story fields of proposals whose description was written as a story. Local only. */
  migrateStories(): Promise<string[]>;
  /** Sets `feature:` and its initiative on the cards a mapping file names. Local only. */
  migrateFeatures(mappingFile?: string): Promise<{ changed: string[]; mapping: string }>;
  questions(ref: string): Promise<Question[]>;
  ask(ref: string, items: AskInput[], opts?: RoleOption): Promise<{ path: string; added: Question[] }>;
  answer(ref: string, n: number, reply: AnswerInput, opts?: RoleOption): Promise<Question>;
  inbox(query?: InboxQuery): Promise<InboxPayload>;
  inboxReport(opts?: { sort?: 'score' | 'age' }): Promise<Inbox>;
  markInboxSeen(): Promise<void>;
  lanes(): Promise<Lane[]>;
  initiatives(): Promise<IndexedInitiative[]>;
  initiativeTree(id: string): Promise<InitiativeTree | undefined>;
  epics(): Promise<IndexedEpic[]>;
  epicTree(id: string): Promise<EpicNode | undefined>;
  createEpic(input: EpicInput): Promise<Epic>;
  features(): Promise<IndexedFeature[]>;
  feature(id: string): Promise<FeatureNode | undefined>;
  createFeature(input: FeatureInput): Promise<Feature>;
  scoreFeature(id: string, rice: Rice): Promise<Feature>;
  listPages(query?: PagesQuery, cursor?: string): Promise<PagesPayload>;
  getPage(id: string): Promise<WikiPage | undefined>;
  putPage(id: string, write: PageWrite): Promise<{ page: WikiPage; created: boolean }>;
  deletePage(id: string): Promise<boolean>;
  artifacts(): Promise<(Artifact & { href?: string })[]>;
  evidence(nnn: string): Promise<EvidenceDetail | undefined>;
  stats(): Promise<Stats>;
  config(): Promise<Config>;
  events(signal?: AbortSignal): AsyncIterable<LiveEvent>;
  wikiEntries(): Promise<WikiEntry[]>;
  wikiInject(files: string[]): Promise<WikiEntry[]>;
  wikiLint(): Promise<{ broken: string[]; stale: string[]; duplicates: string[] }>;
  close(): Promise<void>;
}

/**
 * The one client the CLI and the UI call. Every method is a transport operation under the name
 * the thing is known by on the board: `cards`, `questions`, `inbox`, `pages`, `wiki`.
 */
export class CodeloopClient {
  constructor(readonly transport: Transport) {}

  readonly cards = {
    /** One page of cards without their event logs, with the lanes and the inbox summary. */
    list: (query?: CardsQuery, cursor?: string, opts?: { includeEvents?: boolean; includeInbox?: boolean; facets?: boolean }) => this.transport.listCards(query, cursor, opts),
    /** One card with its event log; undefined when there is none by that id or number. */
    get: (ref: string) => this.transport.getCard(ref),
    /** The card, its spec and tasks, questions, evidence, mock and wiki page at once. */
    full: (ref: string) => this.transport.cardFull(ref),
    /** The card, its stage brief and the Next line, as `codeloop card show` prints them. */
    show: (ref: string) => this.transport.showCard(ref),
    /** Cards as the store holds them, each with a version a later write can expect. */
    records: (filter?: CardListFilter) => this.transport.cardRecords(filter),
    new: (input: NewCardInput, opts?: RoleOption) => this.transport.createCard(input, opts),
    propose: (input: ProposalInput, opts?: RoleOption) => this.transport.proposeCard(input, opts),
    /** Runs the stage's check and moves the card if it passes; with no ref, the one active card. */
    advance: (ref?: string, opts?: { event?: string }) => this.transport.advanceCard(ref, opts),
    approve: (ref: string, opts?: RoleOption & { note?: string }) => this.transport.approveCard(ref, opts),
    reject: (ref: string, note: string, opts?: RoleOption) => this.transport.rejectCard(ref, note, opts),
    /** What an agent is given to do the card's current stage. */
    brief: (ref: string) => this.transport.brief(ref),
    /** Runs the current stage: the check first, the agent (named or configured) when it fails, then one advance. */
    run: (ref: string, opts?: { agent?: string }) => this.transport.runCard(ref, opts),
    /** The current stage's output file: path and text, or null text when it is not written yet. */
    output: (ref: string) => this.transport.stageOutput(ref),
    /** Writes the current stage's output file, making its folders. The check does not run. */
    writeOutput: (ref: string, text: string, opts?: RoleOption) => this.transport.writeStageOutput(ref, text, opts),
    /** Sibling cards under the same feature, each marked `split_from`. */
    split: (ref: string, titles: string[], opts?: RoleOption) => this.transport.splitCard(ref, titles, opts),
    migrateStories: () => this.transport.migrateStories(),
    migrateFeatures: (mappingFile?: string) => this.transport.migrateFeatures(mappingFile),
  };

  /** Stage runs started with `cards.run`. */
  readonly runs = {
    get: (runId: string) => this.transport.getRun(runId),
    wait: (runId: string) => this.transport.waitRun(runId),
    stream: (runId: string, signal?: AbortSignal) => this.transport.streamRun(runId, signal),
  };

  /** What `codeloop init` and `adopt` do, for a board that sets a project up. */
  readonly setup = {
    detect: () => this.transport.detectSetup(),
    adopt: (opts?: { from?: string[]; replace?: boolean }) => this.transport.adoptSkills(opts),
    status: () => this.transport.setupStatus(),
  };

  readonly questions = {
    list: (ref: string) => this.transport.questions(ref),
    ask: (ref: string, items: AskInput[], opts?: RoleOption) => this.transport.ask(ref, items, opts),
    answer: (ref: string, n: number, reply: AnswerInput, opts?: RoleOption) => this.transport.answer(ref, n, reply, opts),
  };

  readonly inbox = {
    /** Three capped, cursor-paged lists and the per-lane numbers. */
    get: (query?: InboxQuery) => this.transport.inbox(query),
    /** The inbox as `codeloop inbox` prints it; parked cards by score, or by age. */
    report: (opts?: { sort?: 'score' | 'age' }) => this.transport.inboxReport(opts),
    markSeen: () => this.transport.markInboxSeen(),
  };

  lanes = () => this.transport.lanes();
  /** Each with `score`, the sum of its features'. */
  initiatives = () => this.transport.initiatives();
  /** initiative → epics → features → stories, with scores, bands and done/total per feature. */
  initiativeTree = (id: string) => this.transport.initiativeTree(id);

  /** The roadmap pages under the initiatives. */
  readonly epics = {
    list: () => this.transport.epics(),
    tree: (id: string) => this.transport.epicTree(id),
    new: (input: EpicInput) => this.transport.createEpic(input),
  };

  readonly features = {
    /** Every feature with its RICE score and band. */
    list: () => this.transport.features(),
    /** One feature with its stories, done and total. */
    get: (id: string) => this.transport.feature(id),
    new: (input: FeatureInput) => this.transport.createFeature(input),
    /** Writes the rice block; the score is derived on every read. */
    score: (id: string, rice: Rice) => this.transport.scoreFeature(id, rice),
  };

  readonly pages = {
    list: (query?: PagesQuery, cursor?: string) => this.transport.listPages(query, cursor),
    search: (q: string, limit?: number) => this.transport.listPages({ q, limit }),
    get: (id: string) => this.transport.getPage(id),
    /** Create or replace; `expectVersion` is the version the editor read. */
    put: (id: string, write: PageWrite) => this.transport.putPage(id, write),
    /** False when there was no such page. */
    delete: (id: string) => this.transport.deletePage(id),
  };

  /** The gotcha, decision and concept pages the engine injects before a stage. */
  readonly wiki = {
    entries: () => this.transport.wikiEntries(),
    inject: (files: string[]) => this.transport.wikiInject(files),
    lint: () => this.transport.wikiLint(),
  };

  artifacts = () => this.transport.artifacts();
  evidence = (nnn: string) => this.transport.evidence(nnn);
  stats = () => this.transport.stats();
  config = () => this.transport.config();
  /** A `hello` with the version counters, then one message per changed entity. */
  events = (signal?: AbortSignal) => this.transport.events(signal);
  close = () => this.transport.close();
}

/** True when the card has a human waiting on it: parked at a gate, including a proposal. */
export const isWaiting = (card: Pick<Card, 'gate'>) => Boolean(card.gate);
