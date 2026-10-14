import { DONE, DROPPED, PROPOSED, QUEUED, type Card } from './cards.js';

/**
 * What a person sees for a story: six states instead of every lane's stages. The stage stays as
 * a sub-label inside In progress, so agents keep their precision and people get a board that reads
 * at a glance. Needs you wins over In progress whenever a gate, a stuck check or an open question
 * waits on a person.
 */
export const DISPLAY_STATES = ['backlog', 'up-next', 'in-progress', 'needs-you', 'done', 'shipped'] as const;
export type DisplayState = (typeof DISPLAY_STATES)[number];
/** Flags that sit beside the state. Failing and stuck are no longer flags: `health` carries them. */
export type StateFlag = 'blocked';

/**
 * How a story in a lane is doing, one value, never two (docs: story-journey devex, section 6):
 * working (someone or something is on it, or a first failed check with recent activity), needs-you
 * (a gate or questions; wins over failing), failing (two or more failed checks and no activity for
 * an hour, or an agent run that ended on a failed check), stuck (three fails, parked by the engine),
 * stale (no event and no activity for two days).
 */
export const HEALTH = ['working', 'needs-you', 'failing', 'stuck', 'stale'] as const;
export type Health = (typeof HEALTH)[number];

export const STALE_MS = 2 * 24 * 60 * 60 * 1000;
export const QUIET_MS = 60 * 60 * 1000;

export interface StoryState {
  state: DisplayState;
  /** The lane stage while in progress or waiting, for the sub-label. */
  stage?: string;
  /** What waits on a person, when state is needs-you: a gate name, `stuck` or `questions`. */
  waitingOn?: string;
  /** For a story in a lane: one of HEALTH. Absent for backlog, up next, done and shipped. */
  health?: Health;
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

type StateInput = Pick<Card, 'stage' | 'gate' | 'retries'> & { release?: string; updatedAt?: string; events?: { action: string; at?: string }[] };

/** `now` and the time of the story's last activity line; time-based health needs both. */
export interface HealthContext {
  now?: number;
  lastActivityAt?: number;
  /** A live session holds the story now. */
  held?: boolean;
}

/** True when the last agent run on the story was followed by a failed check, with no advance since. */
function agentEndedOnFail(events: { action: string }[] = []): boolean {
  const run = events.map(e => e.action).lastIndexOf('agent-run');
  if (run < 0) return false;
  const after = events.slice(run + 1).map(e => e.action);
  return after.includes('fail') && !after.includes('advance');
}

export function storyState(card: StateInput, openQuestions = 0, ctx: HealthContext = {}): StoryState | undefined {
  if (card.stage === DROPPED) return undefined;
  const flags: StateFlag[] = [];
  if (card.stage === PROPOSED) return { state: 'backlog', flags };
  if (card.stage === QUEUED) return { state: 'up-next', flags };
  if (card.stage === DONE) return { state: card.release ? 'shipped' : 'done', flags };
  if (card.gate === 'stuck') return { state: 'needs-you', stage: card.stage, waitingOn: 'stuck', health: 'stuck', flags };
  // Needs you wins over failing and stale: the next move is a person's.
  if (card.gate) return { state: 'needs-you', stage: card.stage, waitingOn: card.gate, health: 'needs-you', flags };
  if (openQuestions > 0) return { state: 'needs-you', stage: card.stage, waitingOn: 'questions', health: 'needs-you', flags };
  return { state: 'in-progress', stage: card.stage, health: inProgressHealth(card, ctx), flags };
}

function inProgressHealth(card: StateInput, ctx: HealthContext): Health {
  const now = ctx.now ?? Date.now();
  const lastEvent = card.updatedAt ? Date.parse(card.updatedAt) : now;
  const lastTouch = Math.max(lastEvent, ctx.lastActivityAt ?? 0);
  if (now - lastTouch > STALE_MS) return 'stale';
  if (agentEndedOnFail(card.events)) return 'failing';
  const fails = card.retries?.[card.stage] ?? 0;
  const quiet = now - (ctx.lastActivityAt ?? lastEvent) > QUIET_MS;
  if (fails >= 2 && quiet) return 'failing';
  // One failed check is a stage being worked only while someone works it: quiet for an hour with
  // nobody holding it, the check is simply failing.
  if (fails >= 1 && quiet && !ctx.held) return 'failing';
  return 'working';
}
