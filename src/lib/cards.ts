import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs';
import { followLink } from './store-home.js';
import { join } from 'path';
import { appendActivity, MIRRORED_EVENTS } from './activity.js';
import { CloudConflictError, writeCloudBoard } from './cloud.js';
import { withLock } from './lock.js';

export interface CardEvent {
  at: string;
  actor: string;
  human: boolean;
  action: string;
  stage?: string;
  note?: string;
  /** On an approval: what the stage's output and check were when it was given. On agent-start and fail: the stage's work then. */
  fingerprint?: string;
  /** On fail and agent-start: HEAD when the check ran or the agent started. */
  head?: string;
  /** On fail: the failure counted toward the lane's retries (work was tried before it). */
  counted?: boolean;
  /** On approve and auto-approve: the gate the decision answered, for a stage that asks two (a folded one). Absent means the stage's own gate. */
  gate?: string;
  /** Reserved for an approval recorded by an authenticated store. Local approvals have none. */
  approvalId?: string;
  /** On agent-start and agent-run: the configured agent, its exit code (null when killed), and where its output went. */
  agent?: string;
  exit?: number | null;
  durationMs?: number;
  log?: string;
  /** On agent-start: the turn's own time limit in minutes, which a carried or batched turn raises above the agent's preset. */
  timeoutMinutes?: number;
}

/** The reason a story parks stuck when its agent would be restarted on unchanged work after a failed check. */
export const NOTHING_CHANGED = 'the agent ran and changed nothing; a person needs to look';

/** The reason a story parks stuck when its check crashes again on work nothing has changed. */
export const CHECK_CRASHED = 'the check itself crashed and nothing has changed since; a person needs to look';

/** The reason a story parks stuck at its lane's retry limit. */
export const failedTimes = (n: number) => `the check failed ${n} ${n === 1 ? 'time' : 'times'} with work tried before each; a person needs to look`;

/**
 * Why a card sits at gate stuck, as one sentence: the first line of its last stuck event's note,
 * which the engine writes as the reason with the check output below it. A note that holds only
 * the check output, or an orchestrator's finding, reads as the count when one was kept.
 */
export function stuckReason(card: Pick<Card, 'stage' | 'retries' | 'events'>): string {
  const first = card.events?.filter(e => e.action === 'stuck').at(-1)?.note?.split('\n')[0] ?? '';
  if (first === NOTHING_CHANGED || first === CHECK_CRASHED || /^the check failed \d+ times? /.test(first)) return first;
  const n = card.retries?.[card.stage] ?? 0;
  return n > 0 ? failedTimes(n) : first || 'the check failed';
}

/** A card on `stage` with a clean slate there: no gate, no retries, no failure fingerprint. */
export function enter(card: Card, stage: string): Card {
  const { gate: _gate, awaiting: _awaiting, parked_from: _from, ...rest } = card;
  const { [stage]: _retries, ...retries } = card.retries ?? {};
  const { [stage]: _failure, ...failures } = card.failures ?? {};
  return { ...rest, stage, retries, ...(card.failures ? { failures } : {}) };
}

/**
 * Why a card waiting at a gate cannot be moved or placed, or undefined when it waits at none. Any
 * move would drop the gate with no decision on record; approve or reject is that decision.
 */
export function gateRefusal(card: Pick<Card, 'id' | 'stage' | 'gate'>): string | undefined {
  if (card.gate === 'stuck') return `${card.id} is stuck at ${card.stage}; \`codeloop approve ${card.id}\` retries it, \`codeloop reject ${card.id} "<why>"\` parks it`;
  if (card.gate) return `${card.id} is waiting at the ${card.gate} gate at ${card.stage}; \`codeloop approve ${card.id}\` or \`codeloop reject ${card.id} "<why>"\` decides it`;
  return undefined;
}

export { stageEntryIndex } from './stage-entry.js';

/** `trivial` is below S: a one-line fix that skips the ceremony stages (`when: size >= S`). */
export type Size = 'trivial' | 'S' | 'M' | 'L';

/** The story standard's fields (docs/story-standard.md). Every one is optional: older cards carry none. */
export interface StoryFields {
  story?: { as: string; can: string; so: string };
  /** Same as story.as; kept flat so the board can filter on it. */
  persona?: string;
  size?: Size;
  /** P1 (brings money) to P4 (nice to have); set from the story page. */
  priority?: string;
  /** A critical bug: every pick takes it before any other story, whatever its priority. An agent may set or clear it. */
  bug?: boolean;
  points?: number;
  initiative?: string;
  epic?: string;
  feature?: string;
  metric?: string;
  /** Weeks; replaces the feature's effort in this card's RICE score. */
  effort?: number;
  /** A command that exits 0 or a screen a person opens; carried from a shape breakdown's story line onto its build card. */
  done_when?: string;
}

/** Fields a card carries besides the story standard's. */
export interface CardExtras {
  /** The stage a parked card left; approving it in the inbox returns it there instead of the first stage. */
  parked_from?: string;
  /** The tracker key a ticket-style title started with (`ACME-412: …`) or `--ticket` named. */
  ticket?: string;
  /** The card this one was split from (`card split`); siblings share its feature. */
  split_from?: string;
  /** The card this one is queued behind: it holds no lane slot until that card reaches `done`. */
  after?: string;
  /** The stage a queued card enters when promoted; split children resume at their parent's stage. */
  start_stage?: string;
  /** The git worktree this story builds in, and its branch (`ensureStoryWorktree`). */
  worktree?: string;
  branch?: string;
}

/** One line of a story's summary, with who wrote it, at which step and when. */
export interface SummaryLine {
  text: string;
  by: string;
  kind: 'person' | 'agent';
  step: string;
  at: string;
}

/**
 * What the story needs and what is done. "What you must do" is never stored: it is worked out
 * from the board on every read, so a stale text cannot hide a gate.
 */
export interface StorySummary {
  needed?: SummaryLine;
  done?: SummaryLine;
}

export const SUMMARY_LINES = ['needed', 'done'] as const;
/** Longest summary line kept, so on a phone the three lines and the buttons under them fit one screen. */
export const SUMMARY_MAX = 200;
const clip = (text: string) => {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length <= SUMMARY_MAX ? one : `${one.slice(0, one.lastIndexOf(' ', SUMMARY_MAX - 1) > 0 ? one.lastIndexOf(' ', SUMMARY_MAX - 1) : SUMMARY_MAX - 1)}…`;
};
export type SummaryKey = (typeof SUMMARY_LINES)[number];

/**
 * The summary after one write. An agent never replaces a line a person wrote; it fills the lines
 * that are empty or an agent's. A person replaces any line. `kept` names the lines it left alone.
 */
export function mergeSummary(current: StorySummary | undefined, input: Partial<Record<SummaryKey, string>>, author: { by: string; kind: SummaryLine['kind'] }, step: string, at: string): { summary: StorySummary; written: SummaryKey[]; kept: SummaryKey[] } {
  const summary: StorySummary = { ...current };
  const written: SummaryKey[] = [];
  const kept: SummaryKey[] = [];
  for (const key of SUMMARY_LINES) {
    const text = input[key]?.trim();
    if (!text) continue;
    if (author.kind === 'agent' && summary[key]?.kind === 'person') {
      kept.push(key);
      continue;
    }
    summary[key] = { text: clip(text), by: author.by, kind: author.kind, step, at };
    written.push(key);
  }
  return { summary, written, kept };
}

/**
 * Writes summary lines onto a card. A write made from a stale read is refused by `writeCards`, so
 * it re-reads and merges again: an owner's edit and an agent's hand-back landing together both stay.
 */
export function writeSummary(projectDir: string, ref: string, input: Partial<Record<SummaryKey, string>>, author: { by: string; kind: SummaryLine['kind'] }, opts: { read?: CardFile; now?: Date } = {}): { card: Card; written: SummaryKey[]; kept: SummaryKey[] } {
  if (!SUMMARY_LINES.some(k => input[k]?.trim())) throw new RefusalError('a summary write needs a needed or done line; what you must do comes from the board');
  let file = opts.read ?? readCards(projectDir);
  for (let attempt = 0; ; attempt++) {
    const before = findCard(file.cards, ref);
    const at = (opts.now ?? new Date()).toISOString();
    const { summary, written, kept } = mergeSummary(before.summary, input, author, before.stage, at);
    const card: Card = { ...before, summary, updatedAt: at };
    try {
      writeCards(projectDir, file, file.cards.map(c => (c.id === before.id ? card : c)));
      return { card, written, kept };
    } catch (e) {
      if (!(e instanceof ConflictError) || attempt >= 4) throw e;
      file = readCards(projectDir);
    }
  }
}

export interface Card extends StoryFields, CardExtras {
  id: string;
  /** Needed and done, one line each, written by the agent that last worked it or by a person. */
  summary?: StorySummary;
  title: string;
  lane: string;
  laneVersion: number;
  stage: string;
  /** Folder key when another card already has this number (CL-001 and c-001): the lowercased id. */
  key?: string;
  spec?: string;
  /** On a proposal: what was seen and where, for the owner deciding whether to promote it. */
  description?: string;
  source?: string;
  /** Names what a proposal was made from, so the same finding is never proposed twice. */
  dedupe?: string;
  gate?: string;
  awaiting?: string;
  retries: Record<string, number>;
  /** Per stage: fingerprint of the work at its last failed check, so an unattended run can tell nothing changed. */
  failures?: Record<string, string>;
  evidence: string[];
  events: CardEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface CardFile {
  version: number;
  cards: Card[];
}

export const CARDS_PATH = '.codeloop/cards.json';
export const DONE = 'done';
/** A card someone proposed and the owner has not promoted. It waits at gate `proposal` and holds no place in its lane. */
export const PROPOSED = 'proposed';
export const PROPOSAL_GATE = 'proposal';
/** A proposal the owner turned down. */
export const DROPPED = 'dropped';
/** A story queued behind another by a shape breakdown's `on_done.queue`: it holds no lane slot until `after` reaches `done` (or, with no `after`, until wip opens up). `codeloop run` promotes it; nothing else does, because the owner's plan approval already covers it. */
export const QUEUED = 'queued';

/** In its lane and not finished. A proposal or a queued story is neither started nor counted until it is promoted. */
export const inLane = (card: { stage: string }) => card.stage !== DONE && card.stage !== PROPOSED && card.stage !== DROPPED && card.stage !== QUEUED;

/** A check, gate or permission said no. The CLI maps this to exit code 2. */
export class RefusalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RefusalError';
  }
}

/** The name a card's spec, use-case and evidence folders are keyed by: its number, unless that number is shared. */
export function cardKey(card: { id: string; key?: string }): string {
  return card.key ?? card.id.replace(/\D/g, '').padStart(3, '0');
}

/** `findCard`, but undefined when no card has that id or number. An ambiguous number still throws. */
export function findCardOrNone(cards: Card[], ref: string): Card | undefined {
  try {
    return findCard(cards, ref);
  } catch (e) {
    if (e instanceof RefusalError && e.message.includes('not found')) return undefined;
    throw e;
  }
}

export const CARD_ID = /^[A-Za-z]{1,10}-\d{1,6}$/;

/** For anything that becomes a file or folder name: one path component, nothing that climbs out. */
export function safeName(value: string, what: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) || value.includes('..')) {
    throw new RefusalError(`${what} "${value}" is not a plain name (letters, digits, dot, dash, underscore)`);
  }
  return value;
}

/** Accepts the full id in any case, or its number alone: `1`, `001`, `c-001` and `CL-001` can all name one card. */
export function findCard(cards: Card[], ref: string): Card {
  const exact = cards.find(c => c.id === ref) ?? cards.find(c => c.id.toLowerCase() === ref.toLowerCase());
  if (exact) return exact;
  const digits = ref.replace(/\D/g, '');
  const matches = digits ? cards.filter(c => parseInt(c.id.replace(/\D/g, '') || '-1', 10) === parseInt(digits, 10)) : [];
  // A prefixed ref (c-1) must agree with the card's prefix; a bare number matches any prefix.
  const prefix = ref.replace(/[\d-]+$/, '').toLowerCase();
  const fits = prefix ? matches.filter(c => c.id.replace(/[\d-]+$/, '').toLowerCase() === prefix) : matches;
  if (fits.length === 1) return fits[0];
  if (fits.length > 1) throw new RefusalError(`"${ref}" matches ${fits.map(c => c.id).join(', ')}; use the full id`);
  throw new RefusalError(`card "${ref}" not found`);
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

let readCache: Map<string, { stamp: string; file: CardFile }> | undefined;

/**
 * Within `fn` a read of an unchanged cards.json returns the one parsed object. For read-only
 * reports that call readCards once per card (the monitor); the callers share the object, so
 * nothing inside may modify what it reads or hand it to writeCards.
 */
export function withCardsReadCache<T>(fn: () => T): T {
  const saved = readCache;
  readCache = new Map();
  try {
    return fn();
  } finally {
    readCache = saved;
  }
}

export function readCards(projectDir: string): CardFile {
  const file = join(projectDir, CARDS_PATH);
  if (!existsSync(file)) return { version: 0, cards: [] };
  if (!readCache) return JSON.parse(readFileSync(file, 'utf-8')) as CardFile;
  const st = statSync(file);
  const stamp = `${st.mtimeMs}:${st.size}`;
  const hit = readCache.get(file);
  if (hit?.stamp === stamp) return hit.file;
  const parsed = JSON.parse(readFileSync(file, 'utf-8')) as CardFile;
  readCache.set(file, { stamp, file: parsed });
  return parsed;
}

/**
 * Compare-and-swap: `read` is the file as the caller read it. The write is refused when the
 * version on disk has moved, so two agents working from the same read cannot both land.
 */
export function writeCards(projectDir: string, read: CardFile, cards: Card[]): CardFile {
  // In store.home user mode cards.json is a link into the per-project store: write through it.
  const file = followLink(join(projectDir, CARDS_PATH));
  // The lock covers the re-read, the version check and the rename as one step. A connected cloud
  // store is written inside it too, so its revision record cannot be interleaved either.
  return withLock(file, () => {
    const current = readCards(projectDir);
    if (current.version !== read.version) {
      throw new ConflictError(`cards.json changed since it was read (read version ${read.version}, now ${current.version}); re-read and retry`);
    }

    const next: CardFile = { version: read.version + 1, cards };
    const content = JSON.stringify(next, null, 2) + '\n';
    // The cloud is written first, so a board that moved on elsewhere refuses this write before
    // the local file changes.
    try {
      writeCloudBoard(projectDir, content);
    } catch (e) {
      if (e instanceof CloudConflictError) throw new ConflictError(`the cloud board changed since this checkout last saw it (${e.message}); run \`codeloop cloud pull\` and retry`);
      throw e;
    }
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, content);
    renameSync(tmp, file);
    mirrorEvents(projectDir, current.cards, cards);
    return next;
  });
}

/** Copies the gate, answer and park events this write added into each card's activity stream. */
function mirrorEvents(projectDir: string, before: Card[], after: Card[]): void {
  const seen = new Map(before.map(c => [c.id, c.events?.length ?? 0] as const));
  for (const card of after) {
    for (const e of (card.events ?? []).slice(seen.get(card.id) ?? 0)) {
      if (!MIRRORED_EVENTS.has(e.action)) continue;
      // The card's own `edit` (an owner changing its fields) is `story-edit` in the stream: activity's
      // `edit` is an agent editing a file, which renders by its path and counts as work.
      appendActivity(projectDir, card.id, { at: e.at, kind: e.action === 'edit' ? 'story-edit' : e.action, actor: e.actor, ...(e.stage ? { stage: e.stage } : {}), ...(e.note ? { text: e.note } : {}), ...(e.action === 'agent-run' && e.durationMs ? { durationMs: e.durationMs } : {}) });
    }
  }
}

export function nextCardId(cards: Card[]): string {
  const max = cards.reduce((m, c) => Math.max(m, parseInt(c.id.replace(/\D/g, '') || '0', 10)), 0);
  return `c-${String(max + 1).padStart(3, '0')}`;
}
