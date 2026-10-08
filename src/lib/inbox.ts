import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { DONE, DROPPED, inLane, PROPOSED, readCards, type Card, type CardEvent } from './cards.js';
import { clock } from './clock.js';
import { byScoreThenOldest, chainOf, featureMap, listFeatures, type Band } from './features.js';
import { loadLanes, substitute, type Lane } from './lane.js';
import { openQuestions } from './interview.js';
import { findMock } from './mock.js';
import { cloudCopies } from './wiki.js';

export const INBOX_SEEN = '.codeloop/state/inbox-seen.json';

export interface Inbox {
  summary: string;
  needs_you: { id: string; title: string; lane: string; stage: string; gate: string; awaiting?: string; band: Band; score?: number; feature?: string; read?: string; mock?: string; source?: string; last_check: string; since: string; last_event?: CardEvent }[];
  /** Wiki pages changed here and in the cloud: merge the cloud version into the local page, then delete it. */
  needs_merge: { path: string; cloud: string }[];
  /** Cards whose interview.md has a question without an answer. */
  questions: { id: string; title: string; lane: string; stage: string; open: number; first: string }[];
  shipped: { id: string; title: string; lane: string; finishedAt: string }[];
  numbers: {
    lane: string;
    metric?: string;
    target?: string;
    active: number;
    parked: number;
    done: number;
    human_turns_per_card: number | null;
    first_pass_rate: number | null;
  }[];
}

const firstPass = (c: Card) => !c.events.some(e => e.action === 'fail' || e.action === 'reject');

/** Everything the inbox is computed from, so a caller holding it in memory need not touch disk. */
export interface InboxInput {
  cards: Card[];
  lanes: Lane[];
  /** `inbox-seen.json`'s timestamp, or '' when never marked. */
  seen: string;
  cloudCopies: { path: string; cloud: string }[];
  /** The card's mock path under docs/mocks, when it has one. */
  mockOf: (cardId: string) => string | undefined;
  /** The card's questions without an answer. */
  openOf: (card: Card) => { question: string }[];
  /** The card's band and score from its feature; every card is P4 without one. */
  scoreOf?: (card: Card) => { band: Band; score?: number; feature?: string };
  /** `score` (the default): score descending, then oldest parked first. `age`: oldest parked first. */
  sort?: 'score' | 'age';
}

export function readInboxSeen(projectDir: string): string {
  const seenFile = join(projectDir, INBOX_SEEN);
  return existsSync(seenFile) ? JSON.parse(readFileSync(seenFile, 'utf-8')).at : '';
}

export function buildInbox(projectDir: string, now: Date = clock(), opts: { sort?: 'score' | 'age' } = {}): Inbox {
  const features = featureMap(listFeatures(projectDir));
  return computeInbox(
    {
      cards: readCards(projectDir).cards,
      lanes: loadLanes(projectDir),
      seen: readInboxSeen(projectDir),
      cloudCopies: cloudCopies(projectDir),
      mockOf: id => findMock(projectDir, id),
      openOf: card => openQuestions(projectDir, card),
      scoreOf: card => {
        const { band, score, feature } = chainOf(card, features);
        return { band, ...(score === undefined ? {} : { score }), ...(feature ? { feature } : {}) };
      },
      sort: opts.sort,
    },
    now,
  );
}

export type NeedsYouItem = Inbox['needs_you'][number];
export type LaneNumbers = Inbox['numbers'][number];

/** One parked card as the inbox lists it: what to read, what the last check said, and how long it has waited. */
export function needsYouItem(c: Card, lanes: Lane[], mock: string | undefined, scored: { band: Band; score?: number; feature?: string } = { band: 'P4' }): NeedsYouItem {
  const stage = lanes.find(l => l.id === c.lane)?.stages.find(s => s.id === c.stage);
  const parkedAt = c.events.filter(e => e.action === 'park' || e.action === 'stuck').at(-1);
  const last_check = c.stage === PROPOSED
    ? 'not started: a proposal'
    : c.gate === 'stuck'
    ? `failed: ${c.events.filter(e => e.action === 'stuck').at(-1)?.note?.split('\n').at(-1) ?? ''}`
    : stage?.gate?.outward ? 'not run yet (public step, approve first)' : 'passed';
  return {
    id: c.id, title: c.title, lane: c.lane, stage: c.stage, gate: c.gate!, awaiting: c.awaiting, ...scored,
    read: stage?.output ? substitute(stage.output, c) : undefined,
    ...(mock ? { mock } : {}),
    ...(c.source ? { source: c.source } : {}),
    last_check, since: parkedAt?.at ?? c.updatedAt, last_event: c.events.at(-1),
  };
}

/** Per lane: how many cards are active, parked and done, and what the done ones cost in human turns. */
export function laneNumbers(cards: Card[], lanes: Lane[]): LaneNumbers[] {
  const laneIds = [...new Set([...lanes.map(l => l.id), ...cards.map(c => c.lane)])];
  return laneIds.map(id => {
    const mine = cards.filter(c => c.lane === id);
    const done = mine.filter(c => c.stage === DONE);
    const lane = lanes.find(l => l.id === id);
    return {
      lane: id,
      metric: lane?.metric?.name,
      target: lane?.metric?.target,
      active: mine.filter(c => inLane(c) && !c.gate).length,
      parked: mine.filter(c => c.gate).length,
      done: done.length,
      human_turns_per_card: mine.length ? mine.reduce((n, c) => n + c.events.filter(e => e.human).length, 0) / mine.length : null,
      first_pass_rate: done.length ? done.filter(firstPass).length / done.length : null,
    };
  });
}

export function inboxSummary(waiting: { since: string }[], shippedThisWeek: number, now: Date): string {
  const day = 86_400_000;
  const oldest = waiting.length ? Math.floor((now.getTime() - Math.min(...waiting.map(w => new Date(w.since).getTime()))) / day) : 0;
  return `${shippedThisWeek} shipped this week, ${waiting.length} waiting on you${waiting.length ? `, oldest ${oldest === 0 ? 'today' : `${oldest} day${oldest === 1 ? '' : 's'}`}` : ''}`;
}

export const shippedWithin = (cards: Card[], now: Date, days = 7) => cards.filter(c => c.stage === DONE && now.getTime() - new Date(c.updatedAt).getTime() < days * 86_400_000).length;

export function computeInbox({ cards, lanes, seen, cloudCopies: merges, mockOf, openOf, scoreOf = () => ({ band: 'P4' }), sort = 'score' }: InboxInput, now: Date = clock()): Inbox {
  const parked = cards.filter(c => c.gate).map(c => needsYouItem(c, lanes, mockOf(c.id), scoreOf(c)));
  const waiting = sort === 'score' ? byScoreThenOldest(parked) : [...parked].sort((a, b) => (a.since < b.since ? -1 : a.since > b.since ? 1 : 0));

  return {
    summary: inboxSummary(waiting, shippedWithin(cards, now), now),
    needs_you: waiting,
    needs_merge: merges,
    questions: cards
      .filter(c => c.stage !== DONE && c.stage !== DROPPED)
      .map(c => ({ card: c, open: openOf(c) }))
      .filter(({ open }) => open.length)
      .map(({ card, open }) => ({ id: card.id, title: card.title, lane: card.lane, stage: card.stage, open: open.length, first: open[0].question })),
    shipped: cards
      .filter(c => c.stage === DONE && c.updatedAt > seen)
      .map(c => ({ id: c.id, title: c.title, lane: c.lane, finishedAt: c.updatedAt })),
    numbers: laneNumbers(cards, lanes),
  };
}

export function markInboxSeen(projectDir: string, now: Date = clock()): void {
  const file = join(projectDir, INBOX_SEEN);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ at: now.toISOString() }, null, 2) + '\n');
}
