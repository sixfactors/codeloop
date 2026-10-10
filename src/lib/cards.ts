import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CloudConflictError, writeCloudBoard } from './cloud.js';
import { withLock } from './lock.js';

export interface CardEvent {
  at: string;
  actor: string;
  human: boolean;
  action: string;
  stage?: string;
  note?: string;
  /** On an approval: what the stage's output and check were when it was given. */
  fingerprint?: string;
  /** Reserved for an approval recorded by an authenticated store. Local approvals have none. */
  approvalId?: string;
  /** On agent-start and agent-run: the configured agent, its exit code (null when killed), and where its output went. */
  agent?: string;
  exit?: number | null;
  durationMs?: number;
  log?: string;
}

export type Size = 'S' | 'M' | 'L';

/** The story standard's fields (docs/story-standard.md). Every one is optional: older cards carry none. */
export interface StoryFields {
  story?: { as: string; can: string; so: string };
  /** Same as story.as; kept flat so the board can filter on it. */
  persona?: string;
  size?: Size;
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
  /** The tracker key a ticket-style title started with (`ACME-412: …`) or `--ticket` named. */
  ticket?: string;
  /** The card this one was split from (`card split`); siblings share its feature. */
  split_from?: string;
  /** The card this one is queued behind: it holds no lane slot until that card reaches `done`. */
  after?: string;
}

export interface Card extends StoryFields, CardExtras {
  id: string;
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

export function readCards(projectDir: string): CardFile {
  const file = join(projectDir, CARDS_PATH);
  if (!existsSync(file)) return { version: 0, cards: [] };
  return JSON.parse(readFileSync(file, 'utf-8')) as CardFile;
}

/**
 * Compare-and-swap: `read` is the file as the caller read it. The write is refused when the
 * version on disk has moved, so two agents working from the same read cannot both land.
 */
export function writeCards(projectDir: string, read: CardFile, cards: Card[]): CardFile {
  const file = join(projectDir, CARDS_PATH);
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
    return next;
  });
}

export function nextCardId(cards: Card[]): string {
  const max = cards.reduce((m, c) => Math.max(m, parseInt(c.id.replace(/\D/g, '') || '0', 10)), 0);
  return `c-${String(max + 1).padStart(3, '0')}`;
}
