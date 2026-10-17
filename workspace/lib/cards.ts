import type { Card, InboxPayload, Lane } from './types';

export const isProposed = (c: Card) => c.stage === 'proposed';
export const isDropped = (c: Card) => c.stage === 'dropped';
// Proposals also carry gate/awaiting, but they live in the backlog, not the gate list.
export const isGateWaiting = (c: Card) => Boolean(c.gate || c.awaiting) && !isProposed(c) && !isDropped(c);

export const DONE_STAGE_IDS = ['done', 'shipped', 'live', 'released'];
const DONE_STAGES = new Set(DONE_STAGE_IDS);
export const isShipped = (c: Card) => DONE_STAGES.has(c.stage);
// The server's stageEntryIndex (src/lib/cards.ts), kept here so the client bundle does not pull in the server's file access.
const ENTERS = new Set(['place', 'promote', 'unpark', 'returned', 'move', 'reopen']);
function enteredAt(c: Card): number {
  const events = c.events ?? [];
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.action === 'advance' && /^to (\S+)/.exec(e.note ?? '')?.[1] === c.stage) return i;
    if (ENTERS.has(e.action) && e.stage === c.stage) return i;
  }
  return -1;
}
/** In a lane, not at a gate, with a failed check on the current stage since it was entered, counted toward retries or not (the server's health rule). */
export const isFailing = (c: Card) =>
  !isProposed(c) && !isDropped(c) && !isGateWaiting(c) && !isShipped(c) &&
  ((c.retries?.[c.stage] ?? 0) > 0 || (c.events ?? []).slice(enteredAt(c) + 1).some((e) => e.action === 'fail' && e.stage === c.stage));

/** The server's wip rule (engine.ts holdsSlot): in a lane (not queued, done, proposed or dropped), at no gate, not trivial. A lane's own live or released stage still holds a slot. */
export const holdsSlot = (c: Card) => !['queued', 'done', 'proposed', 'dropped'].includes(c.stage) && !c.gate && c.size !== 'trivial';

export function shippedSince(c: Card, since: Date): boolean {
  if (!isShipped(c)) return false;
  const at = c.events?.filter((e) => DONE_STAGES.has(e.stage ?? '') || DONE_STAGES.has(e.action)).at(-1)?.at ?? c.updatedAt;
  return Boolean(at && new Date(at) >= since);
}

// Lanes come from /api/lanes when it exists; until then they are derived from the cards payload
// (which carries lanes today) or from the lane/stage pairs seen on cards.
export function deriveLanes(cards: Card[], fromPayload?: Lane[]): Lane[] {
  if (fromPayload?.length) return fromPayload;
  const byLane = new Map<string, Set<string>>();
  for (const c of cards) {
    if (isProposed(c) || isDropped(c)) continue;
    const set = byLane.get(c.lane) ?? new Set<string>();
    set.add(c.stage);
    byLane.set(c.lane, set);
  }
  return [...byLane].map(([id, stages]) => ({ id, stages: [...stages].map((s) => ({ id: s })) }));
}

export const uniq = (values: (string | number | undefined)[]) =>
  [...new Set(values.filter((v): v is string | number => v !== undefined && v !== ''))].map(String).sort();

/**
 * The inbox shape from a full card list, for a server that does not serve GET /api/inbox yet.
 * Lists are capped like the server's so the page draws the same way either way.
 */
export function deriveInbox(cards: Card[], lanes: Lane[], since: Date, limit = 50): InboxPayload {
  const cap = <T,>(items: T[]) => ({ cards: items.slice(0, limit), total: items.length, nextCursor: null });
  const gates = cards.filter(isGateWaiting);
  const failing = cards.filter(isFailing);
  const proposed = cards.filter(isProposed).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  const backlog = {
    count: proposed.length,
    ...(proposed[0] ? { oldest: { id: proposed[0].id, title: proposed[0].title, since: proposed[0].createdAt ?? '' } } : {}),
  };
  const asking = cards.filter((c) => (c.openQuestions ?? 0) > 0 && !isDropped(c) && !isShipped(c));
  const shipped = cards.filter((c) => shippedSince(c, since));
  const laneIds = uniq([...lanes.map((l) => l.id), ...cards.map((c) => c.lane)]);
  const perLane = laneIds.map((lane) => {
    const mine = cards.filter((c) => c.lane === lane && !isProposed(c) && !isDropped(c));
    return { lane, active: mine.filter((c) => !isGateWaiting(c) && !isShipped(c)).length, holding: mine.filter(holdsSlot).length, parked: mine.filter(isGateWaiting).length, done: mine.filter(isShipped).length };
  });
  return { needsYou: cap(gates), failing: cap(failing), backlog, questions: cap(asking), shipped: cap(shipped), perLane };
}
