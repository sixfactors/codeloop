import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import MiniSearch from 'minisearch';
import { cardKey, CARDS_PATH, DONE, DROPPED, readCards, RefusalError, type Card, type CardEvent } from '../cards.js';
import type { Role } from '../engine.js';
import { byScoreThenOldest, chainOf, featureMap, scoreFeatures, sumScores, type Band, type CardChain, type Scored } from '../features.js';
import { inboxSummary, laneNumbers, needsYouItem, shippedWithin, type LaneNumbers, type NeedsYouItem } from '../inbox.js';
import { parseQuestions, type Question } from '../interview.js';
import type { Lane } from '../lane.js';
import { MOCKS_DIR } from '../mock.js';
import { EVIDENCE_DIR, FileDriver } from '../store/file.js';

const SPECS_DIR = 'specs';
import { openStore, type Artifact, type Change, type Epic, type Feature, type Initiative, type Store, type WikiPage } from '../store/index.js';

export type IndexedRepo = 'cards' | 'pages' | 'lanes' | 'initiatives' | 'epics' | 'features' | 'artifacts';

/** One change the index applied: what a live client patches by id and version. */
export interface Diff {
  repo: IndexedRepo;
  id: string;
  version: string | number;
  kind: 'put' | 'remove';
}

/** A card as the board lists it: no event log, and what the board derives from the card's folders. */
export interface IndexedCard extends Omit<Card, 'events'>, Scored {
  /** Content hash of the card including its events, so any change to the card moves it. */
  version: string;
  /** `initiative`, `epic` and `feature` are the slugs of the chain the card's feature names; a card without a feature page keeps its own text. */
  openQuestions: number;
  /** The board's `/mocks/...` route to the card's mock, when it has one. */
  mock?: string;
  specDir?: string;
  hasEvidence: boolean;
}

/** A page without its body; the body is read on demand through `pages.get`. */
export interface IndexedPage {
  id: string;
  folder: string;
  title: string;
  frontmatter: Record<string, unknown>;
  /** The file's mtime, ISO. */
  updated: string;
  /** sha1 of the body alone; `version` is the store's, over the whole file. */
  hash: string;
  version: string;
}

export const CARD_FILTERS = ['lane', 'stage', 'initiative', 'epic', 'feature', 'band', 'persona', 'size'] as const;
export type CardFilterKey = (typeof CARD_FILTERS)[number];
/**
 * Each key may name several values; a card matches when it has any of them. `q` is full text over
 * title and story. The inbox-shaped keys narrow further: `gate: 'waiting'` is parked at any gate
 * for a human, `questions: 'open'` has an unanswered interview question, `shippedSince` is done
 * after that ISO time, `stuck` failed its check and waits for a fix.
 */
export type CardFilter = Partial<Record<CardFilterKey, string[]>> & {
  q?: string;
  gate?: 'waiting';
  questions?: 'open';
  shippedSince?: string;
  stuck?: boolean;
  /** Cards parked at a gate this role approves, or with an open question. */
  needsMe?: Role;
  /** `score`: RICE score descending, unscored last, then oldest first. Unset keeps board order. */
  sort?: 'score';
};
export type ListSort = NonNullable<CardFilter['sort']>;
export interface PageFilter {
  folder?: string;
  q?: string;
}
export interface Paged<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}
export type Facets = Record<CardFilterKey, { value: string; count: number }[]>;

/** A card in one of the inbox's lists: the indexed card plus what the inbox says about it. */
export type InboxCard = IndexedCard & Partial<Pick<NeedsYouItem, 'read' | 'last_check' | 'since' | 'last_event'>> & { first?: string };

export type IndexedFeature = Feature & Scored;
export type IndexedEpic = Epic & { score: number };
export type IndexedInitiative = Initiative & { score: number };
/** A story as the roadmap tree lists it. */
export type StoryRow = Pick<IndexedCard, 'id' | 'title' | 'stage' | 'gate' | 'awaiting' | 'band' | 'score'>;
export interface FeatureNode extends IndexedFeature {
  stories: StoryRow[];
  done: number;
  total: number;
}
/** An epic in a tree: `score` is the sum of the features shown under it, which under an initiative is the subset naming that initiative. */
export interface EpicNode extends IndexedEpic {
  features: FeatureNode[];
}
export interface InitiativeTree extends IndexedInitiative {
  epics: EpicNode[];
  /** Features that name this initiative and no epic. */
  features: FeatureNode[];
}
export interface InboxQuery {
  /** Cards done after this ISO time count as shipped; the default is when the inbox was last marked seen. */
  shippedSince?: string;
  /** Narrow every list to one chain or band; comma-separated values are allowed. */
  initiative?: string;
  epic?: string;
  feature?: string;
  band?: string;
  /** Only what this role can act on: gates it approves, open questions. The transport fills the role. */
  needsMe?: Role;
  /** `score` (the default): score descending, then oldest parked first. `age`: oldest parked first. */
  sort?: 'score' | 'age';
  limit?: number;
  cursor?: string;
  questionsCursor?: string;
  shippedCursor?: string;
}
export interface InboxPayload {
  summary: string;
  needsYou: Paged2<InboxCard>;
  questions: Paged2<InboxCard>;
  shipped: Paged2<InboxCard>;
  perLane: LaneNumbers[];
}
/** `Paged` with the list under `cards`, as the inbox names it. */
export type Paged2<T> = { cards: T[]; total: number; nextCursor: string | null };

const sha1 = (text: string) => createHash('sha1').update(text).digest('hex');
/**
 * What the body scan keeps per page: lowercased and no more than this many characters. No regex
 * replace here: a global replace builds a cons tree of slices that holds the file text and costs
 * ten times the characters it carries.
 */
const SCAN_CHARS = 32_768;
const scannable = (body: string) => body.slice(0, SCAN_CHARS).toLowerCase();
const searchDoc = (p: WikiPage) => ({ id: p.id, title: p.title, tags: [p.frontmatter.tags].flat().filter(Boolean).map(String).join(' ') });
const mockHref = (path: string) => `/${path.replace(`${MOCKS_DIR}/`, 'mocks/')}`;
const SEARCH = { prefix: true, combineWith: 'AND' as const };
/** Score descending, unscored last, then by id. */
const byScore = <T extends { id: string; score?: number }>(items: T[]) => [...items].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.id.localeCompare(b.id));

function page<T extends { id: string }>(items: T[], cursor: string | undefined, limit: number): Paged<T> {
  const start = cursor ? items.findIndex(i => i.id === cursor) + 1 : 0;
  const slice = cursor && start === 0 ? [] : items.slice(start, start + limit);
  const last = slice.at(-1);
  return { items: slice, nextCursor: last && start + limit < items.length ? last.id : null, total: items.length };
}

/** About 160 characters around the first search term found in the body, or the body's start. */
export function excerpt(body: string, q: string): string {
  const text = body.replace(/\s+/g, ' ');
  const terms = q.toLowerCase().split(/\W+/).filter(Boolean);
  const lower = text.toLowerCase();
  const at = terms.map(t => lower.indexOf(t)).filter(i => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const from = Math.max(0, at - 60);
  const to = Math.min(text.length, at + 100);
  return `${from > 0 ? '…' : ''}${text.slice(from, to).trim()}${to < text.length ? '…' : ''}`;
}

/**
 * One in-memory copy of what the board reads, built from the store at start and patched one
 * file at a time by the store's change stream. Reads never touch disk except for a page body,
 * a card's events on demand, or a search excerpt.
 */
export class ProjectIndex {
  readonly versions: Record<IndexedRepo, number> = { cards: 0, pages: 0, lanes: 0, initiatives: 0, epics: 0, features: 0, artifacts: 0 };
  /** Resolves once the first build has finished; every read waits on it. */
  readonly ready: Promise<void>;
  /** How long the first build took, in ms, for the bench and the start-up line. */
  buildMs = 0;

  private cardsById = new Map<string, IndexedCard>();
  /** The card as cards.json holds it: the source for every re-derivation, so an overridden chain never feeds back. */
  private rawById = new Map<string, Card>();
  private pagesById = new Map<string, IndexedPage>();
  private pageOrder: IndexedPage[] | null = null;
  private lanesById = new Map<string, Lane>();
  private initiativesById = new Map<string, Initiative>();
  private epicsById = new Map<string, Epic>();
  private featuresById = new Map<string, Feature>();
  /** Features scored and banded over the whole set; rebuilt when any feature page changes. */
  private scoredFeatures = new Map<string, IndexedFeature>();
  private artifactsById = new Map<string, Artifact>();
  private mockByCard = new Map<string, string>();
  private evidenceKeys = new Set<string>();
  private specFolders: string[] = [];
  private openById = new Map<string, Question[]>();
  /** cards.json's own counter, what `/api/cards` reports as `version`. */
  cardsFileVersion = 0;
  private cardsFileStamp = '';
  // Titles and tags are ranked by MiniSearch; bodies are scanned as lowercased text. A posting
  // list over 20k bodies costs hundreds of MB and seconds to build, a scan costs tens of ms.
  private pageSearch = new MiniSearch<{ id: string; title: string; tags: string }>({ fields: ['title', 'tags'], searchOptions: SEARCH });
  private bodyById = new Map<string, string>();
  private cardSearch = new MiniSearch<{ id: string; title: string; story: string }>({ fields: ['id', 'title', 'story'], searchOptions: SEARCH });
  private inboxCache: { key: string; needsYou: InboxCard[]; questions: InboxCard[]; shipped: InboxCard[]; perLane: LaneNumbers[]; shippedThisWeek: number } | undefined;
  private listeners = new Set<(diffs: Diff[]) => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private stopEvents: (() => void) | undefined;
  private closed = false;

  constructor(readonly projectDir: string, readonly store: Store, private readonly ownsStore = false) {
    this.ready = this.build();
    this.follow();
  }

  /** Called with every batch of diffs the index applies. Returns the unsubscribe. */
  subscribe(fn: (diffs: Diff[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Applies one store change to the one collection and file it names. Patches run one at a time, in order. */
  patch(change: Pick<Change, 'repo' | 'id' | 'path'>): Promise<Diff[]> {
    const run = this.queue.then(() => this.apply(change)).catch(() => [] as Diff[]);
    this.queue = run;
    return run;
  }

  cards = {
    list: async (filter: CardFilter = {}, cursor?: string, limit = 200): Promise<Paged<IndexedCard>> => {
      await this.fresh();
      return page(this.filterCards(filter), cursor, limit);
    },
    get: async (id: string): Promise<IndexedCard | undefined> => {
      await this.fresh();
      return this.cardsById.get(id) ?? [...this.cardsById.values()].find(c => c.id.toLowerCase() === id.toLowerCase());
    },
    events: async (id: string): Promise<CardEvent[]> => {
      await this.fresh();
      return this.rawById.get((await this.cards.get(id))?.id ?? id)?.events ?? [];
    },
    search: async (q: string): Promise<IndexedCard[]> => {
      await this.fresh();
      return this.filterCards({ q });
    },
    /** Every card in board order, events included: for the inbox and stats, which read the whole log. */
    all: async (): Promise<Card[]> => {
      await this.fresh();
      return [...this.cardsById.values()].map(c => this.withEvents(c));
    },
    /**
     * The three inbox lists and the per-lane numbers, from the index alone. The lists are
     * computed once per index version and paged per call; only parked cards read their events.
     */
    inbox: async (q: InboxQuery = {}, now: Date = new Date()): Promise<InboxPayload> => {
      await this.fresh();
      const limit = Math.min(Math.max(q.limit ?? 50, 1), 5000);
      const lanes = [...this.lanesById.values()];
      const since = q.shippedSince ?? '';
      const narrow: CardFilter = {};
      for (const k of ['initiative', 'epic', 'feature', 'band'] as const) {
        const values = q[k]?.split(',').map(v => v.trim()).filter(Boolean);
        if (values?.length) narrow[k] = values;
      }
      const sort = q.sort ?? 'score';
      const key = `${this.versions.cards}|${this.versions.lanes}|${this.versions.features}|${since}|${JSON.stringify(narrow)}|${q.needsMe ?? ''}|${sort}`;
      if (!this.inboxCache || this.inboxCache.key !== key) {
        const order = <T extends InboxCard>(items: T[]) => (sort === 'score' ? byScoreThenOldest(items) : [...items].sort((a, b) => ((a.since ?? a.updatedAt) < (b.since ?? b.updatedAt) ? -1 : 1)));
        const mine = (c: IndexedCard) => !q.needsMe || this.needsRole(c, q.needsMe);
        const needsYou: InboxCard[] = order(
          this.filterCards({ ...narrow, gate: 'waiting' }).filter(mine).map(c => {
            const { id: _id, title: _t, lane: _l, stage: _s, gate: _g, awaiting: _a, mock: _m, source: _src, ...rest } = needsYouItem(this.withEvents(c), lanes, this.mockByCard.get(c.id), { band: c.band, ...(c.score === undefined ? {} : { score: c.score }), ...(c.feature ? { feature: c.feature } : {}) });
            return { ...c, ...rest };
          }),
        );
        const questions: InboxCard[] = order(this.filterCards({ ...narrow, questions: 'open' }).filter(c => c.stage !== DONE && c.stage !== DROPPED).map(c => ({ ...c, first: this.openById.get(c.id)?.[0]?.question })));
        const shipped: InboxCard[] = order(this.filterCards({ ...narrow, shippedSince: since }));
        const all = [...this.cardsById.values()].map(c => this.withEvents(c));
        this.inboxCache = { key, needsYou, questions, shipped, perLane: laneNumbers(all, lanes), shippedThisWeek: shippedWithin(all, now) };
      }
      const { needsYou, questions, shipped, perLane, shippedThisWeek } = this.inboxCache;
      const paged = (items: InboxCard[], cursor: string | undefined): Paged2<InboxCard> => {
        const { items: cards, total, nextCursor } = page(items, cursor, limit);
        return { cards, total, nextCursor };
      };
      return {
        summary: inboxSummary(needsYou as { since: string }[], shippedThisWeek, now),
        needsYou: paged(needsYou, q.cursor),
        questions: paged(questions, q.questionsCursor),
        shipped: paged(shipped, q.shippedCursor),
        perLane,
      };
    },
    facets: async (): Promise<Facets> => {
      await this.fresh();
      const out = {} as Facets;
      for (const key of CARD_FILTERS) {
        const counts = new Map<string, number>();
        for (const c of this.cardsById.values()) {
          const v = c[key];
          if (v !== undefined && v !== '') counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
        }
        out[key] = [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
      }
      return out;
    },
  };

  pages = {
    list: async (filter: PageFilter = {}, cursor?: string, limit = 200): Promise<Paged<IndexedPage & { excerpt?: string }>> => {
      await this.ready;
      const q = filter.q?.trim();
      let items: IndexedPage[] = q ? this.searchPages(q) : this.sortedPages();
      if (filter.folder !== undefined) items = items.filter(p => p.folder === filter.folder);
      const out = page(items, cursor, limit);
      if (!q) return out;
      const withExcerpts = await Promise.all(out.items.map(async p => ({ ...p, excerpt: excerpt((await this.store.pages.get(p.id))?.body ?? '', q) })));
      return { ...out, items: withExcerpts };
    },
    /** The page with its body, from the store. */
    get: async (id: string): Promise<WikiPage | undefined> => {
      await this.ready;
      return this.store.pages.get(id);
    },
    summary: async (id: string): Promise<IndexedPage | undefined> => {
      await this.ready;
      return this.pagesById.get(id);
    },
    search: async (q: string): Promise<IndexedPage[]> => {
      await this.ready;
      return this.searchPages(q);
    },
  };

  lanes = {
    list: async (): Promise<Lane[]> => {
      await this.ready;
      return [...this.lanesById.values()];
    },
    get: async (id: string): Promise<Lane | undefined> => {
      await this.ready;
      return this.lanesById.get(id);
    },
  };

  initiatives = {
    /** Each with `score`: the sum of its features' scores. */
    list: async (): Promise<IndexedInitiative[]> => {
      await this.ready;
      return [...this.initiativesById.values()].map(i => this.scoreInitiative(i));
    },
    get: async (id: string): Promise<IndexedInitiative | undefined> => {
      await this.ready;
      const found = this.initiativesById.get(id);
      return found && this.scoreInitiative(found);
    },
    /** initiative → epics → features → stories. An epic appears when any of its features names the initiative. */
    tree: async (id: string): Promise<InitiativeTree | undefined> => {
      await this.fresh();
      const initiative = this.initiativesById.get(id);
      if (!initiative) return undefined;
      const mine = [...this.scoredFeatures.values()].filter(f => f.initiative === id);
      const epicIds = [...new Set(mine.flatMap(f => (f.epic ? [f.epic] : [])))];
      const epics = epicIds.map(e => this.epicNode(e, mine.filter(f => f.epic === e))).filter((e): e is EpicNode => !!e).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
      const loose = byScore(mine.filter(f => !f.epic || !this.epicsById.has(f.epic)).map(f => this.featureNode(f)));
      return { ...this.scoreInitiative(initiative), epics, features: loose };
    },
  };

  epics = {
    /** Each with `score`: the sum of every feature naming it, whichever initiative they serve. */
    list: async (): Promise<IndexedEpic[]> => {
      await this.ready;
      return [...this.epicsById.values()].map(e => this.scoreEpic(e));
    },
    get: async (id: string): Promise<IndexedEpic | undefined> => {
      await this.ready;
      const found = this.epicsById.get(id);
      return found && this.scoreEpic(found);
    },
    tree: async (id: string): Promise<EpicNode | undefined> => {
      await this.fresh();
      return this.epicNode(id, [...this.scoredFeatures.values()].filter(f => f.epic === id));
    },
  };

  features = {
    list: async (): Promise<IndexedFeature[]> => {
      await this.ready;
      return [...this.scoredFeatures.values()];
    },
    get: async (id: string): Promise<IndexedFeature | undefined> => {
      await this.ready;
      return this.scoredFeatures.get(id);
    },
    /** The feature with its stories. */
    detail: async (id: string): Promise<FeatureNode | undefined> => {
      await this.fresh();
      const found = this.scoredFeatures.get(id);
      return found && this.featureNode(found);
    },
  };

  private scoreInitiative(i: Initiative): IndexedInitiative {
    return { ...i, score: sumScores([...this.scoredFeatures.values()].filter(f => f.initiative === i.id)) };
  }

  private scoreEpic(e: Epic): IndexedEpic {
    return { ...e, score: sumScores([...this.scoredFeatures.values()].filter(f => f.epic === e.id)) };
  }

  private epicNode(id: string, features: IndexedFeature[]): EpicNode | undefined {
    const epic = this.epicsById.get(id);
    if (!epic) return undefined;
    const nodes = byScore(features.map(f => this.featureNode(f)));
    return { ...epic, score: sumScores(nodes), features: nodes };
  }

  private featureNode(f: IndexedFeature): FeatureNode {
    const stories: StoryRow[] = [...this.cardsById.values()]
      .filter(c => c.feature === f.id && c.stage !== DROPPED)
      .map(({ id, title, stage, gate, awaiting, band, score }) => ({ id, title, stage, ...(gate ? { gate } : {}), ...(awaiting ? { awaiting } : {}), band, ...(score === undefined ? {} : { score }) }));
    return { ...f, stories, done: stories.filter(s => s.stage === DONE).length, total: stories.length };
  }

  /** Parked at a gate `role` approves, or carrying an open question. */
  private needsRole(c: IndexedCard, role: Role): boolean {
    return (!!c.gate && c.awaiting === role) || c.openQuestions > 0;
  }

  artifacts = {
    list: async (): Promise<Artifact[]> => {
      await this.ready;
      return [...this.artifactsById.values()];
    },
  };

  /** The card's mock path under docs/mocks, for the inbox. */
  mockOf(id: string): string | undefined {
    return this.mockByCard.get(id);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.stopEvents?.();
    this.listeners.clear();
    indexes.delete(resolve(this.projectDir));
    if (this.ownsStore) await this.store.close();
  }

  // ---- build ----

  private async build(): Promise<void> {
    const t0 = performance.now();
    this.loadMocks();
    this.loadEvidence();
    for (const lane of await this.store.lanes.list()) this.lanesById.set(lane.id, lane);
    for (const bet of await this.store.initiatives.list()) this.initiativesById.set(bet.id, bet);
    for (const epic of await this.store.epics.list()) this.epicsById.set(epic.id, epic);
    for (const feature of await this.store.features.list()) this.featuresById.set(feature.id, feature);
    this.rescore();
    this.loadCards(await this.readCards());
    const pages = await this.store.pages.list();
    for (const p of pages) {
      this.pagesById.set(p.id, this.summarise(p));
      this.bodyById.set(p.id, scannable(p.body));
    }
    this.pageSearch.addAll(pages.map(searchDoc));
    for (const a of await this.store.artifacts.list()) this.artifactsById.set(a.id, a);
    this.buildMs = Math.round(performance.now() - t0);
  }

  private follow(): void {
    const events = this.store.events();
    const iterator = events[Symbol.asyncIterator]();
    this.stopEvents = () => void iterator.return?.();
    void (async () => {
      for (;;) {
        const next = await iterator.next().catch(() => ({ done: true, value: undefined }) as IteratorResult<Change>);
        if (next.done || this.closed) return;
        await this.patch(next.value);
      }
    })();
  }

  /** cards.json is replaced whole by every engine write; a one-stat check keeps a read right even before the watcher fires. */
  private async fresh(): Promise<void> {
    await this.ready;
    if (!(this.store instanceof FileDriver)) return;
    if (this.cardsStamp() !== this.cardsFileStamp) await this.patch({ repo: 'cards' });
  }

  private cardsStamp(): string {
    const file = join(this.projectDir, CARDS_PATH);
    try {
      const s = statSync(file);
      return `${s.mtimeMs}:${s.size}:${s.ino}`;
    } catch {
      return 'none';
    }
  }

  private loadMocks(): void {
    this.mockByCard.clear();
    const root = join(this.projectDir, MOCKS_DIR);
    if (!existsSync(root)) return;
    const dirs = (p: string) => readdirSync(p, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
    for (const project of dirs(root)) {
      for (const topic of dirs(join(root, project))) {
        for (const f of readdirSync(join(root, project, topic)).sort()) {
          if (!f.endsWith('.html')) continue;
          const id = basename(f, '.html');
          if (!this.mockByCard.has(id)) this.mockByCard.set(id, `${MOCKS_DIR}/${project}/${topic}/${f}`);
        }
      }
    }
  }

  private loadEvidence(): void {
    this.evidenceKeys.clear();
    const root = join(this.projectDir, EVIDENCE_DIR);
    if (!existsSync(root)) return;
    for (const d of readdirSync(root, { withFileTypes: true })) if (d.isDirectory()) this.evidenceKeys.add(d.name);
  }

  /** One parse of cards.json for the file driver, which also carries the file's counter; any other store lists. */
  private async readCards(): Promise<Card[]> {
    if (!(this.store instanceof FileDriver)) return this.store.cards.list();
    const file = readCards(this.projectDir);
    this.cardsFileVersion = file.version;
    return file.cards;
  }

  private loadCards(cards: Card[]): Diff[] {
    this.cardsFileStamp = this.cardsStamp();
    this.loadSpecFolders();
    const diffs: Diff[] = [];
    const seen = new Set<string>();
    const next = new Map<string, IndexedCard>();
    for (const card of cards) {
      seen.add(card.id);
      const version = sha1(JSON.stringify(card));
      const have = this.cardsById.get(card.id);
      if (have && have.version === version) {
        const derived = this.derive(card);
        const { mock: _m, specDir: _s, score: _sc, ...kept } = have;
        const indexed = { ...kept, ...derived };
        next.set(card.id, indexed);
        if (JSON.stringify(derived) !== JSON.stringify(this.derivedOf(have))) diffs.push({ repo: 'cards', id: card.id, version, kind: 'put' });
        continue;
      }
      const { events: _events, ...rest } = card;
      const indexed: IndexedCard = { ...rest, ...this.derive(card), version };
      next.set(card.id, indexed);
      this.rawById.set(card.id, card);
      this.indexCard(card);
      diffs.push({ repo: 'cards', id: card.id, version, kind: 'put' });
    }
    for (const id of this.cardsById.keys()) {
      if (seen.has(id)) continue;
      this.rawById.delete(id);
      this.openById.delete(id);
      if (this.cardSearch.has(id)) this.cardSearch.discard(id);
      diffs.push({ repo: 'cards', id, version: '', kind: 'remove' });
    }
    this.cardsById = next;
    return diffs;
  }

  private indexCard(card: Card): void {
    if (this.cardSearch.has(card.id)) this.cardSearch.discard(card.id);
    const story = [card.story?.as, card.story?.can, card.story?.so, card.description, card.feature, card.epic].filter(Boolean).join(' ');
    this.cardSearch.add({ id: card.id, title: card.title, story });
  }

  private rescore(): void {
    this.scoredFeatures = featureMap([...this.featuresById.values()]);
  }

  private derivedOf(c: IndexedCard) {
    return { openQuestions: c.openQuestions, mock: c.mock, specDir: c.specDir, hasEvidence: c.hasEvidence, band: c.band, score: c.score, initiative: c.initiative, epic: c.epic, feature: c.feature };
  }

  private derive(card: Card): { openQuestions: number; mock?: string; specDir?: string; hasEvidence: boolean } & CardChain {
    const specDir = this.specDirOf(card);
    const mock = this.mockByCard.get(card.id);
    const key = cardKey(card);
    const hasEvidence = this.evidenceKeys.has(key) || this.evidenceKeys.has(card.id.toLowerCase());
    return { openQuestions: this.openOf(card.id, specDir).length, ...(mock ? { mock: mockHref(mock) } : {}), ...(specDir ? { specDir } : {}), hasEvidence, ...chainOf(card, this.scoredFeatures) };
  }

  /** `resolveSpecDir` over a listing taken once per reload: it re-reads cards.json per call, which 5k cards cannot afford. */
  private specDirOf(card: Card): string | undefined {
    if (card.spec) return card.spec;
    const key = cardKey(card);
    if (this.specFolders.includes(key)) return `${SPECS_DIR}/${key}`;
    const found = this.specFolders.filter(d => d.startsWith(`${key}-`));
    return found.length === 1 ? `${SPECS_DIR}/${found[0]}` : undefined;
  }

  private loadSpecFolders(): void {
    const dir = join(this.projectDir, SPECS_DIR);
    this.specFolders = existsSync(dir) ? readdirSync(dir) : [];
  }

  private openOf(cardId: string, specDir: string | undefined): Question[] {
    const file = specDir && join(this.projectDir, specDir, 'interview.md');
    const open = file && existsSync(file) ? parseQuestions(readFileSync(file, 'utf-8')).filter(q => !q.answer) : [];
    this.openById.set(cardId, open);
    return open;
  }

  /** The card's questions without an answer, as the index last read its interview.md. */
  openQuestions(cardId: string): Question[] {
    return this.openById.get(cardId) ?? [];
  }

  /** The card as cards.json holds it, events included. */
  private withEvents(c: IndexedCard): Card {
    return this.rawById.get(c.id) ?? { ...c, events: [] };
  }

  private summarise(p: WikiPage): IndexedPage {
    let updated = '';
    try {
      updated = statSync(join(this.projectDir, p.id)).mtime.toISOString();
    } catch {
      // A page from a store that is not on disk has no mtime.
    }
    // Title and frontmatter strings come out of the parser as slices of the whole file text, which
    // they would keep alive; the round trip copies them flat.
    const { title, frontmatter } = JSON.parse(JSON.stringify({ title: p.title, frontmatter: p.frontmatter })) as { title: string; frontmatter: Record<string, unknown> };
    return { id: p.id, folder: p.folder, title, frontmatter, updated, hash: sha1(p.body), version: String(p.version ?? sha1(p.body)) };
  }

  private sortedPages(): IndexedPage[] {
    this.pageOrder ??= [...this.pagesById.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return this.pageOrder;
  }

  /** Title and tag hits first, ranked; then every page whose body holds all the terms, newest first. */
  private searchPages(q: string): IndexedPage[] {
    const terms = q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (!terms.length) return [];
    const out: IndexedPage[] = [];
    const seen = new Set<string>();
    for (const r of this.pageSearch.search(q)) {
      const page = this.pagesById.get(String(r.id));
      if (page && !seen.has(page.id)) {
        seen.add(page.id);
        out.push(page);
      }
    }
    const inBody: IndexedPage[] = [];
    for (const [id, body] of this.bodyById) {
      if (seen.has(id) || !terms.every(t => body.includes(t))) continue;
      const page = this.pagesById.get(id);
      if (page) inBody.push(page);
    }
    inBody.sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0));
    return [...out, ...inBody];
  }

  private filterCards(filter: CardFilter): IndexedCard[] {
    const q = filter.q?.trim();
    let items = q
      ? this.cardSearch.search(q).map(r => this.cardsById.get(String(r.id))).filter((c): c is IndexedCard => !!c)
      : [...this.cardsById.values()];
    for (const key of CARD_FILTERS) {
      const wanted = filter[key];
      if (wanted?.length) items = items.filter(c => wanted.includes(String(c[key] ?? '')));
    }
    if (filter.gate === 'waiting') items = items.filter(c => !!c.gate);
    if (filter.stuck) items = items.filter(c => c.gate === 'stuck');
    if (filter.questions === 'open') items = items.filter(c => c.openQuestions > 0);
    if (filter.shippedSince !== undefined) items = items.filter(c => c.stage === DONE && c.updatedAt > filter.shippedSince!);
    if (filter.needsMe) items = items.filter(c => this.needsRole(c, filter.needsMe!));
    if (filter.sort === 'score') items = byScoreThenOldest(items);
    return items;
  }

  // ---- patch ----

  private async apply(change: Pick<Change, 'repo' | 'id' | 'path'>): Promise<Diff[]> {
    if (this.closed) return [];
    await this.ready;
    const diffs: Diff[] = [];
    switch (change.repo) {
      case 'cards':
        diffs.push(...this.loadCards(await this.readCards()));
        if (diffs.length) diffs.push(...(await this.reloadArtifacts()));
        break;
      case 'questions':
        this.loadSpecFolders();
        diffs.push(...this.rederive(change.id ? [change.id.split('#')[0]] : change.path ? this.cardsUnderSpec(dirname(change.path)) : [...this.cardsById.keys()]));
        break;
      case 'evidence':
        this.loadEvidence();
        diffs.push(...this.rederive(change.path ? this.cardsWithKey(change.path.split('/')[1]) : [...this.cardsById.keys()]));
        break;
      case 'artifacts':
        this.loadMocks();
        diffs.push(...(await this.reloadArtifacts()));
        diffs.push(...this.rederive(change.path?.startsWith(`${MOCKS_DIR}/`) ? [basename(change.path, '.html')] : [...this.cardsById.keys()]));
        break;
      case 'lanes': {
        const id = change.id ?? (change.path ? basename(change.path).replace(/\.ya?ml$/, '') : undefined);
        diffs.push(...(id ? await this.reloadOne('lanes', id, () => this.store.lanes.get(id), this.lanesById, l => l.version) : await this.reloadAll('lanes', () => this.store.lanes.list(), this.lanesById, l => l.version)));
        break;
      }
      case 'initiatives': {
        const id = change.id ?? (change.path ? basename(change.path, '.md') : undefined);
        diffs.push(...(id ? await this.reloadOne('initiatives', id, () => this.store.initiatives.get(id), this.initiativesById, b => b.version ?? '') : await this.reloadAll('initiatives', () => this.store.initiatives.list(), this.initiativesById, b => b.version ?? '')));
        // The initiative's file is a wiki page as well.
        if (change.path) diffs.push(...(await this.reloadPage(change.path)));
        break;
      }
      case 'epics':
      case 'features': {
        const repo = change.repo;
        const into = repo === 'epics' ? this.epicsById : this.featuresById;
        const read = () => (repo === 'epics' ? this.store.epics.list() : this.store.features.list());
        diffs.push(...(await this.reloadAll(repo, read as () => Promise<(Epic | Feature)[]>, into as Map<string, Epic | Feature>, p => p.version ?? '')));
        if (diffs.length) {
          this.rescore();
          // Bands are quartiles over every feature, so one page moving can move every card's band.
          diffs.push(...this.rederive([...this.cardsById.keys()]));
        }
        // The page is a wiki page as well.
        if (change.path) diffs.push(...(await this.reloadPage(change.path)));
        break;
      }
      case 'pages': {
        const id = change.id ?? change.path;
        if (id && id.endsWith('.md') && basename(id) !== 'INDEX.md') diffs.push(...(await this.reloadPage(id)));
        break;
      }
      default:
        break;
    }
    if (diffs.length) {
      for (const d of diffs) this.versions[d.repo]++;
      for (const l of this.listeners) l(diffs);
    }
    return diffs;
  }

  private cardsUnderSpec(specDir: string): string[] {
    return [...this.cardsById.values()].filter(c => c.specDir === specDir).map(c => c.id);
  }

  private cardsWithKey(nnn: string): string[] {
    return [...this.cardsById.values()].filter(c => cardKey(c) === nnn || c.id.toLowerCase() === nnn.toLowerCase()).map(c => c.id);
  }

  /** Recomputes a card's derived fields; a put diff only when one of them changed. */
  private rederive(ids: string[]): Diff[] {
    const diffs: Diff[] = [];
    for (const id of ids) {
      const have = this.cardsById.get(id);
      if (!have) continue;
      const derived = this.derive(this.withEvents(have));
      if (JSON.stringify(derived) === JSON.stringify(this.derivedOf(have))) continue;
      const { mock: _m, specDir: _s, score: _sc, initiative: _i, epic: _e, feature: _f, ...rest } = have;
      this.cardsById.set(id, { ...rest, ...derived });
      diffs.push({ repo: 'cards', id, version: have.version, kind: 'put' });
    }
    return diffs;
  }

  private async reloadArtifacts(): Promise<Diff[]> {
    return this.reloadAll('artifacts', () => this.store.artifacts.list(), this.artifactsById, a => a.version ?? '');
  }

  private async reloadOne<T extends { id: string }>(repo: IndexedRepo, id: string, read: () => Promise<T | undefined>, into: Map<string, T>, versionOf: (t: T) => string | number): Promise<Diff[]> {
    let item: T | undefined;
    try {
      item = await read();
    } catch (e) {
      if (!(e instanceof RefusalError)) throw e;
    }
    const have = into.get(id);
    if (!item) {
      if (!have) return [];
      into.delete(id);
      return [{ repo, id, version: '', kind: 'remove' }];
    }
    if (have && versionOf(have) === versionOf(item)) return [];
    into.set(id, item);
    return [{ repo, id, version: versionOf(item), kind: 'put' }];
  }

  private async reloadAll<T extends { id: string }>(repo: IndexedRepo, read: () => Promise<T[]>, into: Map<string, T>, versionOf: (t: T) => string | number): Promise<Diff[]> {
    const diffs: Diff[] = [];
    const seen = new Set<string>();
    for (const item of await read()) {
      seen.add(item.id);
      const have = into.get(item.id);
      if (have && versionOf(have) === versionOf(item)) continue;
      into.set(item.id, item);
      diffs.push({ repo, id: item.id, version: versionOf(item), kind: 'put' });
    }
    for (const id of [...into.keys()]) {
      if (seen.has(id)) continue;
      into.delete(id);
      diffs.push({ repo, id, version: '', kind: 'remove' });
    }
    return diffs;
  }

  private async reloadPage(id: string): Promise<Diff[]> {
    let page: WikiPage | undefined;
    try {
      page = await this.store.pages.get(id);
    } catch (e) {
      if (!(e instanceof RefusalError)) throw e;
    }
    const have = this.pagesById.get(id);
    if (!page) {
      if (!have) return [];
      this.pagesById.delete(id);
      this.bodyById.delete(id);
      if (this.pageSearch.has(id)) this.pageSearch.discard(id);
      this.pageOrder = null;
      return [{ repo: 'pages', id, version: '', kind: 'remove' }];
    }
    const summary = this.summarise(page);
    if (have && have.version === summary.version) return [];
    this.pagesById.set(id, summary);
    this.bodyById.set(id, scannable(page.body));
    if (this.pageSearch.has(id)) this.pageSearch.discard(id);
    this.pageSearch.add(searchDoc(page));
    this.pageOrder = null;
    return [{ repo: 'pages', id, version: summary.version, kind: 'put' }];
  }
}

const indexes = new Map<string, ProjectIndex>();

/** One index per project per process. A store given on the first call is the one it follows. */
export function getIndex(projectDir: string, store?: Store): ProjectIndex {
  const key = resolve(projectDir);
  let index = indexes.get(key);
  if (!index) {
    index = new ProjectIndex(projectDir, store ?? openStore(projectDir), !store);
    indexes.set(key, index);
  }
  return index;
}

/** Drops the project's index, closing its watcher: for tests that rebuild a folder, and for `codeloop serve` shutdown. */
export async function closeIndex(projectDir: string): Promise<void> {
  await indexes.get(resolve(projectDir))?.close();
}

