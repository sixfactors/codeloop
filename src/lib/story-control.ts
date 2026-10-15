import { existsSync, readFileSync, writeFileSync } from 'fs';
import { activeSessions } from './active-card.js';
import { DONE, DROPPED, PROPOSAL_GATE, PROPOSED, findCard, inLane, readCards, RefusalError, writeCards, type Card, type CardEvent, type Size } from './cards.js';
import { assertRoomInLane, type Role } from './engine.js';
import { loadLane, type Lane } from './lane.js';
import { findRunningRun } from './runs.js';
import { resolveSpecDir } from './spec.js';
import { specPath } from './project-root.js';
import { clock } from './clock.js';
import { knownPersonas, SIZES, titleProblems } from './story.js';

/** The word a person uses for a proposed card's place: it waits in the backlog, outside the lane. */
export const BACKLOG = 'backlog';
export const PRIORITIES = ['P1', 'P2', 'P3', 'P4'];

interface Opts {
  note?: string;
  now?: Date;
}

const ownerOnly = (role: Role, what: string): void => {
  if (role === 'agent') throw new RefusalError(`${what} is the owner's decision`);
};

/** A builder session or a live run on the card owns its stage: a move under it would be overwritten. */
function assertNotHeld(projectDir: string, card: Card): void {
  const session = activeSessions(projectDir).find(s => s.card === card.id);
  if (session) throw new RefusalError(`${card.id} is held by ${session.label ?? session.session}; wait for it to finish or stop it first`);
  const run = findRunningRun(projectDir);
  if (run?.cardId === card.id) throw new RefusalError(`${card.id} has a run in progress (${run.runId}); wait for it to finish or stop it first`);
}

function stageIndex(lane: Lane, stage: string): number {
  const at = lane.stages.findIndex(s => s.id === stage);
  if (at < 0) throw new RefusalError(`lane ${lane.id} has no stage "${stage}" (stages: ${lane.stages.map(s => s.id).join(', ')})`);
  return at;
}

const event = (now: Date, role: Role, action: string, stage: string | undefined, note?: string): CardEvent => ({
  at: now.toISOString(),
  actor: role,
  human: role === 'owner' || role === 'reviewer',
  action,
  ...(stage ? { stage } : {}),
  ...(note ? { note } : {}),
});

/** A card on `stage` with a clean slate there: no gate, no retries, no failure fingerprint. */
function enter(card: Card, stage: string): Card {
  const { gate: _gate, awaiting: _awaiting, parked_from: _from, ...rest } = card;
  const { [stage]: _retries, ...retries } = card.retries ?? {};
  const { [stage]: _failure, ...failures } = card.failures ?? {};
  return { ...rest, stage, retries, ...(card.failures ? { failures } : {}) };
}

/**
 * Brings a done or dropped card back. The default target is the lane's first stage; `backlog` parks
 * it as a proposal so it waits for approval and holds no lane slot.
 */
export function reopenCard(projectDir: string, id: string, role: Role, opts: Opts & { to?: string } = {}): Card {
  ownerOnly(role, 'reopening a card');
  const file = readCards(projectDir);
  const before = findCard(file.cards, id);
  if (before.stage !== DONE && before.stage !== DROPPED) throw new RefusalError(`${before.id} is at ${before.stage}, not done or dropped; use \`codeloop card move\``);
  assertNotHeld(projectDir, before);
  const lane = loadLane(projectDir, before.lane);
  const now = opts.now ?? clock();
  const to = opts.to ?? lane.stages[0].id;
  let card: Card;
  if (to === BACKLOG || to === PROPOSED) {
    const { gate: _g, awaiting: _a, ...rest } = enter(before, lane.stages[0].id);
    card = { ...rest, stage: PROPOSED, gate: PROPOSAL_GATE, awaiting: 'owner' };
  } else {
    stageIndex(lane, to);
    assertRoomInLane(file.cards, lane, 1);
    card = enter(before, to);
  }
  card = { ...card, events: [...before.events, event(now, role, 'reopen', card.stage, opts.note ? `from ${before.stage}: ${opts.note}` : `from ${before.stage}`)], updatedAt: now.toISOString() };
  writeCards(projectDir, file, file.cards.map(c => (c.id === before.id ? card : c)));
  return card;
}

/**
 * Moves an active card to any other stage of its lane. Moving back past a gate that was passed
 * undoes an approval, so the note must say why. `place` stays the forward-only placement.
 */
export function moveCard(projectDir: string, id: string, stage: string, role: Role, opts: Opts = {}): Card {
  ownerOnly(role, 'moving a card between stages');
  const file = readCards(projectDir);
  const before = findCard(file.cards, id);
  if (!inLane(before)) throw new RefusalError(`${before.id} is ${before.stage}; \`codeloop card reopen\` brings it back first`);
  assertNotHeld(projectDir, before);
  const lane = loadLane(projectDir, before.lane);
  const from = stageIndex(lane, before.stage);
  const target = stageIndex(lane, stage);
  if (target === from) throw new RefusalError(`${before.id} is already at ${stage}`);
  const passed = target < from ? lane.stages.slice(target, from).filter(s => s.gate).map(s => s.gate!.name) : [];
  if (passed.length && !opts.note?.trim()) throw new RefusalError(`moving ${before.id} back to ${stage} undoes the ${passed.join(' and ')} gate: say why in the note`);
  const now = opts.now ?? clock();
  const card: Card = {
    ...enter(before, stage),
    events: [...before.events, event(now, role, 'move', stage, opts.note ? `from ${before.stage}: ${opts.note}` : `from ${before.stage}`)],
    updatedAt: now.toISOString(),
  };
  writeCards(projectDir, file, file.cards.map(c => (c.id === before.id ? card : c)));
  return card;
}

export interface CardEdit {
  title?: string;
  /** `As a <persona>, I can <what>, so that <outcome>`. */
  story?: string;
  priority?: string;
  feature?: string;
  size?: string;
}

const STORY = /^As an? (.+?), I can (.+?), so that (.+?)\.?$/s;

/** Edits a story's fields; the story line in spec.md follows when the story changes. */
export function editCard(projectDir: string, id: string, role: Role, edit: CardEdit, opts: Opts = {}): Card {
  ownerOnly(role, 'editing a card');
  const file = readCards(projectDir);
  const before = findCard(file.cards, id);
  const changes: Partial<Card> = {};
  const names: string[] = [];
  if (edit.title !== undefined) {
    const problems = titleProblems(edit.title);
    if (problems.length) throw new RefusalError(problems.join('; '));
    changes.title = edit.title.trim();
    names.push('title');
  }
  let storyLine: string | undefined;
  if (edit.story !== undefined) {
    const m = STORY.exec(edit.story.trim());
    if (!m) throw new RefusalError('a story reads `As a <persona>, I can <what>, so that <outcome>` with every part filled in');
    const [, as, can, so] = m.map(p => p.trim());
    if (!knownPersonas(projectDir).includes(as)) throw new RefusalError(`persona "${as}" is not known (${knownPersonas(projectDir).join(', ')})`);
    changes.story = { as, can, so };
    changes.persona = as;
    storyLine = `Story: As a ${as}, I can ${can}, so that ${so}.`;
    names.push('story');
  }
  if (edit.priority !== undefined) {
    const p = edit.priority.toUpperCase();
    if (!PRIORITIES.includes(p)) throw new RefusalError(`priority "${edit.priority}" is not one of ${PRIORITIES.join(', ')}`);
    changes.priority = p;
    names.push('priority');
  }
  if (edit.feature !== undefined) {
    if (!edit.feature.trim()) throw new RefusalError('feature is empty');
    changes.feature = edit.feature.trim();
    names.push('feature');
  }
  if (edit.size !== undefined) {
    const size = edit.size.toUpperCase();
    if (!SIZES.includes(size as Size)) throw new RefusalError(`size "${edit.size}" is not S, M or L`);
    changes.size = size as Size;
    names.push('size');
  }
  if (!names.length) throw new RefusalError('nothing to edit: pass --title, --story, --priority, --feature or --size');
  const now = opts.now ?? clock();
  const card: Card = { ...before, ...changes, events: [...before.events, event(now, role, 'edit', before.stage, names.join(', '))], updatedAt: now.toISOString() };
  writeCards(projectDir, file, file.cards.map(c => (c.id === before.id ? card : c)));
  // After the board write, so a refused or conflicting edit leaves the spec alone.
  if (storyLine) writeStoryLine(projectDir, card, storyLine);
  return card;
}

function writeStoryLine(projectDir: string, card: Card, line: string): void {
  let file: string;
  try {
    file = specPath(projectDir, resolveSpecDir(projectDir, card.id), 'spec.md');
  } catch {
    return; // no spec folder yet: the card's story field is the only copy
  }
  if (!existsSync(file)) return;
  const text = readFileSync(file, 'utf-8');
  writeFileSync(file, /^Story:.*$/m.test(text) ? text.replace(/^Story:.*$/m, line) : `${line}\n\n${text}`);
}
