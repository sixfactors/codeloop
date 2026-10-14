import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { DONE, DROPPED, inLane, PROPOSED, readCards, type Card, type CardEvent } from './cards.js';
import { clock } from './clock.js';
import { byScoreThenOldest, chainOf, featureMap, listFeatures, type Band } from './features.js';
import { loadLanes, substitute, type Lane } from './lane.js';
import { openQuestions } from './interview.js';
import { findMock } from './mock.js';
import { cloudCopies } from './wiki.js';
import { lastActivityAt } from './activity.js';
import { storyState } from './states.js';

export const INBOX_SEEN = '.codeloop/state/inbox-seen.json';

export interface Inbox {
  summary: string;
  /** Started work waiting on a person: stage gates and stuck. Proposals are in `backlog`. */
  needs_you: { id: string; title: string; lane: string; stage: string; gate: string; awaiting?: string; band: Band; score?: number; feature?: string; read?: string; mock?: string; source?: string; last_check: string; since: string; last_event?: CardEvent }[];
  /** In a lane, not at a gate, with at least one failed check on the current stage. */
  failing: { id: string; title: string; lane: string; stage: string; retries: number; last_check: string; since: string }[];
  /** Proposals waiting to be promoted or dropped: a count and the oldest title, not every row. */
  backlog: { count: number; oldest?: { id: string; title: string; since: string } };
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

/** A check has failed on this stage and the card is not yet stuck: retries remain, no gate. */
/**
 * Failing by the same rule as the board and the monitor (src/lib/states.ts): two or more failed
 * checks and an hour with no activity, or an agent run that ended on a failed check. One failed
 * check while someone works is not failing. `lastActivity` gives the story's last activity time.
 */
export const isFailing = (c: Card, lastActivity: (id: string) => number | undefined = () => undefined, now = Date.now()) =>
  inLane(c) && !c.gate && storyState(c, 0, { now, lastActivityAt: lastActivity(c.id) })?.health === 'failing';

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
  /** When the story's last activity line was written; failing needs it (an hour quiet). */
  lastActivity?: (cardId: string) => number | undefined;
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
      lastActivity: id => lastActivityAt(projectDir, id),
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

export function inboxSummary(waiting: { since: string }[], shippedThisWeek: number, now: Date, extras: { failing?: number; backlog?: number } = {}): string {
  const day = 86_400_000;
  const oldest = waiting.length ? Math.floor((now.getTime() - Math.min(...waiting.map(w => new Date(w.since).getTime()))) / day) : 0;
  const parts = [
    `${shippedThisWeek} shipped this week`,
    `${waiting.length} waiting on you${waiting.length ? `, oldest ${oldest === 0 ? 'today' : `${oldest} day${oldest === 1 ? '' : 's'}`}` : ''}`,
  ];
  if (extras.failing) parts.push(`${extras.failing} failing`);
  if (extras.backlog) parts.push(`${extras.backlog} in backlog`);
  return parts.join(', ');
}

export const shippedWithin = (cards: Card[], now: Date, days = 7) => cards.filter(c => c.stage === DONE && now.getTime() - new Date(c.updatedAt).getTime() < days * 86_400_000).length;

/** Proposals waiting to be promoted or dropped, oldest first. */
export function backlogOf(cards: Card[]): Inbox['backlog'] {
  const proposed = cards
    .filter(c => c.stage === PROPOSED)
    .map(c => ({ id: c.id, title: c.title, since: c.events.filter(e => e.action === 'propose').at(-1)?.at ?? c.createdAt }))
    .sort((a, b) => (a.since < b.since ? -1 : a.since > b.since ? 1 : 0));
  return { count: proposed.length, ...(proposed[0] ? { oldest: proposed[0] } : {}) };
}

/** Cards whose current stage has failed at least once and are not yet stuck. */
export function failingOf(cards: Card[], lastActivity?: (id: string) => number | undefined, now = Date.now()): Inbox['failing'] {
  return cards
    .filter(c => isFailing(c, lastActivity, now))
    .map(c => {
      const fail = c.events.filter(e => e.action === 'fail' && e.stage === c.stage).at(-1);
      return {
        id: c.id,
        title: c.title,
        lane: c.lane,
        stage: c.stage,
        retries: c.retries[c.stage] ?? 0,
        last_check: fail?.note?.split('\n').at(-1) ?? 'failed',
        since: fail?.at ?? c.updatedAt,
      };
    })
    .sort((a, b) => (a.since < b.since ? -1 : a.since > b.since ? 1 : 0));
}

export function computeInbox({ cards, lanes, seen, cloudCopies: merges, mockOf, openOf, lastActivity, scoreOf = () => ({ band: 'P4' }), sort = 'score' }: InboxInput, now: Date = clock()): Inbox {
  // Proposals wait in the backlog; only started work at a gate or stuck counts as waiting on you.
  const parked = cards.filter(c => c.gate && c.stage !== PROPOSED).map(c => needsYouItem(c, lanes, mockOf(c.id), scoreOf(c)));
  const waiting = sort === 'score' ? byScoreThenOldest(parked) : [...parked].sort((a, b) => (a.since < b.since ? -1 : a.since > b.since ? 1 : 0));
  const failing = failingOf(cards, lastActivity, now.getTime());
  const backlog = backlogOf(cards);

  return {
    summary: inboxSummary(waiting, shippedWithin(cards, now), now, { failing: failing.length, backlog: backlog.count }),
    needs_you: waiting,
    failing,
    backlog,
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
