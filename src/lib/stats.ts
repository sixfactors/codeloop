import { DONE, PROPOSED, type Card } from './cards.js';
import type { Lane } from './lane.js';

/** A lane's `metric:` line computed from the cards when its name is one the engine can derive; `value` null is no-data. */
export interface LaneMetric {
  lane: string;
  name: string;
  source: string;
  target?: string;
  value: number | null;
}

export interface Stats {
  metrics: LaneMetric[];
  cards: number;
  done: number;
  human_turns_per_card: number | null;
  unattended_span_hours: number | null;
  cycle_time_hours: number | null;
  /** Mean hours from create to done over finished cards sized trivial; null when none finished. */
  trivial_cycle_time_hours: number | null;
  rework: number | null;
  stuck_rate: number | null;
  first_pass_rate_by_gate: Record<string, number>;
  /** Per story: agent starts before its first gate parked it, and at its build stage or later. */
  agent_starts: AgentStarts[];
  /** The mean of each over the stories that have one, by size. */
  agent_starts_by_size: Record<string, { to_first_gate: number | null; from_build: number | null }>;
}

export interface AgentStarts {
  card: string;
  size: string;
  /** Starts from creation until the first gate parked the story (the spec gate for M); null when no gate has parked it yet. */
  to_first_gate: number | null;
  /** Starts on the lane's build stage and every stage after it; null for a story that has not reached build. */
  from_build: number | null;
}

/** How many agent starts a story took to its first gate, and from build onward. */
export function agentStarts(card: Card, lane: Lane | undefined): AgentStarts {
  const starts = card.events.filter(e => e.action === 'agent-start');
  const firstPark = card.events.find(e => e.action === 'park' && e.stage !== PROPOSED && e.note?.startsWith('gate '));
  const ids = lane?.stages.map(s => s.id) ?? [];
  const build = ids.indexOf('build');
  const reached = build >= 0 && (card.stage === DONE || ids.indexOf(card.stage) >= build);
  return {
    card: card.id,
    size: card.size ?? 'M',
    to_first_gate: firstPark ? starts.filter(e => ms(e.at) <= ms(firstPark.at)).length : null,
    from_build: reached ? starts.filter(e => e.stage !== undefined && ids.indexOf(e.stage) >= build).length : null,
  };
}

const HOUR = 3_600_000;
const ms = (iso: string) => new Date(iso).getTime();
const ratio = (n: number, d: number) => (d ? n / d : null);

// Longest stretch of a card's life with no human event: creation, each human event, last event.
function unattended(card: Card): number {
  const marks = [card.createdAt, ...card.events.filter(e => e.human).map(e => e.at), card.events.at(-1)?.at ?? card.createdAt].map(ms);
  return Math.max(...marks.slice(1).map((t, i) => t - marks[i]), 0);
}

const DAY = 24 * HOUR;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const rejected = (c: Card) => c.events.some(e => e.action === 'reject' && e.stage !== PROPOSED);

/** The names `metric:` may use with `source: cards`; anything else is no-data. */
export const CARD_METRICS: Record<string, (cards: Card[]) => number | null> = {
  done: cards => cards.filter(c => c.stage === DONE).length,
  done_cards: cards => cards.filter(c => c.stage === DONE).length,
  cards_done: cards => cards.filter(c => c.stage === DONE).length,
  done_without_reject: cards => cards.filter(c => c.stage === DONE && !rejected(c)).length,
  first_pass_done: cards => cards.filter(c => c.stage === DONE && !rejected(c)).length,
  cycle_time_hours: cards => mean(cards.filter(c => c.stage === DONE).map(c => (ms(c.updatedAt) - ms(c.createdAt)) / HOUR)),
  cycle_time_days: cards => mean(cards.filter(c => c.stage === DONE).map(c => (ms(c.updatedAt) - ms(c.createdAt)) / DAY)),
  trivial_cycle_time_hours: cards => mean(cards.filter(c => c.stage === DONE && c.size === 'trivial').map(c => (ms(c.updatedAt) - ms(c.createdAt)) / HOUR)),
  proposals_accepted_ratio: cards => {
    const promoted = cards.filter(c => c.events.some(e => e.action === 'promote')).length;
    const dropped = cards.filter(c => c.stage === 'dropped').length;
    return ratio(promoted, promoted + dropped);
  },
};

export function laneMetrics(cards: Card[], lanes: Lane[]): LaneMetric[] {
  return lanes.filter(l => l.metric?.name).map(lane => {
    const derive = lane.metric.source === 'cards' ? CARD_METRICS[lane.metric.name] : undefined;
    const value = derive ? derive(cards.filter(c => c.lane === lane.id)) : null;
    return { lane: lane.id, name: lane.metric.name, source: lane.metric.source, ...(lane.metric.target ? { target: lane.metric.target } : {}), value: value === null ? null : Math.round(value * 1000) / 1000 };
  });
}

export function computeStats(cards: Card[], lanes: Lane[]): Stats {
  // Dropping a proposal is a choice about what to work on, not a judgement of work, so it is
  // left out of the gate and rework numbers. It still counts as a human turn.
  const judged = (e: { stage?: string }) => e.stage !== PROPOSED;
  const events = cards.flatMap(c => c.events);
  const done = cards.filter(c => c.stage === DONE);
  const starts = cards.filter(c => c.stage !== PROPOSED && c.stage !== 'dropped').map(c => agentStarts(c, lanes.find(l => l.id === c.lane)));

  // First pass at a gate: the first human decision at that stage was an approval.
  const gates: Record<string, { first: number; total: number }> = {};
  for (const card of cards) {
    const lane = lanes.find(l => l.id === card.lane);
    const decided = new Set<string>();
    for (const e of card.events) {
      if ((e.action !== 'approve' && e.action !== 'reject') || !e.stage || !judged(e) || decided.has(e.stage)) continue;
      decided.add(e.stage);
      const key = `${card.lane}/${lane?.stages.find(s => s.id === e.stage)?.gate?.name ?? e.stage}`;
      gates[key] ??= { first: 0, total: 0 };
      gates[key].total++;
      if (e.action === 'approve') gates[key].first++;
    }
  }

  return {
    metrics: laneMetrics(cards, lanes),
    cards: cards.length,
    done: done.length,
    human_turns_per_card: ratio(events.filter(e => e.human).length, cards.length),
    unattended_span_hours: cards.length ? Math.max(...cards.map(unattended)) / HOUR : null,
    cycle_time_hours: done.length ? done.reduce((sum, c) => sum + ms(c.updatedAt) - ms(c.createdAt), 0) / done.length / HOUR : null,
    trivial_cycle_time_hours: CARD_METRICS.trivial_cycle_time_hours(cards),
    rework: ratio(events.filter(e => e.action === 'reject' && judged(e)).length, events.filter(e => e.action === 'approve').length),
    stuck_rate: ratio(cards.filter(c => c.events.some(e => e.action === 'stuck')).length, cards.length),
    first_pass_rate_by_gate: Object.fromEntries(Object.entries(gates).map(([k, g]) => [k, g.first / g.total])),
    agent_starts: starts,
    agent_starts_by_size: Object.fromEntries([...new Set(starts.map(a => a.size))].map(size => {
      const mine = starts.filter(a => a.size === size);
      const avg = (key: 'to_first_gate' | 'from_build') => mean(mine.flatMap(a => (a[key] === null ? [] : [a[key]!])));
      return [size, { to_first_gate: avg('to_first_gate'), from_build: avg('from_build') }];
    })),
  };
}
