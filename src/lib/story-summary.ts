/**
 * The three lines at the top of a story page: what it needs, what is done and what the founder
 * must do. The first two are the card's stored lines when someone wrote them, else worked out
 * from the board; the third is always the board's, so no text can say nothing waits while a gate
 * or a stuck story does.
 */
import { DONE, type Card, type SummaryKey, type SummaryLine } from './cards.js';
import type { Journey } from './journey.js';
import type { StuckExplanation } from './stuck-explanation.js';

export interface SummaryViewLine {
  text: string;
  by: string;
  /** `board`: worked out from the board's facts, not written by anyone. */
  byKind: SummaryLine['kind'] | 'board';
  step: string;
  at?: string;
}

export interface SummaryView {
  needed: SummaryViewLine;
  done: SummaryViewLine;
  you: SummaryViewLine;
  /** `unwritten`: nobody has written a line yet. `stale`: a written line dates from an earlier step. */
  mark?: 'unwritten' | 'stale';
}

const BOARD = 'the board';
const sentence = (text: string) => {
  const t = text.trim().replace(/\s+/g, ' ');
  return t ? `${t[0].toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? '' : '.'}` : t;
};
const listOf = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/** What waits on the founder, from the holder and the gate: never from a stored text. */
export function youLine(card: Card, journey: Journey, stuck?: StuckExplanation): SummaryViewLine {
  const h = journey.holder;
  const current = journey.steps.find(s => s.state === 'current' || s.state === 'gate');
  const step = card.stage;
  const at = current?.leftAt ?? h.since ?? current?.enteredAt;
  const line = (text: string): SummaryViewLine => ({ text, by: BOARD, byKind: 'board', step, ...(at ? { at } : {}) });
  if (card.stage === DONE) return line('Nothing. The story is done.');
  if (card.gate === 'stuck') return line(stuck?.action ?? `It is stuck: ${h.stuckReason ?? 'the check kept failing'}.`);
  if (card.gate) return line(card.awaiting && card.awaiting !== 'owner' ? `The ${card.gate} gate waits for the ${card.awaiting}.` : `Approve the ${card.stage} step, or send it back with what to change.`);
  if (h.openQuestions) return line(`Answer ${h.openQuestions} open ${h.openQuestions === 1 ? 'question' : 'questions'}.`);
  if (h.kind === 'agent') return line(`Nothing for now. ${h.agent ? `${h.agent} is` : 'An agent is'} on the ${step} step.`);
  return line(`Nothing waits on you. Nobody is on the ${step} step; start an agent or work on it yourself.`);
}

function boardNeeded(card: Card): SummaryViewLine {
  const text = card.story?.can ? sentence(card.story.can) : sentence(card.title);
  return { text, by: BOARD, byKind: 'board', step: card.stage, at: card.createdAt };
}

function boardDone(card: Card, journey: Journey): SummaryViewLine {
  const done = journey.steps.filter(s => s.state === 'done').map(s => s.id);
  const t = journey.tasks;
  const tasks = t?.total ? `; ${t.done} of ${t.total} tasks done` : '';
  const text = card.stage === DONE ? `The story is done${tasks}.` : done.length ? `${sentence(listOf(done)).replace(/\.$/, '')} ${done.length === 1 ? 'is' : 'are'} finished${tasks}.` : `Nothing yet. The story is at ${card.stage}${tasks}.`;
  const last = journey.steps.filter(s => s.state === 'done').at(-1)?.leftAt;
  return { text, by: BOARD, byKind: 'board', step: card.stage, ...(last ? { at: last } : {}) };
}

const stored = (l: SummaryLine): SummaryViewLine => ({ text: l.text, by: l.by, byKind: l.kind, step: l.step, at: l.at });

/** The summary the story page shows, joined here so the page derives nothing. */
export function summaryView(card: Card, journey: Journey, stuck?: StuckExplanation): SummaryView {
  const s = card.summary ?? {};
  const order = journey.steps.map(x => x.id);
  const here = card.stage === DONE ? order.length : order.indexOf(card.stage);
  const older = (l?: SummaryLine) => Boolean(l && (here < 0 ? false : order.indexOf(l.step) < here));
  const keys: SummaryKey[] = ['needed', 'done'];
  const written = keys.filter(k => s[k]);
  const view: SummaryView = {
    needed: s.needed ? stored(s.needed) : boardNeeded(card),
    done: s.done ? stored(s.done) : boardDone(card, journey),
    you: youLine(card, journey, stuck),
  };
  if (!written.length) view.mark = 'unwritten';
  else if (keys.some(k => older(s[k]))) view.mark = 'stale';
  return view;
}
