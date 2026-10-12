import { DONE, DROPPED, PROPOSED, QUEUED, type Card } from './cards.js';

/**
 * What a person sees for a story: six states instead of every lane's stages. The stage stays as
 * a sub-label inside In progress, so agents keep their precision and people get a board that reads
 * at a glance. Needs you wins over In progress whenever a gate, a stuck check or an open question
 * waits on a person.
 */
export const DISPLAY_STATES = ['backlog', 'up-next', 'in-progress', 'needs-you', 'done', 'shipped'] as const;
export type DisplayState = (typeof DISPLAY_STATES)[number];
export type StateFlag = 'failing' | 'blocked' | 'stuck';

export interface StoryState {
  state: DisplayState;
  /** The lane stage while in progress or waiting, for the sub-label. */
  stage?: string;
  /** What waits on a person, when state is needs-you: a gate name, `stuck` or `questions`. */
  waitingOn?: string;
  flags: StateFlag[];
}

export const STATE_LABELS: Record<DisplayState, string> = {
  backlog: 'Backlog',
  'up-next': 'Up next',
  'in-progress': 'In progress',
  'needs-you': 'Needs you',
  done: 'Done',
  shipped: 'Shipped',
};

type StateInput = Pick<Card, 'stage' | 'gate' | 'retries'> & { release?: string };

export function storyState(card: StateInput, openQuestions = 0): StoryState | undefined {
  if (card.stage === DROPPED) return undefined;
  const failing = (card.retries?.[card.stage] ?? 0) > 0 && !card.gate;
  const flags: StateFlag[] = [];
  if (failing) flags.push('failing');
  if (card.gate === 'stuck') flags.push('stuck');
  if (card.stage === PROPOSED) return { state: 'backlog', flags };
  if (card.stage === QUEUED) return { state: 'up-next', flags };
  if (card.stage === DONE) return { state: card.release ? 'shipped' : 'done', flags };
  if (card.gate) return { state: 'needs-you', stage: card.stage, waitingOn: card.gate, flags };
  if (openQuestions > 0) return { state: 'needs-you', stage: card.stage, waitingOn: 'questions', flags };
  return { state: 'in-progress', stage: card.stage, flags };
}
