// The SDK's types under the names the screens use. Nothing is defined twice: a list row is the
// indexed card with its derived fields optional, since a drawer opens from a list's copy before
// GET /api/cards/:id answers with the event log.
import type {
  AdoptCounts,
  AdvanceReport,
  ProjectDetection,
  RunView,
  SetupStatus,
  SplitResult,
  StageOutput,
  Artifact as SdkArtifact,
  Card as SdkCard,
  CardShow as SdkCardShow,
  IndexedFeature,
  CardEvent,
  CardFilterKey,
  CardsPayload as SdkCardsPayload,
  Band as SdkBand,
  CardsQuery,
  EpicNode,
  FeatureNode,
  Config,
  EvidenceDetail,
  Facets as SdkFacets,
  InboxCard as SdkInboxCard,
  InboxQuery,
  IndexedCard,
  IndexedInitiative,
  InitiativeTree,
  IndexedPage,
  Initiative as SdkInitiative,
  Lane as SdkLane,
  LaneNumbers as SdkLaneNumbers,
  LiveEvent,
  Paged2,
  PagesQuery,
  PageWrite,
  Question,
  Rice,
  Stage,
  StoryRow,
  Stats,
  Task,
  WikiPage,
} from '@protoboxai/codeloop/sdk';

export { CARD_FACETS } from '@protoboxai/codeloop/sdk';
export type { CardEvent, Config, LiveEvent, PagesQuery, PageWrite, Question, Stats, Task };
export type { CardsQuery, InboxQuery };
export type CardFacet = CardFilterKey;

export type Story = NonNullable<SdkCard['story']>;

/** A card as a screen sees it: a list row (no events) or the detail copy (with them). */
export type Card = Pick<IndexedCard, 'id' | 'title' | 'lane' | 'stage'> & Partial<Omit<IndexedCard, 'id' | 'title' | 'lane' | 'stage'>> & { events?: CardEvent[] };

/** RICE band, P1 highest; the API bands every card from its feature's score. */
export type Band = SdkBand;
export const BANDS: readonly Band[] = ['P1', 'P2', 'P3', 'P4'];
export type { Rice };

/** The board's filter bar, in the order it shows them; all served as facets by `GET /api/cards?facets=1`. */
export const BOARD_FACETS = ['initiative', 'epic', 'feature', 'band', 'persona', 'size'] as const;
export type BoardFacet = (typeof BOARD_FACETS)[number];

/** `GET /api/initiatives`: the wiki page plus its score (the sum of its features'). */
export type InitiativeRow = IndexedInitiative;
/** The chain down to stories, as the tree routes serve it. */
export type TreeStory = StoryRow;
export type TreeFeature = FeatureNode;
export type TreeEpic = EpicNode;
export type { InitiativeTree };

export type LaneStage = Pick<Stage, 'id'> & Partial<Omit<Stage, 'id'>>;
/** `/api/lanes` serves the whole lane; `/api/cards` carries a trimmed copy, and older boards named the metric as a string. */
export type Lane = Pick<SdkLane, 'id'> & Partial<Omit<SdkLane, 'id' | 'stages' | 'metric'>> & { stages: LaneStage[]; metric?: SdkLane['metric'] | string };

export type FacetCount = { value: string; count: number };
export type Facets = Partial<SdkFacets>;

export type CardsPayload = Omit<SdkCardsPayload, 'cards' | 'lanes' | 'facets'> & { cards: Card[]; lanes?: Lane[]; facets?: Facets };
/** One page of GET /api/cards. `next` is the cursor for the following page; absent on the last one. */
export type CardsPage = Omit<CardsPayload, 'version' | 'owner' | 'nextCursor' | 'total' | 'inbox'> & Partial<Pick<CardsPayload, 'version' | 'owner' | 'total' | 'inbox'>> & { next?: string };

/** A card as the inbox lists it: the list copy plus what a parked card needs read. */
export type InboxCard = Card & Partial<Pick<SdkInboxCard, 'read' | 'last_check' | 'since' | 'first' | 'last_event'>>;
export type InboxList = Paged2<InboxCard>;
export type LaneNumbers = Pick<SdkLaneNumbers, 'lane' | 'active' | 'parked' | 'done'> & Partial<SdkLaneNumbers>;
/** GET /api/inbox: three lists capped per call and the per-lane numbers. */
export interface InboxPayload {
  summary?: string;
  needsYou: InboxList;
  questions: InboxList;
  shipped: InboxList;
  perLane: LaneNumbers[];
}

/** One page of GET /api/pages. */
export interface PagesPage {
  pages: PageSummary[];
  next?: string;
  total?: number;
}

export type Initiative = SdkInitiative & { body?: string; horizon?: string };

export type PageSummary = Pick<IndexedPage, 'id' | 'title'> & Partial<Omit<IndexedPage, 'id' | 'title' | 'version'>> & { version?: WikiPage['version']; excerpt?: string };
export type Page = PageSummary & { body: string };

/** A file as the card screen lists it; a card's own `evidence` names files by path alone, so the rest is optional. */
export type EvidenceFile = Pick<EvidenceDetail['files'][number], 'name'> & Partial<EvidenceDetail['files'][number]>;
export type Evidence = EvidenceDetail;

/** `/api/cards/:id/full` with the spec text and the evidence files lifted out, the way the card screen reads them. */
export interface CardFull {
  card: Card;
  spec?: string;
  tasks?: Task[];
  questions?: Question[];
  evidence?: EvidenceFile[];
  mock?: string | null;
  page?: Page | null;
}

export type Artifact = SdkArtifact & { href?: string; url?: string };

/** `GET /api/cards/:id/show`: the card and its stage brief with the paths and the check command substituted. */
export type CardShow = SdkCardShow;
export type StageBrief = NonNullable<CardShow['brief']>;
export type { AdvanceReport };
/** `GET /api/features`: a feature with its chain, score and band; `release` is the roadmap column. */
export type FeatureRow = IndexedFeature & { release?: string };

/** `GET /api/runs/:runId`: one stage run on a card; `log` is the last 64 kB. */
export type Run = RunView;
/** `GET /api/cards/:id/output`: the current stage's output file, `text` null before the stage writes it. */
export type CardOutput = StageOutput;
export type { SplitResult, SetupStatus };
/** `POST /api/setup/detect`: what `codeloop init` would detect. */
export type SetupDetect = ProjectDetection;
/** `POST /api/setup/adopt`: the skills index after the scan. */
export type SetupAdopt = AdoptCounts;
