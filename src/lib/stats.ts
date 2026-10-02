import { DONE, PROPOSED, type Card } from './cards.js';
import type { Lane } from './lane.js';

export interface Stats {
  cards: number;
  done: number;
  human_turns_per_card: number | null;
  unattended_span_hours: number | null;
  cycle_time_hours: number | null;
  rework: number | null;
  stuck_rate: number | null;
  first_pass_rate_by_gate: Record<string, number>;
}

const HOUR = 3_600_000;
const ms = (iso: string) => new Date(iso).getTime();
const ratio = (n: number, d: number) => (d ? n / d : null);

// Longest stretch of a card's life with no human event: creation, each human event, last event.
function unattended(card: Card): number {
  const marks = [card.createdAt, ...card.events.filter(e => e.human).map(e => e.at), card.events.at(-1)?.at ?? card.createdAt].map(ms);
  return Math.max(...marks.slice(1).map((t, i) => t - marks[i]), 0);
}

export function computeStats(cards: Card[], lanes: Lane[]): Stats {
  // Dropping a proposal is a choice about what to work on, not a judgement of work, so it is
  // left out of the gate and rework numbers. It still counts as a human turn.
  const judged = (e: { stage?: string }) => e.stage !== PROPOSED;
  const events = cards.flatMap(c => c.events);
  const done = cards.filter(c => c.stage === DONE);

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
    cards: cards.length,
    done: done.length,
    human_turns_per_card: ratio(events.filter(e => e.human).length, cards.length),
    unattended_span_hours: cards.length ? Math.max(...cards.map(unattended)) / HOUR : null,
    cycle_time_hours: done.length ? done.reduce((sum, c) => sum + ms(c.updatedAt) - ms(c.createdAt), 0) / done.length / HOUR : null,
    rework: ratio(events.filter(e => e.action === 'reject' && judged(e)).length, events.filter(e => e.action === 'approve').length),
    stuck_rate: ratio(cards.filter(c => c.events.some(e => e.action === 'stuck')).length, cards.length),
    first_pass_rate_by_gate: Object.fromEntries(Object.entries(gates).map(([k, g]) => [k, g.first / g.total])),
  };
}
