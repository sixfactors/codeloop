import type {
  ActivityEntry,
  ActivityQuery,
  AdoptCounts,
  BoardView,
  HomeView,
  AdvanceReport,
  Artifact,
  Card,
  CardCreated,
  CardActivity,
  GateInput,
  GateRecord,
  MergeResult,
  StoryWorktree,
  HandbackInput,
  HandbackRecord,
  OrchOptions,
  OrchStarted,
  OrchStatusRow,
  OrchView,
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
  LintResult,
  LiveEvent,
  NewCardInput,
  NextAction,
  PageWrite,
  PagesPayload,
  PagesQuery,
  ProposalInput,
  Question,
  ProjectDetection,
  Rice,
  RoleOption,
  RunRecord,
  Session,
  RunStreamItem,
  RunView,
  ScoredRecord,
  SetupStatus,
  SkillDef,
  SkillEvalOptions,
  SkillEvalReport,
  SplitResult,
  StageOutput,
  Stats,
  WikiBuildResult,
  WikiEntry,
  WikiMigrateResult,
  WikiOutlineSummary,
  WikiOutlineWriteResult,
  WikiPage,
  WikiShapeCount,
} from './types.js';

/**
 * A card's activity as it happens, for both transports. Once the live stream says hello it is
 * subscribed, so the replay read after that misses nothing; a line that arrives both ways is
 * dropped by its cursor.
 */
export async function* followCardActivity(ref: string, opts: { after?: string; signal?: AbortSignal }, events: (signal?: AbortSignal) => AsyncIterable<LiveEvent>, page: (ref: string, query: ActivityQuery) => Promise<CardActivity>): AsyncIterable<ActivityEntry> {
  // Resolves the card first, so an unknown one is refused before anything is subscribed.
  const { card } = await page(ref, { limit: 1 });
  let seen = -1;
  for await (const event of events(opts.signal)) {
    if (!('type' in event)) continue;
    if (event.type === 'hello') {
      if (opts.after === undefined) continue;
      let after: string | null = opts.after;
      while (after !== null) {
        const next: CardActivity = await page(card, { after, limit: 1000 });
        for (const line of next.lines) {
          seen = Number(line.cursor);
          yield line;
        }
        after = next.next;
      }
      continue;
    }
    if (event.type !== 'activity' || event.card !== card || Number(event.line.cursor) <= seen) continue;
    seen = Number(event.line.cursor);
    yield event.line;
  }
}

/** A card as `GET /api/cards/:id` serves it: the indexed copy with its event log. */
export type CardWithEvents = IndexedCard & { events: CardEvent[] };

export interface AskInput {
  question: string;
  /** With options, the letter of the one to take; otherwise free text. */
  recommended?: string;
  /** Two to four choices when the fork is real; lettered A, B, C, D in order. */
  options?: string[];
}

export type AnswerInput = { text?: string; accept?: boolean; option?: string };
/** What accepting every recommendation did: how many were answered, which had none to take, and the questions after. */
export type AcceptAllResult = { accepted: number; skipped: number[]; questions: Question[] };

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
  /** Starts the shape workflow: a problem statement, so no story title check runs. */
  shapeProblem(problem: string, opts?: RoleOption): Promise<CardCreated>;
  approveCard(ref: string, opts?: RoleOption & { note?: string }): Promise<DecisionReport>;
  rejectCard(ref: string, note: string, opts?: RoleOption): Promise<DecisionReport>;
  closeCard(ref: string, outcome: 'done' | 'dropped', note?: string, opts?: RoleOption): Promise<{ card: Card; hint: string }>;
  parkCard(ref: string, note?: string, opts?: RoleOption): Promise<{ card: Card; hint: string }>;
  placeCard(ref: string, stage: string, opts?: RoleOption): Promise<{ card: Card; hint: string }>;
  brief(ref: string): Promise<string>;
  /** Starts the card's stage: the check, the agent when it fails, one advance. Returns before it ends. */
  runCard(ref: string, opts?: { agent?: string }): Promise<{ runId: string }>;
  getRun(runId: string): Promise<RunView | undefined>;
  /** Settles once the run is done or failed. */
  waitRun(runId: string): Promise<RunRecord>;
  /** The log's lines as they are written, then `{ end }` with the final record. */
  streamRun(runId: string, signal?: AbortSignal): AsyncIterable<RunStreamItem>;
  /** One page of the card's activity, oldest first. Refused (404) for an unknown card. */
  cardActivity(ref: string, query?: ActivityQuery): Promise<CardActivity>;
  /** The card's activity lines as they are written; with `after`, the lines since that cursor first ('0' for all of them). */
  activityStream(ref: string, opts?: { after?: string; signal?: AbortSignal }): AsyncIterable<ActivityEntry>;
  /** Runs the proof command and records the hand-back; a failing proof is recorded with its exit code. */
  handback(ref: string, input: HandbackInput): Promise<HandbackRecord>;
  handbacks(ref: string): Promise<HandbackRecord[]>;
  /** Reruns the latest hand-back's proof, the stage check and one claim; records a pass or fail verdict. Refused when there is no hand-back. */
  gate(ref: string, input: GateInput): Promise<GateRecord>;
  gates(ref: string): Promise<GateRecord[]>;
  /** Creates (or reuses) the story's own git worktree and branch and records both on the card. */
  worktree(ref: string): Promise<StoryWorktree>;
  /** Merges the story's branch into the trunk; refused unless the latest gate passed and no overlapping file is dirty. */
  merge(ref: string): Promise<MergeResult>;
  /** Starts one orchestrated turn (a run to `opts.until` when given) in the background and returns at once; read the result with `orchView`. */
  orchRun(ref: string, opts?: OrchOptions): Promise<{ turn: OrchStarted }>;
  orchStatus(): Promise<OrchStatusRow[]>;
  orchView(ref: string): Promise<OrchView>;
  stageOutput(ref: string): Promise<StageOutput>;
  writeStageOutput(ref: string, text: string, opts?: RoleOption): Promise<StageOutput>;
  splitCard(ref: string, titles: string[], opts?: RoleOption): Promise<SplitResult>;
  detectSetup(): Promise<ProjectDetection>;
  adoptSkills(opts?: { from?: string[]; replace?: boolean }): Promise<AdoptCounts>;
  setupStatus(): Promise<SetupStatus>;
  /** Every skill name under the skills dir (default `templates/skills`). Local only. */
  skillsList(opts?: { skillsDir?: string }): Promise<string[]>;
  /** A skill's parsed `SKILL.md`. Local only. */
  skillShow(name: string, opts?: { skillsDir?: string }): Promise<SkillDef>;
  /** Replays a skill's fixtures in a throwaway project: the agent on the stage, the stage's check, then a graded run against the checklist. Local only. */
  skillEval(name: string, opts?: SkillEvalOptions): Promise<SkillEvalReport>;
  /** Fills the story fields of proposals whose description was written as a story. Local only. */
  migrateStories(): Promise<string[]>;
  /** Sets `feature:` and its initiative on the cards a mapping file names. Local only. */
  migrateFeatures(mappingFile?: string): Promise<{ changed: string[]; mapping: string }>;
  questions(ref: string): Promise<Question[]>;
  ask(ref: string, items: AskInput[], opts?: RoleOption): Promise<{ path: string; added: Question[] }>;
  answer(ref: string, n: number, reply: AnswerInput, opts?: RoleOption): Promise<Question>;
  acceptAll(ref: string, opts?: RoleOption): Promise<AcceptAllResult>;
  inbox(query?: InboxQuery): Promise<InboxPayload>;
  board(): Promise<BoardView>;
  home(): Promise<HomeView>;
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
  /** Owner mode, sign-in state, token validity, default-password notice, and the project. */
  sessionInfo(): Promise<Session>;
  /** Signs this browser in; the server sets the session cookie. Refused (401) on a wrong user or password. Local only: there is no browser session to establish. */
  login(user: string, password: string): Promise<{ ok: true }>;
  /** Clears this browser's session cookie. */
  logout(): Promise<{ ok: true }>;
  /** Settings' "Board sign-in" section. Refused (400) without the right current password. */
  changeBoardAuth(input: { currentPassword: string; user?: string; newPassword?: string }): Promise<{ user: string; isDefault: boolean }>;
  /** The one thing the board's first screen leads with: empty, waiting, running or idle. */
  nextAction(): Promise<NextAction>;
  events(signal?: AbortSignal): AsyncIterable<LiveEvent>;
  wikiEntries(): Promise<WikiEntry[]>;
  wikiInject(files: string[]): Promise<WikiEntry[]>;
  wikiLint(): Promise<LintResult>;
  /** The outline `wiki init --from-repo` would write: page paths, titles, fact/assumption counts, whether each already exists. Local only. */
  wikiOutline(): Promise<WikiOutlineSummary[]>;
  /** Writes the outline's pages; skips any that already exist unless `force`. Local only. */
  writeWikiOutline(opts?: { force?: boolean }): Promise<WikiOutlineWriteResult>;
  /** Moves scanner filler into `reference/legacy/`, never deleting it. Local only. */
  migrateWiki(opts?: { dryRun?: boolean }): Promise<WikiMigrateResult>;
  wikiMerge(a: string, b: string): Promise<WikiEntry>;
  migrateDecisions(opts?: { dryRun?: boolean }): Promise<{ from: string; to: string | null; why: string }[]>;
  /** The shape with page counts: every section in spec order, empty ones left out. Local only. */
  wikiShape(): Promise<WikiShapeCount[]>;
  /** Refreshes the facts, starts a card in the `wiki` lane titled "Explain the architecture", and runs it unless `opts.run` is false. Local only. */
  buildWiki(opts?: { agent?: string; run?: boolean }, roleOpts?: RoleOption): Promise<WikiBuildResult>;
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
    /** `codeloop shape "<problem>"`: starts the shape workflow (brief → interview → breakdown → rank). */
    shape: (problem: string, opts?: RoleOption) => this.transport.shapeProblem(problem, opts),
    approve: (ref: string, opts?: RoleOption & { note?: string }) => this.transport.approveCard(ref, opts),
    reject: (ref: string, note: string, opts?: RoleOption) => this.transport.rejectCard(ref, note, opts),
    close: (ref: string, outcome: 'done' | 'dropped', note?: string, opts?: RoleOption) => this.transport.closeCard(ref, outcome, note, opts),
    park: (ref: string, note?: string, opts?: RoleOption) => this.transport.parkCard(ref, note, opts),
    place: (ref: string, stage: string, opts?: RoleOption) => this.transport.placeCard(ref, stage, opts),
    /** What an agent is given to do the card's current stage. */
    brief: (ref: string) => this.transport.brief(ref),
    /** Runs the current stage: the check first, the agent (named or configured) when it fails, then one advance. */
    run: (ref: string, opts?: { agent?: string }) => this.transport.runCard(ref, opts),
    /** What a builder reports when it stops: the proof command is run here and its exit code and output stored. */
    handback: (ref: string, input: HandbackInput) => this.transport.handback(ref, input),
    /** The card's hand-backs, newest first. */
    handbacks: (ref: string) => this.transport.handbacks(ref),
    /** Gates the card's latest (or named) hand-back: the proof is rerun, not believed. */
    gate: (ref: string, input: GateInput = {}) => this.transport.gate(ref, input),
    /** The card's gate records, newest first. */
    gates: (ref: string) => this.transport.gates(ref),
    /** The story's own worktree and branch, created on first call and reused after. */
    worktree: (ref: string) => this.transport.worktree(ref),
    /** Merges the story's branch into the trunk once its gate passed; never rebases. */
    merge: (ref: string) => this.transport.merge(ref),
    /** The current stage's output file: path and text, or null text when it is not written yet. */
    output: (ref: string) => this.transport.stageOutput(ref),
    /** Writes the current stage's output file, making its folders. The check does not run. */
    writeOutput: (ref: string, text: string, opts?: RoleOption) => this.transport.writeStageOutput(ref, text, opts),
    /** What happened on the card, oldest first: edits, commands, checks, commits, gates. Pass `next` back as `after` for the next page. */
    activity: (ref: string, query?: ActivityQuery) => this.transport.cardActivity(ref, query),
    /** The card's activity as it happens, from the live stream; `after` replays from a cursor first. */
    activityStream: (ref: string, opts?: { after?: string; signal?: AbortSignal }) => this.transport.activityStream(ref, opts),
    /** Sibling cards under the same feature, each marked `split_from`. */
    split: (ref: string, titles: string[], opts?: RoleOption) => this.transport.splitCard(ref, titles, opts),
    migrateStories: () => this.transport.migrateStories(),
    migrateFeatures: (mappingFile?: string) => this.transport.migrateFeatures(mappingFile),
  };

  /** The orchestrator: a builder agent takes a story's stage through the gate and merge. */
  readonly orch = {
    /** Starts one turn (a run to `until` when given) and returns at once. */
    run: (ref: string, opts?: OrchOptions) => this.transport.orchRun(ref, opts),
    /** Every story under orchestration: stage, turns, last outcome, builder, idle minutes. */
    status: () => this.transport.orchStatus(),
    /** The story's turn record and the owner's report: what works now, proof, what is left, the next gate. */
    report: (ref: string) => this.transport.orchView(ref),
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

  /** Skills under `templates/skills/` (or `opts.skillsDir`), and `codeloop skill eval` over their fixtures. */
  readonly skills = {
    list: (opts?: { skillsDir?: string }) => this.transport.skillsList(opts),
    show: (name: string, opts?: { skillsDir?: string }) => this.transport.skillShow(name, opts),
    eval: (name: string, opts?: SkillEvalOptions) => this.transport.skillEval(name, opts),
  };

  readonly questions = {
    list: (ref: string) => this.transport.questions(ref),
    ask: (ref: string, items: AskInput[], opts?: RoleOption) => this.transport.ask(ref, items, opts),
    answer: (ref: string, n: number, reply: AnswerInput, opts?: RoleOption) => this.transport.answer(ref, n, reply, opts),
    /** Accept every open question's recommended answer in one write. */
    acceptAll: (ref: string, opts?: RoleOption) => this.transport.acceptAll(ref, opts),
  };

  /** The board: every story in one row of the six states, already grouped by the server. */
  readonly board = { get: () => this.transport.board() };

  /** Home: what needs you, what is failing, what is moving, the agents working and what shipped. */
  readonly home = { get: () => this.transport.home() };

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
    /** What `wiki init --from-repo --dry-run` prints; the Setup screen's preview before `--write`. */
    outline: () => this.transport.wikiOutline(),
    /** `wiki init --from-repo --write`: seeds the pages the outline listed. */
    writeOutline: (opts?: { force?: boolean }) => this.transport.writeWikiOutline(opts),
    /** `wiki migrate`: moves scanner filler into `reference/legacy/`, never deleting it. */
    migrate: (opts?: { dryRun?: boolean }) => this.transport.migrateWiki(opts),
    /** Fold page b into page a (paths or file names). */
    merge: (a: string, b: string) => this.transport.wikiMerge(a, b),
    /** Turn research mirror decision pages into decisions titled by the choice, or remove them. */
    migrateDecisions: (opts?: { dryRun?: boolean }) => this.transport.migrateDecisions(opts),
    /** The shape with page counts, pre-joined for the home page and sidebar. */
    shape: () => this.transport.wikiShape(),
    /** `wiki build`: refreshes the facts, starts a card in the `wiki` lane, and runs it unless `run: false`. */
    build: (opts?: { agent?: string; run?: boolean }, roleOpts?: RoleOption) => this.transport.buildWiki(opts, roleOpts),
  };

  artifacts = () => this.transport.artifacts();
  evidence = (nnn: string) => this.transport.evidence(nnn);
  stats = () => this.transport.stats();
  config = () => this.transport.config();
  /** Owner mode, sign-in state and the project, for the app shell's read-only banner and header. */
  session = () => this.transport.sessionInfo();
  readonly auth = {
    login: (user: string, password: string) => this.transport.login(user, password),
    logout: () => this.transport.logout(),
    changeBoardAuth: (input: { currentPassword: string; user?: string; newPassword?: string }) => this.transport.changeBoardAuth(input),
  };
  /** The board's "what next" panel: one state, with the data that state needs. */
  next = () => this.transport.nextAction();
  /** A `hello` with the version counters, then one message per changed entity. */
  events = (signal?: AbortSignal) => this.transport.events(signal);
  close = () => this.transport.close();
}

/** True when the card has a human waiting on it: parked at a gate, including a proposal. */
export const isWaiting = (card: Pick<Card, 'gate'>) => Boolean(card.gate);
