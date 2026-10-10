/**
 * The local transport: the same service functions the API routes call, in process, so the CLI
 * needs no server. Node only; `@protoboxai/codeloop/sdk/local` is a separate entry so the
 * browser path never loads it. Engine reads and writes touch the project's files directly; the
 * index-backed reads build the project index on first use and `close()` drops it.
 */
import { closeIndex, getIndex, type ProjectIndex } from '../lib/index/index.js';
import * as services from '../lib/services.js';
import { openStore, type Store } from '../lib/store/index.js';
import { CodeloopClient, type Transport } from './client.js';
import type { LiveEvent, Role, RoleOption } from './types.js';

export interface LocalOptions {
  /** The role every write acts as when the call names none; otherwise `--as`, CODELOOP_ROLE, then the terminal decide. */
  role?: Role;
  /** A store to read through instead of the one config.yaml names. */
  store?: Store;
}

export function localTransport(projectDir: string, options: LocalOptions = {}): Transport {
  let index: ProjectIndex | undefined;
  let store: Store | undefined = options.store;
  // The index watches the project's files and keeps the process alive, so only a read that
  // needs it opens one.
  const indexed = () => {
    store ??= openStore(projectDir);
    index ??= getIndex(projectDir, store);
    return index;
  };
  const stored = () => (store ??= openStore(projectDir));
  const role = (opts?: RoleOption): Role => (opts?.as === undefined && options.role ? options.role : services.resolveRole(opts?.as));

  async function* events(signal?: AbortSignal): AsyncIterable<LiveEvent> {
    const idx = indexed();
    await idx.ready;
    const queue: LiveEvent[] = [];
    let wake: (() => void) | undefined;
    const stop = idx.subscribe(diffs => {
      queue.push(...diffs);
      wake?.();
    });
    signal?.addEventListener('abort', () => {
      stop();
      wake?.();
    });
    try {
      yield { type: 'hello', versions: { ...idx.versions } };
      while (!signal?.aborted) {
        if (!queue.length) await new Promise<void>(resolve => (wake = resolve));
        wake = undefined;
        while (queue.length) yield queue.shift()!;
      }
    } finally {
      stop();
    }
  }

  return {
    listCards: async (query = {}, cursor, opts = {}) => {
      const { limit, needsMe, ...filter } = query;
      const who = role();
      return services.cardsPayload(indexed(), who === 'owner', { filter: { ...filter, ...(needsMe ? { needsMe: who } : {}) }, cursor, limit, ...opts });
    },
    getCard: ref => services.getCard(indexed(), ref),
    cardFull: ref => services.cardFull(indexed(), stored(), ref),
    showCard: async ref => services.showCard(projectDir, ref),
    cardRecords: filter => services.listCards(projectDir, filter),
    createCard: async (input, opts) => services.newCard(projectDir, input, role(opts)),
    proposeCard: async (input, opts) => services.newProposal(projectDir, input, role(opts)),
    advanceCard: async (ref, opts) => services.advance(projectDir, ref, opts),
    shapeProblem: async (problem, opts) => services.shape(projectDir, problem, role(opts)),
    approveCard: async (ref, opts = {}) => services.approve(projectDir, ref, role(opts), opts.note),
    rejectCard: async (ref, note, opts) => services.reject(projectDir, ref, role(opts), note),
    brief: async ref => services.brief(projectDir, ref),
    runCard: async (ref, opts = {}) => ({ runId: services.runCard(projectDir, ref, opts).runId }),
    getRun: async runId => services.run(projectDir, runId),
    waitRun: runId => services.runWait(projectDir, runId),
    streamRun: (runId, signal) => services.runStream(projectDir, runId, signal),
    stageOutput: async ref => services.stageOutput(projectDir, ref),
    writeStageOutput: async (ref, text, opts) => services.writeStageOutput(projectDir, ref, text, role(opts)),
    splitCard: async (ref, titles, opts) => services.splitCard(projectDir, ref, titles, role(opts)),
    detectSetup: async () => services.detectSetup(projectDir),
    adoptSkills: async (opts = {}) => {
      const { entries: _entries, ...counts } = services.adoptSkills(projectDir, opts);
      return counts;
    },
    setupStatus: async () => services.setupStatus(projectDir),
    skillsList: async (opts = {}) => services.listSkillNames(projectDir, opts.skillsDir),
    skillShow: async (name, opts = {}) => services.loadSkillDef(projectDir, name, opts.skillsDir),
    skillEval: async (name, opts = {}) => services.runSkillEval(projectDir, name, opts),
    migrateStories: async () => services.migrateStoryFields(projectDir),
    migrateFeatures: async mappingFile => services.migrateFeatureFields(projectDir, mappingFile),
    questions: async ref => services.questions(projectDir, ref).questions,
    ask: async (ref, items, opts) => services.ask(projectDir, ref, items, role(opts)),
    answer: async (ref, n, reply, opts) => services.answer(projectDir, ref, n, reply, role(opts)),
    inbox: (query = {}) => {
      const { needsMe, ...rest } = query;
      return services.inboxPaged(projectDir, indexed(), { ...rest, ...(needsMe ? { needsMe: role() } : {}) });
    },
    inboxReport: async opts => services.inboxReport(projectDir, opts),
    markInboxSeen: async () => services.inboxSeen(projectDir),
    lanes: () => indexed().lanes.list(),
    initiatives: () => indexed().initiatives.list(),
    initiativeTree: id => services.initiativeTree(indexed(), id),
    epics: () => services.listEpics(indexed()),
    epicTree: id => services.epicTree(indexed(), id),
    createEpic: input => services.newEpic(projectDir, input),
    features: () => services.listFeatures(indexed()),
    feature: id => services.featureDetail(indexed(), id),
    createFeature: input => services.newFeature(projectDir, input),
    scoreFeature: (id, rice) => services.scoreFeature(projectDir, id, rice),
    listPages: (query = {}, cursor) => services.listPagesIndexed(indexed(), { folder: query.folder, q: query.q }, cursor, query.limit),
    getPage: id => services.getPage(indexed(), id),
    putPage: (id, write) => services.putPage(indexed(), stored(), id, write),
    deletePage: id => services.deletePage(indexed(), stored(), id),
    artifacts: () => services.artifacts(indexed()),
    evidence: nnn => services.evidenceDetail(projectDir, stored(), nnn),
    stats: () => services.stats(indexed()),
    config: () => services.publicConfig(stored()),
    events,
    wikiEntries: async () => services.wikiEntries(projectDir),
    wikiInject: async files => services.wikiInject(projectDir, files),
    wikiLint: async () => services.wikiLint(projectDir),
    wikiOutline: async () => services.wikiOutline(projectDir),
    writeWikiOutline: async (opts = {}) => services.writeWikiOutline(projectDir, opts),
    close: async () => {
      if (index) await closeIndex(projectDir);
      if (store && !options.store) await store.close();
      index = undefined;
      store = options.store;
    },
  };
}

/** A client over the project's own files: `createLocalClient(process.cwd())`. */
export const createLocalClient = (projectDir: string, options: LocalOptions = {}) => new CodeloopClient(localTransport(projectDir, options));

export { CodeloopClient };
/** The `## Q<n>` block parser and the per-card limit, for a CLI reading questions from a file. */
export { MAX_QUESTIONS, parseQuestions } from '../lib/interview.js';
