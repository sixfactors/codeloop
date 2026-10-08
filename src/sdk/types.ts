/**
 * Every type the SDK's surface uses, from one place. Store and engine types are re-exported, not
 * copied, so a field added to a card reaches the CLI and the UI without a second definition. Only
 * `import type` here: this module is on the browser path and must pull in no node code.
 */
export type { Card, CardEvent, CardExtras, StoryFields, Size } from '../lib/cards.js';
export type { Artifact, CardRecord, Epic, Evidence, EvidenceKind, Feature, Initiative, Rice, WikiPage } from '../lib/store/schema.js';
export type { Band, CardChain, Scored } from '../lib/features.js';
export type { Gate, Lane, Stage } from '../lib/lane.js';
export type { Question } from '../lib/interview.js';
export type { CardFilter, CardFilterKey, Diff, EpicNode, Facets, FeatureNode, IndexedCard, IndexedEpic, IndexedFeature, IndexedInitiative, IndexedPage, InboxCard, InboxPayload, InitiativeTree, Paged, Paged2, StoryRow } from '../lib/index/index.js';
export type { Inbox, LaneNumbers } from '../lib/inbox.js';
export type { LaneMetric, Stats } from '../lib/stats.js';
export type { AdvanceResult, Outcome, Role } from '../lib/engine.js';
export type { StoryFlags } from '../lib/story.js';
export type { Task } from '../lib/spec.js';
export type {
  AdvanceReport,
  CardCreated,
  CardFull,
  CardListFilter,
  CardProposed,
  CardShow,
  CardsPayload,
  Config,
  DecisionReport,
  EpicInput,
  EvidenceDetail,
  FeatureInput,
  NewCardInput,
  PageWrite,
  ProposalInput,
  ScoredRecord,
  WikiEntry,
  RunRecord,
  RunView,
  StageOutput,
  SetupStatus,
  ProjectDetection,
  AdoptResult,
} from '../lib/services.js';

/** The counts `POST /api/setup/adopt` answers with; the entries themselves stay in the index file. */
export type AdoptCounts = Omit<AdoptResult, 'entries'>;

/** What `card split` returns: the parent, the siblings and a Next line per sibling. */
export interface SplitResult {
  from: Card;
  cards: Card[];
  hints: string[];
}

/** One item on a run's stream: a log line, then the final record. */
export type RunStreamItem = { line: string } | { end: RunRecord };

import type { Card } from '../lib/cards.js';
import type { CardFilter, CardFilterKey, Diff, IndexedPage, InboxQuery as IndexInboxQuery } from '../lib/index/index.js';
import type { AdoptResult, RunRecord } from '../lib/services.js';

/** The facet keys a card list can be narrowed by; the same list the index filters on. */
export const CARD_FACETS = ['lane', 'stage', 'initiative', 'epic', 'feature', 'band', 'persona', 'size'] as const satisfies readonly CardFilterKey[];

/** A card list query: the index filter plus the page size. `needsMe` is a flag; the transport supplies the role. */
export type CardsQuery = Omit<CardFilter, 'needsMe'> & { needsMe?: boolean; limit?: number };

/** The inbox query; `needsMe` is a flag here too. */
export type InboxQuery = Omit<IndexInboxQuery, 'needsMe'> & { needsMe?: boolean };

export interface PagesQuery {
  folder?: string;
  q?: string;
  limit?: number;
}

/** One page of the page list; a search hit carries an excerpt. */
export interface PagesPayload {
  pages: (IndexedPage & { excerpt?: string })[];
  nextCursor: string | null;
  total: number;
}

/** One message on the live stream. The first is `hello`; the rest name one entity by id and version. */
export type LiveEvent = { type: 'hello'; versions: Record<string, number | string> } | Diff;

/** `as`: owner | reviewer | agent for a write; unset, the transport decides (the local one from `CODELOOP_ROLE` and the terminal, the http one from the server's `--owner`). */
export type RoleOption = { as?: string };

/** The stages a card can hold outside its lane; the same strings the engine writes. */
export const DONE = 'done';
export const PROPOSED = 'proposed';
export const DROPPED = 'dropped';
