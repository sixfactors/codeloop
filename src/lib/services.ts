/**
 * The service layer: every operation the API routes and the SDK's local transport share. Nothing
 * here knows about HTTP or the terminal. Two groups: project functions that read and write the
 * engine's files directly (what the CLI needs, no index, so a one-shot process exits), and
 * index-backed reads that take the server's ProjectIndex (what the board draws).
 */
import { readOff } from './off.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { basename, dirname, join, resolve, sep } from 'path';
import { buildBrief, loadAgents } from './agent.js';
import { checkBoardPassword, readBoardAuth, writeBoardAuth } from './auth.js';
import { DONE, DROPPED, findCard, inLane, PROPOSED, QUEUED, readCards, RefusalError, writeSummary, type Card } from './cards.js';
import { detectProject, type ProjectDetection } from './detect.js';
import { SPLIT_BEFORE_STAGE, storySizeProblem } from './story-size.js';
import { advanceCard, assertRoomInLane, closeCard as closeCardLib, parkCard as parkCardLib, placeCard as placeCardLib, createCard, proposeCard, queueCard, recordEvent, rejectCard, resolveRole, type AdvanceResult, type Role } from './engine.js';
import { loadLane, loadLanes, loadSkillsIndex, substitute } from './lane.js';
import { findRunningRun, getRun, readRun, startCardRun, streamRun, waitRun, type RunRecord, type RunView } from './runs.js';
import { defaultSkillDirs, mergeSkillsIndex, scanSkills, type AdoptResult } from './skills.js';
import { approveFlow, describeAdvance, nextHint, stageBrief, startCard, usesSpec } from './flow.js';
import { CARD_FILTERS, type CardFilter, type EpicNode, type FeatureNode, type IndexedEpic, type IndexedFeature, type InboxPayload, type InboxQuery, type InitiativeTree, type ProjectIndex } from './index/index.js';
import { pickOrder, withChain, type Band, type CardChain } from './features.js';
import { buildInbox, markInboxSeen, readInboxSeen, type Inbox } from './inbox.js';
import { evaluateRubric, scaffoldRubric, type RubricReport, type RubricResult } from './rubric.js';
import { acceptAllAnswers, addQuestions, openQuestions, readQuestions, writeAnswer, type Question } from './interview.js';
import { mockHref } from './mock.js';
import { STATE_LABELS, storyState, type DisplayState, type StoryState } from './states.js';
import { activeSessions } from './active-card.js';
import { formatMinutes, lastActivityAt, phaseTime, readActivity, readAllActivity, type ActivityEntry } from './activity.js';
import { evidenceFiles, progressSince, storyTasks, type EvidenceFile } from './progress.js';
import { storyCommits, type StoryCommit } from './diff-budget.js';
import { summaryView, type SummaryView } from './story-summary.js';
import { moveStuck as moveStuckLib, stuckExplanation, type StuckExplanation } from './stuck-explanation.js';
import { activityText, enteredAt, journeyOf, lastActivity, storyLiveLine, type Journey } from './journey.js';
import { loadConfig } from './config.js';
import { newSpec, readTasks, type Task } from './spec.js';
import { newShape } from './shape.js';
import { computeStats, type Stats } from './stats.js';
import { listFilter, migrateStories, storyFields, type StoryFlags } from './story.js';
import { migrateFeatures } from './migrate-features.js';
import { ConflictError, openStore, type CardRecord, type Epic, type Evidence, type Feature, type Rice, type Store, type WikiPage } from './store/index.js';
import { inject, lintWiki, listPages, mergePages, WIKI_DIR, type Page as WikiEntry } from './wiki.js';
import { migrateResearchDecisions, type MigrationRow } from './wiki-rules.js';

export type { Inbox } from './inbox.js';
export type { Question } from './interview.js';
export type { Stats } from './stats.js';
export type { LintResult, Page as WikiEntry } from './wiki.js';
export type { RunRecord, RunView } from './runs.js';
export type { ActivityEntry, ActivityLine } from './activity.js';
export type { ActivityFrame } from './index/index.js';
export type { CheckSummary, Journey, JourneyStep, StepState, StoryHolder } from './journey.js';
export type { ProjectDetection } from './detect.js';
export type { AdoptResult } from './skills.js';

/** `--as owner|reviewer|agent`, CODELOOP_ROLE, else the terminal decides. */
export type RoleFlag = { as?: string };

export interface NewCardInput extends StoryFlags {
  lane: string;
  title: string;
  id?: string;
  /** The tracker key; a title starting `ACME-412: ` sets it too and the rest becomes the title. */
  ticket?: string;
}

export interface ProposalInput extends NewCardInput {
  description?: string;
  source?: string;
}

/** A card just made, with the one line saying what to do with it now. */
export interface CardCreated {
  card: Card;
  hint: string;
}

export interface CardProposed extends CardCreated {
  /** False when `source` named a finding that was already proposed; `card` is that earlier card. */
  created: boolean;
}

/** What `codeloop next` prints: the engine result plus its lines, the Next line last. */
export interface AdvanceReport {
  result: AdvanceResult;
  lines: string[];
  /** 2 when the check failed or the card is stuck; the CLI exits with it. */
  exitCode: number;
}

export interface DecisionReport {
  card: Card;
  /** The gate that was decided: a stage gate's name, `proposal`, or `stuck`. */
  gate: string;
  /** The first line: what the decision did. */
  summary: string;
  /** What follows the summary, the Next line last. */
  lines: string[];
  exitCode: number;
  advanced?: AdvanceResult;
}

export interface CardShow {
  /** `display`: the state and health a person sees, worked out now. */
  card: Card & CardHolder & { display?: StoryState };
  brief: ReturnType<typeof stageBrief>;
  hint: string;
  /** The tasks now in tasks.md with their ticks, and the evidence files with their modification times. */
  tasks: ReturnType<typeof storyTasks>;
  evidenceFiles: EvidenceFile[];
  /** Commits carrying the card's trailer on any branch, newest first, at most 20. */
  commits: StoryCommit[];
  /** On a stuck story: why, and which action moves it, the same as its page and the inbox. */
  stuck?: StuckExplanation;
  /** Time in the current phase: wall, working and idle minutes; absent when the card has no entry time. */
  phaseTime?: { stage: string; wallMinutes: number; activeMinutes: number; idleMinutes: number; /** "in build 6h 04m, working 1h 12m". */ text: string };
}

export type CardListFilter = { lane?: string; stage?: string; initiative?: string; epic?: string; feature?: string; band?: string; persona?: string; size?: string; points?: string | number; all?: boolean };

/** A stored card with its chain, band and score from the feature pages. */
export type ScoredRecord = CardRecord & CardChain;

/** On a card someone is working: `agent` is who, as a person reads it; `session` is the id, for a key. */
export interface CardHolder {
  agent?: string;
  session?: string;
}

export interface CardFull {
  card: Card & CardHolder & { mock?: string; openQuestions: number; display?: StoryState };
  /** The lane's phases with where this story is in them, who holds it, and its last check in words. */
  journey: Journey;
  spec: { dir: string; text: string | null } | null;
  tasks: Task[];
  questions: Question[];
  evidence: Evidence | null;
  mock: string | null;
  page: WikiPage | null;
  /** The current stage's rubric rows with pass, fail or pending and the finding, for the gate panel; null when the stage has no rubric. */
  rubric: { stage: string; rows: RubricResult[]; review: RubricReport['review'] } | null;
  /** Commits carrying the card's trailer on any branch, newest first, at most 20. */
  commits: StoryCommit[];
  evidenceFiles: EvidenceFile[];
  /** What it needs, what is done and what you must do, each with who wrote it and when. */
  summary: SummaryView & { stuck?: StuckExplanation };
}

export interface PageWrite {
  frontmatter?: Record<string, unknown>;
  body: string;
  /** The version the editor read, so two editors cannot overwrite each other. */
  expectVersion?: string | number;
}

export type EvidenceDetail = Omit<Evidence, 'files'> & { files: (Evidence['files'][number] & { content?: string })[] };

export type Config = Record<string, unknown>;

export type CardsPayload = Awaited<ReturnType<typeof cardsPayload>>;

// --- cards: engine writes and the CLI's reads ------------------------------------------------

// `ACME-412: add CSV export`, a tracker key, a colon, the title. The key is letters and digits, a
// dash and a number, as Jira, Linear and GitHub-style trackers write them.
const TICKET_TITLE = /^([A-Za-z][A-Za-z0-9]*-\d+):\s+(.+)$/s;

/** The ticket a title starts with, split off; `--ticket` wins over the prefix. */
export function splitTicket(title: string, ticket?: string): { title: string; ticket?: string } {
  const m = TICKET_TITLE.exec(title.trim());
  const rest = m ? m[2].trim() : title;
  const key = ticket?.trim() || m?.[1];
  return key ? { title: rest, ticket: key } : { title: rest };
}

/** `codeloop start` / `card new`: the story check runs first, so a technical title is refused. */
export function newCard(projectDir: string, input: NewCardInput, who?: Role): CardCreated {
  const { title, ticket } = splitTicket(input.title, input.ticket);
  const card = startCard(projectDir, { lane: input.lane, title, id: input.id, role: who ?? 'agent', fields: { ...storyFields(title, input), ...(ticket ? { ticket } : {}) } });
  return { card, hint: nextHint(projectDir, card) };
}

/** `card propose`: a `source` names the finding, so the same one is never proposed twice. */
export function newProposal(projectDir: string, input: ProposalInput, who?: Role): CardProposed {
  const { title, ticket } = splitTicket(input.title, input.ticket);
  const fields = { ...storyFields(title, input), ...(ticket ? { ticket } : {}) };
  const { card, created } = proposeCard(projectDir, {
    lane: input.lane,
    title,
    id: input.id,
    description: input.description,
    source: input.source,
    dedupe: input.source ? `${input.lane}:${input.source}:${title}` : undefined,
    role: who ?? 'agent',
    fields,
  });
  return { card, created, hint: nextHint(projectDir, card) };
}

/**
 * `codeloop shape "<problem>"`: starts the shape workflow. A problem statement is not a user
 * story, so this bypasses `storyFields`/`titleProblems` (the word-count and no-mechanism-marks
 * check) by calling `createCard` directly instead of going through `newCard`/`startCard`; the
 * title is the problem as given.
 */
export function shape(projectDir: string, problem: string, who?: Role): CardCreated {
  const text = (problem ?? '').trim();
  if (!text) throw new RefusalError('a problem statement is required');
  const created = createCard(projectDir, { lane: 'shape', title: text, role: who ?? 'agent' });
  newShape(projectDir, created.id, text, who ?? 'agent');
  const card = findCard(readCards(projectDir).cards, created.id);
  return { card, hint: nextHint(projectDir, card) };
}

/** Advances one card; with no ref, the one active card, refused when there is not exactly one. */
export function advance(projectDir: string, ref: string | undefined, opts: { event?: string } = {}): AdvanceReport {
  let id = ref;
  if (!id) {
    const active = readCards(projectDir).cards.filter(c => inLane(c) && !c.gate);
    if (active.length !== 1) throw new RefusalError(active.length ? `${active.length} cards are active (${active.map(c => c.id).join(', ')}); say which` : 'no active card; `codeloop start "<title>"` creates one');
    id = active[0].id;
  }
  const result = advanceCard(projectDir, id, { event: opts.event });
  return { result, ...describeAdvance(projectDir, result) };
}

export function approve(projectDir: string, ref: string, who: Role, note?: string): DecisionReport {
  const result = approveFlow(projectDir, ref, who, note);
  const summary = `${result.card.id} ${result.gate === 'stuck' ? 'can be retried' : result.gate === 'proposal' ? `promoted to ${result.card.lane}/${result.card.stage}` : `gate ${result.gate} approved`}`;
  const rest = result.advanced ? describeAdvance(projectDir, result.advanced) : { lines: [nextHint(projectDir, result.card)], exitCode: 0 };
  return { card: result.card, gate: result.gate, summary, advanced: result.advanced, ...rest };
}

/** `card park`: back to the owner's inbox, keeping its stage; approving it returns it there. */
export function parkCard(projectDir: string, ref: string, who: Role, note?: string): { card: Card; hint: string } {
  const card = parkCardLib(projectDir, findCard(readCards(projectDir).cards, ref).id, who, note);
  return { card, hint: `Next: ${card.id} is parked from ${card.parked_from}; \`codeloop approve ${card.id}\` puts it back there.` };
}

/** `start --stage`: a card for work already under way, placed at that stage. */
export function placeCard(projectDir: string, ref: string, stage: string, who: Role): { card: Card; hint: string } {
  const card = placeCardLib(projectDir, findCard(readCards(projectDir).cards, ref).id, stage, who);
  return { card, hint: nextHint(projectDir, card) };
}

/** `card done` / `card drop`: ends a card and frees its lane slot; the owner's or reviewer's decision. */
export function closeCard(projectDir: string, ref: string, who: Role, outcome: 'done' | 'dropped', note?: string): { card: Card; hint: string } {
  const card = closeCardLib(projectDir, findCard(readCards(projectDir).cards, ref).id, who, outcome, note);
  return { card, hint: `Next: ${card.id} is ${card.stage}; its slot in ${card.lane} is free. \`codeloop inbox\` shows what else is waiting.` };
}

export function reject(projectDir: string, ref: string, who: Role, note: string): DecisionReport {
  const before = findCard(readCards(projectDir).cards, ref);
  // A stuck card has no stage to redo: rejecting it parks it in the owner's inbox, where it was.
  if (before.gate === 'stuck') {
    const given = note?.trim() || undefined;
    const { card, hint } = parkCard(projectDir, before.id, who, given);
    return { card, gate: 'stuck', summary: `${card.id} parked from ${card.parked_from}${given ? '; note recorded' : ''}`, lines: [hint], exitCode: 0 };
  }
  const card = rejectCard(projectDir, ref, who, note);
  if (card.stage === DROPPED) return { card, gate: 'proposal', summary: `${card.id} dropped; note recorded`, lines: [], exitCode: 0 };
  const returned = card.stage !== before.stage;
  const summary = returned ? `${card.id} returned to ${card.stage}: the ${before.stage} gate was rejected before that stage ran; note recorded` : `${card.id} rejected at ${card.stage}; note recorded`;
  return { card, gate: before.gate ?? card.stage, summary, lines: [nextHint(projectDir, card).replace('Next: run', 'Next: redo with')], exitCode: 0 };
}

// --- a stage run, its output file, and splitting a card -------------------------------------

/** `card run` / `POST /api/cards/:id/run`: the check, the agent when it fails, one advance. Returns at once. */
export function runCard(projectDir: string, ref: string, opts: { agent?: string } = {}): { runId: string; run: RunView } {
  const { record } = startCardRun(projectDir, ref, opts);
  return { runId: record.runId, run: getRun(projectDir, record.runId)! };
}

export const run = (projectDir: string, runId: string): RunView | undefined => getRun(projectDir, runId);

/** A card's activity, oldest first, from `after` (the last cursor a caller saw); `next` when more remain. */
export function cardActivity(projectDir: string, ref: string, opts: { after?: string; limit?: number } = {}): CardActivity {
  const found = findCard(readCards(projectDir).cards, ref);
  const card = found.id;
  const { items, next } = readActivity(projectDir, card, opts);
  // Each line is stamped with the phase the story was in when it was written, so a screen can
  // filter by phase without matching times against the journey itself.
  const windows = journeyOf(projectDir, found).steps.filter(s => s.enteredAt && (s.state === 'done' || s.state === 'current' || s.state === 'gate'));
  const phaseAt = (at: string) => [...windows].reverse().find(s => at >= s.enteredAt! && (s.state !== 'done' || !s.leftAt || at <= s.leftAt))?.id;
  return { card, lines: items.map(l => ({ ...l, phase: typeof l.stage === 'string' ? l.stage : phaseAt(l.at) })), next: next ?? null };
}

/** `GET /api/cards/:id/activity`: one page of the card's activity, oldest first; `next` is the cursor to pass as `after`, null at the end. */
export interface CardActivity {
  card: string;
  lines: ActivityEntry[];
  next: string | null;
}

/** Who holds each card right now: the session's label for people, its id for keys. */
export function holders(projectDir: string): Map<string, { agent: string; session: string }> {
  return new Map(activeSessions(projectDir).map(s => [s.card, { agent: s.label ?? s.session, session: s.session }] as const));
}
const holderOf = (projectDir: string, id: string) => holders(projectDir).get(id) ?? {};
export const runWait = (projectDir: string, runId: string): Promise<RunRecord> => waitRun(projectDir, runId);
export const runStream = (projectDir: string, runId: string, signal?: AbortSignal) => streamRun(projectDir, runId, signal);
export const runExists = (projectDir: string, runId: string): boolean => readRun(projectDir, runId) !== undefined;

export interface StageOutput {
  /** From the project root, as the lane names it with the card's values filled in. */
  path: string;
  /** null when the file does not exist yet. */
  text: string | null;
}

// The lane's output template is text from a file anyone can edit, so the path it yields is
// checked against the project root before anything is read or written through it.
function outputFile(projectDir: string, ref: string): { card: Card; path: string; file: string } {
  const card = findCard(readCards(projectDir).cards, ref);
  const stage = card.stage === DONE || card.stage === 'proposed' || card.stage === DROPPED ? undefined : loadLane(projectDir, card.lane).stages.find(s => s.id === card.stage);
  if (!stage) throw new RefusalError(`card ${card.id} is ${card.stage}; it has no stage output`);
  if (!stage.output) throw new RefusalError(`stage ${stage.id} of lane ${card.lane} names no output file`);
  const path = substitute(stage.output, card, { projectDir });
  const root = resolve(projectDir);
  const file = resolve(root, path);
  if (!file.startsWith(root + sep)) throw new RefusalError(`stage output "${path}" is outside the project`);
  return { card, path, file };
}

/** The current stage's output file: its path, and its text when it exists. */
export function stageOutput(projectDir: string, ref: string): StageOutput {
  const { path, file } = outputFile(projectDir, ref);
  return { path, text: existsSync(file) ? readFileSync(file, 'utf-8') : null };
}

/** Writes the current stage's output file, making its folders; the check is not run. */
export function writeStageOutput(projectDir: string, ref: string, text: string, who: Role = 'agent'): StageOutput {
  if (typeof text !== 'string') throw new RefusalError('text (the file contents) is required');
  const { card, path, file } = outputFile(projectDir, ref);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  recordEvent(projectDir, card.id, () => ({ action: 'output', actor: who, human: who !== 'agent', note: path }));
  return { path, text };
}

/** `card split`: one sibling per title in the same lane, feature, initiative and epic, each marked `split_from`. */
export function splitCard(projectDir: string, ref: string, titles: string[], who?: Role): { from: Card; cards: Card[]; hints: string[] } {
  const from = findCard(readCards(projectDir).cards, ref);
  const clean = (titles ?? []).map(t => (typeof t === 'string' ? t.trim() : '')).filter(Boolean);
  if (!clean.length) throw new RefusalError('titles (one per new card) are required');
  // Every title is checked before any card is made, so a bad third title does not leave two behind.
  for (const t of clean) storyFields(splitTicket(t).title, {});
  if (from.stage === DONE || from.stage === DROPPED) throw new RefusalError(`card ${from.id} is already ${from.stage}`);
  const lane = loadLane(projectDir, from.lane);
  const role = who ?? 'agent';
  const resume = inLane(from) ? from.stage : undefined;
  // The parent's slot passes to the first child and the rest wait in Up next holding none, so a
  // split never needs room the lane does not have. A lane already over its limit queues all of them.
  let firstStarts = resume !== undefined;
  if (firstStarts) {
    try { assertRoomInLane(readCards(projectDir).cards, lane, 1, [from.id]); } catch { firstStarts = false; }
  }
  const inherited = { initiative: from.initiative, epic: from.epic, feature: from.feature, metric: from.metric };
  if (inLane(from)) closeCardLib(projectDir, from.id, role, 'done', `split into ${clean.length} stories`, { structural: true });
  const parentResearch = from.spec ? join(projectDir, from.spec, 'research.md') : undefined;
  const cards = clean.map((t, i) => {
    const { title, ticket } = splitTicket(t);
    const fields = { ...storyFields(title, inherited), ...(ticket ?? from.ticket ? { ticket: ticket ?? from.ticket } : {}), split_from: from.id, ...(resume ? { start_stage: resume } : {}) };
    let card = i === 0 && firstStarts ? createCard(projectDir, { lane: from.lane, title, role, fields }) : queueCard(projectDir, { lane: from.lane, title, role, fields });
    if (card.stage !== QUEUED && resume && card.stage !== resume) card = placeCardLib(projectDir, card.id, resume, role, { structural: true, note: `split from ${from.id} at ${resume}` });
    if (usesSpec(lane)) {
      const { dir } = newSpec(projectDir, card.id, role);
      // Research was done once for the parent; each child starts from it instead of a blank page.
      if (parentResearch && existsSync(parentResearch)) writeFileSync(join(projectDir, dir, 'research.md'), readFileSync(parentResearch, 'utf-8'));
      card = findCard(readCards(projectDir).cards, card.id);
    }
    return card;
  });
  recordEvent(projectDir, from.id, () => ({ action: 'split', actor: role, human: who === 'owner' || who === 'reviewer', note: `into ${cards.map(c => c.id).join(', ')}` }));
  return { from, cards, hints: cards.map(c => (c.stage === QUEUED ? `Next: ${c.id} waits in Up next and starts when a slot opens.` : nextHint(projectDir, c))) };
}

// --- setup: what init detects, the skills index, where the project stands -------------------

export const detectSetup = (projectDir: string): ProjectDetection => detectProject(projectDir);

/** `adopt`: scans the dirs (default: the tool folders) and merges into the index; `replace` rebuilds it. */
export function adoptSkills(projectDir: string, opts: { from?: string[]; replace?: boolean } = {}): AdoptResult {
  const dirs = opts.from?.length ? opts.from : defaultSkillDirs(projectDir);
  return mergeSkillsIndex(projectDir, scanSkills(projectDir, dirs), { replace: opts.replace === true });
}

export interface SetupStatus {
  /** `.codeloop/config.yaml` exists. */
  initialised: boolean;
  lanes: number;
  skillsIndexed: number;
  agentsConfigured: number;
  agents: string[];
}

export function setupStatus(projectDir: string): SetupStatus {
  const agents = Object.keys(loadAgents(projectDir).agents);
  return {
    initialised: existsSync(join(projectDir, '.codeloop/config.yaml')),
    lanes: loadLanes(projectDir).length,
    skillsIndexed: loadSkillsIndex(projectDir)?.length ?? 0,
    agentsConfigured: agents.length,
    agents,
  };
}

/** The card by id or number, its current stage brief and the Next line. */
export function showCard(projectDir: string, ref: string): CardShow {
  const card = findCard(readCards(projectDir).cards, ref);
  const display = liveState(projectDir, card, openQuestions(projectDir, card).length);
  const lane = loadLane(projectDir, card.lane);
  const entered = lane.stages.some(x => x.id === card.stage) ? enteredAt(card.events ?? [], card.stage, lane.stages[0].id) : undefined;
  const spent = entered ? phaseTime(readAllActivity(projectDir, card.id), entered, Date.now()) : undefined;
  const time = spent ? { stage: card.stage, ...spent, text: `in ${card.stage} ${formatMinutes(spent.wallMinutes)}, working ${formatMinutes(spent.activeMinutes)}` } : undefined;
  return { card: { ...card, ...holderOf(projectDir, card.id), ...(display ? { display } : {}) }, ...(time ? { phaseTime: time } : {}), brief: stageBrief(projectDir, card), hint: [nextHint(projectDir, card), card.stage === SPLIT_BEFORE_STAGE ? storySizeProblem(projectDir, card) : undefined].filter(Boolean).join('\n'), tasks: storyTasks(projectDir, card), evidenceFiles: evidenceFiles(projectDir, card), commits: storyCommits(projectDir, card.id).slice(0, 20), ...(card.gate === 'stuck' ? { stuck: stuckExplanation(projectDir, card) } : {}) };
}

/** The stuck story's move button: to the step its shipped work shows, stopping before any gate. */
export function moveStuck(projectDir: string, ref: string, who: Role): { card: Card; hint: string } {
  const { card } = moveStuckLib(projectDir, ref, who);
  return { card, hint: nextHint(projectDir, card) };
}

/**
 * Cards as the store holds them, each with the version a later write can expect and its chain,
 * band and score; dropped proposals only with `all`. `initiative` and `epic` match the chain the
 * feature names, `band` and `feature` the derived fields.
 */
export async function listCards(projectDir: string, filter: CardListFilter = {}): Promise<ScoredRecord[]> {
  const store = openStore(projectDir);
  try {
    const { initiative, epic, ...rest } = filter;
    const scored = withChain(projectDir, (await store.cards.list()) as CardRecord[]);
    return listFilter(scored, rest).filter(c => (!initiative || c.initiative === initiative) && (!epic || c.epic === epic) && (!filter.feature || c.feature === filter.feature) && (!filter.band || c.band === filter.band.toUpperCase())) as ScoredRecord[];
  } finally {
    await store.close();
  }
}

export const migrateStoryFields = (projectDir: string): string[] => migrateStories(projectDir);

/** `card migrate-features`: sets `feature:` and the feature's `initiative` on each card the mapping names; refuses an unknown feature. */
export const migrateFeatureFields = (projectDir: string, mappingFile?: string): { changed: string[]; mapping: string } => migrateFeatures(projectDir, mappingFile);

// --- epics and features: the roadmap pages ---------------------------------------------------

export interface EpicInput {
  id: string;
  title: string;
  initiative: string;
  status?: string;
  goal?: string;
  body?: string;
}

export interface FeatureInput {
  id: string;
  title: string;
  initiative: string;
  epic?: string;
  status?: string;
  release?: string;
  rice?: Rice;
  body?: string;
}

async function withStore<T>(projectDir: string, fn: (store: Store) => Promise<T>): Promise<T> {
  const store = openStore(projectDir);
  try {
    return await fn(store);
  } finally {
    await store.close();
  }
}

/** `epic new`: refused when the page exists or the initiative has no page. */
export function newEpic(projectDir: string, input: EpicInput): Promise<Epic> {
  return withStore(projectDir, async store => {
    if (await store.epics.get(input.id)) throw new RefusalError(`epic "${input.id}" already exists`);
    if (!(await store.initiatives.get(input.initiative))) throw new RefusalError(`initiative "${input.initiative}" has no page under ${WIKI_DIR}/initiatives/`);
    return store.epics.put({ ...input, body: input.body ?? '' });
  });
}

/** `feature new`: refused when the page exists, or the initiative or epic it names has no page. */
export function newFeature(projectDir: string, input: FeatureInput): Promise<Feature> {
  return withStore(projectDir, async store => {
    if (await store.features.get(input.id)) throw new RefusalError(`feature "${input.id}" already exists`);
    if (!(await store.initiatives.get(input.initiative))) throw new RefusalError(`initiative "${input.initiative}" has no page under ${WIKI_DIR}/initiatives/`);
    if (input.epic && !(await store.epics.get(input.epic))) throw new RefusalError(`epic "${input.epic}" has no page under ${WIKI_DIR}/epics/`);
    return store.features.put({ ...input, body: input.body ?? '' });
  });
}

/** `feature score`: writes the rice block; the score itself is derived on every read. */
export function scoreFeature(projectDir: string, id: string, rice: Rice): Promise<Feature> {
  return withStore(projectDir, async store => {
    const found = await store.features.get(id);
    if (!found) throw new RefusalError(`feature "${id}" not found`);
    return store.features.put({ ...found, rice }, found.version);
  });
}

export const listEpics = (index: ProjectIndex): Promise<IndexedEpic[]> => index.epics.list();
export const epicTree = (index: ProjectIndex, id: string): Promise<EpicNode | undefined> => index.epics.tree(id);
export const listFeatures = (index: ProjectIndex): Promise<IndexedFeature[]> => index.features.list();
export const featureDetail = (index: ProjectIndex, id: string): Promise<FeatureNode | undefined> => index.features.detail(id);
export const initiativeTree = (index: ProjectIndex, id: string): Promise<InitiativeTree | undefined> => index.initiatives.tree(id);

export const brief = (projectDir: string, ref: string): string => buildBrief(projectDir, findCard(readCards(projectDir).cards, ref));

// --- questions ------------------------------------------------------------------------------

export function questions(projectDir: string, ref: string): { id: string; questions: Question[] } {
  const card = findCard(readCards(projectDir).cards, ref);
  return { id: card.id, questions: readQuestions(projectDir, card) };
}

export const ask = (projectDir: string, ref: string, items: Parameters<typeof addQuestions>[2], who: Role): { path: string; added: Question[] } => addQuestions(projectDir, ref, items, who);

export const answer = (projectDir: string, ref: string, n: number, reply: { text?: string; accept?: boolean; option?: string }, who: Role): Question => writeAnswer(projectDir, ref, n, reply, who);
/** Every open question's recommended answer, accepted in one write. The owner's decision, like any answer. */
export const acceptAll = (projectDir: string, ref: string, who: Role) => acceptAllAnswers(projectDir, ref, who);
/** A `## Rubric` block of `- Rn pending:` lines for the card's stage, added once. */
export const rubricScaffold = (projectDir: string, ref: string) => scaffoldRubric(projectDir, ref);

// --- inbox ----------------------------------------------------------------------------------

/** The inbox as `codeloop inbox` prints it, read from the engine's files; `sort` defaults to score. */
export const inboxReport = (projectDir: string, opts: { sort?: 'score' | 'age' } = {}): Inbox => buildInbox(projectDir, undefined, opts);
export const inboxSeen = (projectDir: string): void => markInboxSeen(projectDir);

/** The inbox as three capped, cursor-paged lists from the index; `shippedSince` defaults to the last `--seen`. */
export function inboxPaged(projectDir: string, index: ProjectIndex, q: InboxQuery = {}): Promise<InboxPayload> {
  return index.cards.inbox({ ...q, shippedSince: q.shippedSince?.trim() || readInboxSeen(projectDir) });
}

// --- wiki: the gotcha / decision / concept pages the engine injects --------------------------

export const wikiEntries = (projectDir: string): WikiEntry[] => listPages(projectDir);
export const wikiInject = (projectDir: string, files: string[]): WikiEntry[] => inject(projectDir, files);
export const wikiLint = (projectDir: string): ReturnType<typeof lintWiki> => lintWiki(projectDir);
/** Folds wiki page b into a: frequencies add, cards and scope join, b is removed. */
export const wikiMerge = (projectDir: string, a: string, b: string): WikiEntry => mergePages(projectDir, a, b);
/** Research mirror pages turned into decisions titled by the choice, or removed; the mapping says which. */
export const migrateDecisions = (projectDir: string, opts: { dryRun?: boolean } = {}): MigrationRow[] => migrateResearchDecisions(projectDir, opts);

// --- index-backed reads: what the board draws -----------------------------------------------

/** The query string's filters for the cards index: each facet key may repeat, `q` is full text; `needsMe=1` is read as `role`. */
export function cardFilter(query: Record<string, string[] | undefined> | URLSearchParams, role?: Role): CardFilter {
  const all = (k: string) => (query instanceof URLSearchParams ? query.getAll(k) : (query[k] ?? []));
  const filter: CardFilter = {};
  for (const key of CARD_FILTERS) {
    const values = all(key).flatMap(v => v.split(',')).map(v => v.trim()).filter(Boolean);
    if (values.length) filter[key] = values;
  }
  const q = all('q')[0]?.trim();
  if (q) filter.q = q;
  if (all('gate')[0] === 'waiting') filter.gate = 'waiting';
  if (all('questions')[0] === 'open') filter.questions = 'open';
  const since = all('shippedSince')[0]?.trim();
  if (since) filter.shippedSince = since;
  if (all('stuck')[0] === '1') filter.stuck = true;
  if (all('needsMe')[0] === '1' && role) filter.needsMe = role;
  if (all('sort')[0] === 'score') filter.sort = 'score';
  return filter;
}

/**
 * Cards, the lanes they move through and the inbox summary: everything the Cards view draws.
 * Cards come without their event logs unless `includeEvents`; `getCard` carries them. The
 * inbox's `needs_you` list rides along only with `includeInbox`: at 5k cards it is hundreds of
 * kB that the paged inbox serves on its own.
 */
export async function cardsPayload(index: ProjectIndex, owner: boolean, opts: { filter?: CardFilter; cursor?: string; limit?: number; includeEvents?: boolean; includeInbox?: boolean; facets?: boolean } = {}) {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 5000);
  const { items, nextCursor, total } = await index.cards.list(opts.filter, opts.cursor, limit);
  const lanes = await index.lanes.list();
  const inbox = await inboxPaged(index.projectDir, index, opts.includeInbox ? { limit: 5000 } : {});
  const cards = opts.includeEvents ? await Promise.all(items.map(async c => ({ ...c, events: await index.cards.events(c.id) }))) : items;
  return {
    version: index.cardsFileVersion,
    owner,
    cards,
    nextCursor,
    total,
    ...(opts.facets ? { facets: await index.cards.facets() } : {}),
    lanes: lanes.map(l => ({ id: l.id, version: l.version, stages: l.stages.map(s => ({ id: s.id, skill: s.skill, output: s.output, gate: s.gate })) })),
    inbox: { summary: inbox.summary, ...(opts.includeInbox ? { needs_you: inbox.needsYou.cards } : {}) },
  };
}

/** One card with its event log, by id or number; undefined when the board has no such card. */
export async function getCard(index: ProjectIndex, ref: string) {
  const card = await index.cards.get(ref);
  return card ? { ...card, events: await index.cards.events(card.id) } : undefined;
}

/** The page's path to the board's `/mocks/*` route. */
export { mockHref };

/** Everything the card screen shows at once: the card, its spec and tasks, questions, evidence, mock and wiki page. */
export async function cardFull(index: ProjectIndex, store: Store, ref: string): Promise<CardFull> {
  const { projectDir } = index;
  const card = findCard(readCards(projectDir).cards, ref);
  const indexed = await index.cards.get(card.id);
  let spec: CardFull['spec'] = null;
  let tasks: Task[] = [];
  const dir = indexed?.specDir;
  if (dir) {
    const file = join(projectDir, dir, 'spec.md');
    spec = { dir, text: existsSync(file) ? readFileSync(file, 'utf-8') : null };
    tasks = existsSync(join(projectDir, dir, 'tasks.md')) ? readTasks(projectDir, dir).tasks : [];
  }
  const mock = index.mockOf(card.id);
  const display = liveState(projectDir, card, index.openQuestions(card.id).length);
  const evidence = (await store.evidence.list()).find(e => e.cardId === card.id) ?? null;
  const page = (await store.pages.get(`${WIKI_DIR}/cards/${card.id}.md`)) ?? null;
  const journey = journeyOf(projectDir, card, { tasks, health: display?.health });
  const commits = storyCommits(projectDir, card.id);
  const stuck = stuckExplanation(projectDir, card, { commits });
  return {
    card: { ...card, ...holderOf(projectDir, card.id), ...(mock ? { mock: mockHref(mock) } : {}), openQuestions: index.openQuestions(card.id).length, display },
    spec,
    tasks,
    questions: readQuestions(projectDir, card),
    evidence,
    mock: mock ? mockHref(mock) : null,
    page,
    journey,
    rubric: rubricOf(projectDir, card.id),
    commits: commits.slice(0, 20),
    evidenceFiles: evidenceFiles(projectDir, card),
    summary: { ...summaryView(card, journey, stuck), ...(stuck ? { stuck } : {}) },
  };
}

/** `card summary`: the needed and done lines; an agent's write never replaces a person's line. */
export function saveSummary(projectDir: string, ref: string, input: { needed?: string; done?: string }, who: Role, by?: string) {
  return writeSummary(projectDir, ref, input, { by: by ?? who, kind: who === 'agent' ? 'agent' : 'person' });
}

function rubricOf(projectDir: string, id: string): CardFull['rubric'] {
  try {
    const report = evaluateRubric(projectDir, id);
    return report.rows.length ? { stage: report.stage, rows: report.rows, review: report.review } : null;
  } catch {
    // A card in a lane that no longer loads still opens; it has no rubric to show.
    return null;
  }
}

/** Text evidence comes with its contents; an image is a path the caller fetches itself. */
export async function evidenceDetail(projectDir: string, store: Store, nnn: string): Promise<EvidenceDetail | undefined> {
  const found = await store.evidence.get(nnn);
  if (!found) return undefined;
  return { ...found, files: found.files.map(f => (f.kind === 'md' || f.kind === 'json' || f.kind === 'txt' ? { ...f, content: readFileSync(join(projectDir, f.path), 'utf-8') } : f)) };
}

export const artifacts = async (index: ProjectIndex) => (await index.artifacts.list()).map(a => ({ ...a, href: mockHref(a.id) }));

export const stats = async (index: ProjectIndex): Promise<Stats> => computeStats(await index.cards.all(), await index.lanes.list());

/** What the board's "what next" panel shows: one state, with the data that state needs. */
export type NextAction =
  | { kind: 'empty' }
  | { kind: 'waiting'; type: 'gate'; card: { id: string; title: string }; gate: string; awaiting: string }
  | { kind: 'waiting'; type: 'question'; card: { id: string; title: string }; n: number; question: string; recommended?: string }
  | { kind: 'running'; card: { id: string; title: string }; stage: string; since: string }
  | { kind: 'idle'; card?: { id: string; title: string; band: Band } };

/**
 * Checked in order: no stories at all; a gate or question waiting on `role` (the first in pick
 * order); an agent run in progress; otherwise the first open story in pick order, if any.
 */
export async function nextAction(index: ProjectIndex, projectDir: string, role: Role): Promise<NextAction> {
  const { total } = await index.cards.list({}, undefined, 1);
  if (total === 0) return { kind: 'empty' };

  const { items: waiting } = await index.cards.list({ needsMe: role, sort: 'score' }, undefined, 1);
  const first = waiting[0];
  if (first) {
    const card = { id: first.id, title: first.title };
    if (first.gate && first.awaiting === role) return { kind: 'waiting', type: 'gate', card, gate: first.gate, awaiting: first.awaiting };
    const open = index.openQuestions(first.id)[0];
    if (open) return { kind: 'waiting', type: 'question', card, n: open.n, question: open.question, recommended: open.recommended || undefined };
  }

  const running = findRunningRun(projectDir);
  if (running) {
    const card = await index.cards.get(running.cardId);
    return { kind: 'running', card: { id: running.cardId, title: card?.title ?? running.cardId }, stage: running.stage, since: running.startedAt };
  }

  const { items } = await index.cards.list({ sort: 'score' }, undefined, 5000);
  const top = items.find(c => c.stage !== DONE && c.stage !== DROPPED && c.stage !== PROPOSED && !c.gate && c.openQuestions === 0);
  return { kind: 'idle', ...(top ? { card: { id: top.id, title: top.title, band: top.band } } : {}) };
}

// Anything that looks like a credential is left out of the public config, whatever config.yaml calls it.
const SECRET = /key|token|secret|password/i;
function withoutSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSecrets);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !SECRET.test(k)).map(([k, v]) => [k, withoutSecrets(v)]));
  return value;
}
export const publicConfig = async (store: Store): Promise<Config> => withoutSecrets(await store.config.all()) as Config;

/** The board sign-in user, never the hash. */
export const boardAuthUser = (projectDir: string): { user: string; isDefault: boolean } => {
  const { user, isDefault } = readBoardAuth(projectDir);
  return { user, isDefault };
};

/** What the app shell shows so two open boards never look the same: `project.name` from config, else the folder name; the path with the home directory shortened to `~`. */
export async function projectIdentity(store: Store, projectDir: string): Promise<{ name: string; path: string }> {
  const config = await store.config.all();
  const configName = (config as { project?: { name?: string } }).project?.name;
  const home = homedir();
  const path = projectDir === home ? '~' : projectDir.startsWith(`${home}/`) ? `~${projectDir.slice(home.length)}` : projectDir;
  return { name: configName?.trim() || basename(projectDir), path };
}

/**
 * Changes the board's sign-in user and/or password from Settings: refused without the current
 * password, so a signed-in-but-unattended tab cannot be used to lock the real owner out.
 */
export function changeBoardAuth(projectDir: string, input: { currentPassword: string; user?: string; newPassword?: string }): { user: string; isDefault: boolean } {
  const current = readBoardAuth(projectDir);
  if (!checkBoardPassword(current, input.currentPassword)) throw new RefusalError('current password is wrong');
  const written = writeBoardAuth(projectDir, { user: input.user, password: input.newPassword });
  return { user: written.user, isDefault: written.isDefault };
}

/** The page list carries no bodies; `q` is a full-text search and each hit carries an excerpt. */
export async function listPagesIndexed(index: ProjectIndex, filter: { folder?: string; q?: string } = {}, cursor?: string, limit?: number) {
  const { items, nextCursor, total } = await index.pages.list(filter, cursor, Math.min(Math.max(limit ?? 200, 1), 5000));
  return { pages: items, nextCursor, total };
}

export const getPage = (index: ProjectIndex, id: string) => index.pages.get(id);

/**
 * Create or replace a page with the version the editor read. The store refuses paths outside
 * wiki/ and specs/; a stale `expectVersion` is a ConflictError.
 */
export async function putPage(index: ProjectIndex, store: Store, id: string, write: PageWrite): Promise<{ page: WikiPage; created: boolean }> {
  if (typeof write.body !== 'string') throw new RefusalError('body (markdown text) is required');
  const existing = await store.pages.get(id);
  const page = await store.pages.put({ ...(existing ?? { id, folder: '', title: id }), id, frontmatter: write.frontmatter ?? existing?.frontmatter ?? {}, body: write.body }, write.expectVersion);
  await index.patch({ repo: 'pages', id });
  return { page, created: !existing };
}

/** False when there was no such page. */
export async function deletePage(index: ProjectIndex, store: Store, id: string): Promise<boolean> {
  if (!(await store.pages.get(id))) return false;
  await store.pages.remove(id);
  await index.patch({ repo: 'pages', id });
  return true;
}

export { ConflictError, RefusalError, DONE, resolveRole };
export type { Band, CardChain };

// --- wiki outline: the read the Setup screen and `wiki init --from-repo --dry-run` share --------
import { outlineSummary as wikiOutlineSummary, writeOutline as writeWikiOutlineLib, type OutlineSummary as WikiOutlineSummary, type WriteOutlineResult as WikiOutlineWriteResult } from './wiki-outline.js';
export const wikiOutline = (projectDir: string): WikiOutlineSummary[] => wikiOutlineSummary(projectDir);
/** `wiki init --from-repo --write`: no server route yet, so this is called from the local transport only. */
export const writeWikiOutline = (projectDir: string, opts: { force?: boolean } = {}): WikiOutlineWriteResult => writeWikiOutlineLib(projectDir, opts);
export type { WikiOutlineSummary, WikiOutlineWriteResult };

// --- wiki migrate: move scanner filler into reference/legacy/, never deleting -----------------
import { migrateWikiFiller, wikiShape as wikiShapeLib, type MigrateResult as WikiMigrateResult, type WikiShapeCount } from './wiki.js';
/** `wiki migrate [--dry-run]`: writes the project's files, so this is local-only, like `writeWikiOutline`. */
export const migrateWiki = (projectDir: string, opts: { dryRun?: boolean } = {}): WikiMigrateResult => migrateWikiFiller(projectDir, opts);
export type { WikiMigrateResult };

/** The wiki shape with page counts, for the home page and sidebar: one server read, pre-joined, instead of the UI grouping the raw page list itself. */
export const wikiShape = (projectDir: string): WikiShapeCount[] => wikiShapeLib(projectDir);
export type { WikiShapeCount };

// --- wiki build: refresh facts, start a card in the `wiki` lane, run it -------------------------
import { runDueWithAgent, type RunResult } from './run.js';
import { stalledBuilders } from './stall.js';

export interface WikiBuildResult {
  migrated: WikiMigrateResult;
  facts: WikiOutlineWriteResult;
  card: Card;
  hint: string;
  /** Absent when `--no-run` left the card for the owner to run by hand. */
  run?: RunResult;
}

/**
 * `codeloop wiki build`: moves scanner filler into `reference/legacy/` first (`codeloop wiki
 * migrate`), then refreshes `.codeloop/wiki/reference/` and `.codeloop/state/repo-facts.json`
 * (never `.codeloop/wiki/architecture/`, which only the architecture skill writes), starts a card
 * in the `wiki` lane, and, unless `opts.run` is false, runs it the same way `codeloop run --agent
 * --card <id>` would: `runDueWithAgent` with `filter.card` set to this one card alone, so the
 * lane's own `agent:` preference (or `agents.default`) decides which preset does the writing.
 */
export async function buildWiki(projectDir: string, opts: { agent?: string; run?: boolean } = {}, who?: Role): Promise<WikiBuildResult> {
  const migrated = migrateWikiFiller(projectDir);
  // Only the scanner's own reference pages are refreshed; hand-written pages elsewhere are written
  // once and left alone.
  const facts = writeWikiOutlineLib(projectDir, { forceUnder: `${WIKI_DIR}/reference/` });
  const { card, hint } = newCard(projectDir, { lane: 'wiki', title: 'Explain the architecture' }, who ?? 'agent');
  if (opts.run === false) return { migrated, facts, card, hint };
  const run = await runDueWithAgent(projectDir, { name: opts.agent }, undefined, { card: card.id });
  return { migrated, facts, card: findCard(readCards(projectDir).cards, card.id), hint, run };
}

// --- skill eval: `codeloop skill eval`, replaying a skill's fixtures against a headless agent ---
export { listSkillNames, loadSkillDef, runSkillEval } from './skill-eval.js';
export type { FixtureEvalResult, GradedLine, SkillDef, SkillEvalOptions, SkillEvalReport } from './skill-eval.js';

// --- board and home: one call per screen, already grouped by the six states ------------------

export interface BoardStory {
  id: string;
  title: string;
  lane: string;
  stage: string;
  display: StoryState;
  band?: string;
  score?: number;
  /** The card's own priority, which outranks its RICE band; absent when it has none. */
  priority?: string;
  /** A critical bug, which every column puts first. */
  bug?: boolean;
  epic?: string;
  feature?: string;
  initiative?: string;
  openQuestions: number;
  /** Who is working it right now, as a person reads it ("claude on dean-mbp, since 19:01"), when anyone is. */
  agent?: string;
  /** That session's id, for a key; never shown. */
  session?: string;
  /** The board row it sits in: waiting on a person, held by an agent, or queued for anyone. */
  holder: BoardRow;
  /** The one line under the title: the agent's last action, the failing check, or since when it waits. */
  lastActivity?: { text: string; at?: string };
  /** When it entered the phase it is in. */
  phaseSince?: string;
  /** Minutes of work and of waiting since `phaseSince`. */
  activeMinutes?: number;
  idleMinutes?: number;
  createdAt: string;
  updatedAt: string;
}

export type BoardRow = 'needs-you' | 'agent' | 'queued';

const storyRow = (c: IndexedCardRow, agents: Map<string, { agent: string; session: string }>, ctx?: { projectDir: string; card: Card; firstStage?: string }): BoardStory => {
  const held = agents.get(c.id);
  const health = c.display?.health;
  const holder: BoardRow = health === 'needs-you' || health === 'stuck' || c.display?.state === 'needs-you' ? 'needs-you' : held ? 'agent' : 'queued';
  const line = ctx ? storyLiveLine(ctx.projectDir, ctx.card, health) : undefined;
  const since = ctx?.firstStage ? enteredAt(ctx.card.events ?? [], ctx.card.stage, ctx.firstStage) : undefined;
  const time = since && ctx ? phaseTime(readAllActivity(ctx.projectDir, c.id), since, Date.now()) : undefined;
  return {
    id: c.id, title: c.title, lane: c.lane, stage: c.stage, display: c.display!, band: c.band, score: c.score,
    ...(c.priority ? { priority: c.priority } : {}), ...(c.bug ? { bug: true } : {}),
    epic: c.epic, feature: c.feature, initiative: c.initiative, openQuestions: c.openQuestions,
    ...held, holder, ...(line ? { lastActivity: line } : {}), ...(since ? { phaseSince: since } : {}), ...(time ? { activeMinutes: time.activeMinutes, idleMinutes: time.idleMinutes } : {}), createdAt: c.createdAt, updatedAt: c.updatedAt,
  };
};
type IndexedCardRow = Awaited<ReturnType<ProjectIndex['cards']['list']>>['items'][number];

/**
 * The story's state with its health, worked out now: health depends on the clock and on the last
 * activity line, which no index version tracks, so it is computed per request, not cached.
 */
export function liveState(projectDir: string, card: Card, openQuestions: number, now = Date.now(), held?: Set<string>): StoryState | undefined {
  const holding = held ?? new Set(activeSessions(projectDir).map(s => s.card));
  return storyState(card as Card & { release?: string }, openQuestions, { now, lastActivityAt: lastActivityAt(projectDir, card.id), held: holding.has(card.id), progressAt: () => progressSince(projectDir, card) });
}

async function storyRows(index: ProjectIndex, projectDir: string): Promise<BoardStory[]> {
  const agents = holders(projectDir);
  const { items } = await index.cards.list({}, undefined, 100_000);
  const raw = new Map(readCards(projectDir).cards.map(c => [c.id, c] as const));
  const now = Date.now();
  const held = new Set(activeSessions(projectDir).map(s => s.card));
  const firstStage = new Map<string, string | undefined>();
  const first = (lane: string) => {
    if (!firstStage.has(lane)) {
      try { firstStage.set(lane, loadLane(projectDir, lane).stages[0]?.id); } catch { firstStage.set(lane, undefined); }
    }
    return firstStage.get(lane);
  };
  return items
    .map(c => {
      const card = raw.get(c.id);
      const display = card ? liveState(projectDir, card, c.openQuestions, now, held) : c.display;
      return display ? storyRow({ ...c, display }, agents, card ? { projectDir, card, firstStage: first(card.lane) } : undefined) : undefined;
    })
    .filter((r): r is BoardStory => Boolean(r));
}

// The picks' order (features.ts pickOrder), so a column reads in the order work will be taken.
const byRank = (a: BoardStory, b: BoardStory) => pickOrder(a, b);
const newestFirst = (a: BoardStory, b: BoardStory) => b.updatedAt.localeCompare(a.updatedAt);

export interface BoardView {
  columns: { state: DisplayState; label: string; stories: BoardStory[] }[];
  backlog: number;
  upNext: { count: number; limit?: number };
  /** Every lane with a story on the board, for the picker, and the one shown. */
  lanes: { id: string; count: number }[];
  lane: string | null;
  /** The shown lane's journey: Up next, each phase in order, then Live this week. Each column holds its stories by row. */
  phases: BoardPhase[];
  /** Needs you, Agent, Queued, each with its count in the shown lane outside Live this week; a screen hides a row with none. */
  rows: { id: BoardRow; label: string; count: number }[];
  /** How many stories the board holds across every lane, backlog included: the one count every screen shows. */
  total: number;
  /** Those stories in board order (the shown lane's columns first, then the other lanes, then the backlog): the drawer pager's list. */
  ids: string[];
}

export interface BoardPhase {
  id: string;
  label: string;
  kind: 'up-next' | 'phase' | 'live';
  /** On a phase that waits for a person once its check passes. */
  gate?: string;
  count: number;
  cells: Record<BoardRow, BoardStory[]>;
}

const ROWS: { id: BoardRow; label: string }[] = [
  { id: 'needs-you', label: 'Needs you' },
  { id: 'agent', label: 'Agent' },
  { id: 'queued', label: 'Queued' },
];
const WEEK_MS = 7 * 86_400_000;

/**
 * The board: the shown lane's journey as columns (Up next, its phases, Live this week) and who holds
 * each story as rows. `columns` keeps the earlier four-state shape for callers that read it.
 */
export async function boardView(index: ProjectIndex, projectDir: string, opts: { lane?: string } = {}): Promise<BoardView> {
  const rows = await storyRows(index, projectDir);
  const of = (s: DisplayState) => rows.filter(r => r.display.state === s);
  const done = [...of('done'), ...of('shipped')].sort(newestFirst).slice(0, 30);
  const limit = (loadConfig(projectDir).board as { up_next?: { limit?: number } } | undefined)?.up_next?.limit;
  return {
    columns: [
      { state: 'up-next', label: STATE_LABELS['up-next'], stories: of('up-next').sort(byRank) },
      { state: 'in-progress', label: STATE_LABELS['in-progress'], stories: of('in-progress').sort(byRank) },
      { state: 'needs-you', label: STATE_LABELS['needs-you'], stories: of('needs-you').sort(byRank) },
      { state: 'done', label: STATE_LABELS.done, stories: done },
    ],
    backlog: of('backlog').length,
    upNext: { count: of('up-next').length, ...(limit ? { limit } : {}) },
    ...phaseBoard(projectDir, rows, opts.lane),
  };
}

function phaseBoard(projectDir: string, rows: BoardStory[], wanted?: string): Pick<BoardView, 'lanes' | 'lane' | 'phases' | 'rows' | 'total' | 'ids'> {
  const week = Date.now() - WEEK_MS;
  const live = (r: BoardStory) => (r.display.state === 'done' || r.display.state === 'shipped') && Date.parse(r.updatedAt) >= week;
  const active = (r: BoardStory) => r.display.state === 'up-next' || r.display.state === 'in-progress' || r.display.state === 'needs-you';
  const onBoard = rows.filter(r => active(r) || live(r));
  const backlog = rows.filter(r => r.display.state === 'backlog').sort(byRank);
  const counts = new Map<string, number>();
  for (const r of onBoard) counts.set(r.lane, (counts.get(r.lane) ?? 0) + 1);
  // The lane asked for, else the one with the most stories still moving.
  const moving = new Map<string, number>();
  for (const r of onBoard.filter(active)) moving.set(r.lane, (moving.get(r.lane) ?? 0) + 1);
  const lane = (wanted && counts.has(wanted) ? wanted : [...moving.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? [...counts.keys()][0]) ?? null;
  let stages: { id: string; gate?: { name: string } }[] = [];
  try { stages = lane ? loadLane(projectDir, lane).stages : []; } catch { stages = []; }
  const inLane = onBoard.filter(r => r.lane === lane);
  const cells = (stories: BoardStory[]) => Object.fromEntries(ROWS.map(row => [row.id, stories.filter(s => s.holder === row.id).sort(byRank)])) as Record<BoardRow, BoardStory[]>;
  const column = (id: string, label: string, kind: BoardPhase['kind'], stories: BoardStory[], gate?: string): BoardPhase => ({ id, label, kind, ...(gate ? { gate } : {}), count: stories.length, cells: cells(stories) });
  const phases: BoardPhase[] = [
    column('up-next', STATE_LABELS['up-next'], 'up-next', inLane.filter(r => r.display.state === 'up-next')),
    ...stages.map(s => column(s.id, s.id, 'phase', inLane.filter(r => (r.display.state === 'in-progress' || r.display.state === 'needs-you') && r.stage === s.id), s.gate?.name)),
    // Not 'live': a lane may name its own last phase that.
    column('live-this-week', 'Live this week', 'live', inLane.filter(live).sort(newestFirst)),
  ];
  const order = (p: BoardPhase[]) => p.flatMap(c => ROWS.flatMap(row => c.cells[row.id].map(s => s.id)));
  const shown = order(phases);
  const seen = new Set(shown);
  const others = onBoard.filter(r => !seen.has(r.id)).sort((a, b) => a.lane.localeCompare(b.lane) || byRank(a, b)).map(r => r.id);
  const ids = [...shown, ...others, ...backlog.map(r => r.id)];
  return {
    lanes: [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id, count]) => ({ id, count })),
    lane,
    phases,
    // Shipped stories are counted in their column, not in a holder row: nobody holds a finished story.
    rows: ROWS.map(row => ({ ...row, count: phases.filter(p => p.kind !== 'live').reduce((n, p) => n + p.cells[row.id].length, 0) })),
    total: ids.length,
    ids,
  };
}

/** One agent session on Home: its story and phase, its last activity line and whether it is still going. */
export interface AgentTile {
  session: string;
  label: string;
  card: string;
  title?: string;
  stage?: string;
  since: string;
  state: 'working' | 'stalled' | 'check failing' | 'idle' | 'stopped';
  /** Past the stall threshold with no activity: the monitor's call, with how long it has been quiet. */
  stalled: boolean;
  idleMinutes?: number;
  last?: { at: string; text: string };
}

export interface HomeView {
  summary: { needsYou: number; inProgress: number; failing: number; stale: number; stalled: number; shippedThisWeek: number; agentsWorking: number };
  needsYou: BoardStory[];
  failing: BoardStory[];
  /** No event and no activity for two days: park or drop. */
  stale: BoardStory[];
  inProgress: BoardStory[];
  agents: AgentTile[];
  shipped: BoardStory[];
  /** Present while `codeloop off` is in force for this project. */
  off?: { until: string | null; why: string };
}

/** Home: what needs you, what is failing, what is moving, which agents are working, what shipped. */
export async function homeView(index: ProjectIndex, projectDir: string): Promise<HomeView> {
  const off = readOff(projectDir);
  const rows = await storyRows(index, projectDir);
  const week = Date.now() - 7 * 86_400_000;
  const needsYou = rows.filter(r => r.display.state === 'needs-you').sort(byRank);
  const failing = rows.filter(r => r.display.health === 'failing').sort(newestFirst);
  const stale = rows.filter(r => r.display.health === 'stale').sort(newestFirst);
  const inProgress = rows.filter(r => r.display.state === 'in-progress').sort(byRank);
  const shipped = rows.filter(r => (r.display.state === 'done' || r.display.state === 'shipped') && Date.parse(r.updatedAt) >= week).sort(newestFirst);
  const stalledNow = new Map(stalledBuilders(projectDir).map(b => [b.session, b.idleMinutes]));
  const agents = activeSessions(projectDir).map((s): AgentTile => {
    const row = rows.find(r => r.id === s.card);
    const last = lastActivity(projectDir, s.card);
    const quiet = last ? Date.now() - Date.parse(last.at) : Date.now() - Date.parse(s.updatedAt);
    const stalled = stalledNow.has(s.session);
    const state: AgentTile['state'] = last?.kind === 'end' ? 'stopped' : stalled ? 'stalled' : last?.kind === 'check' && !last.pass ? 'check failing' : quiet > 10 * 60_000 ? 'idle' : 'working';
    return {
      session: s.session, label: s.label ?? s.session, card: s.card, title: row?.title, stage: row?.stage, since: s.startedAt, state, stalled,
      ...(stalled ? { idleMinutes: stalledNow.get(s.session) } : {}),
      ...(last ? { last: { at: last.at, text: activityText(last) } } : {}),
    };
  });
  return {
    summary: { needsYou: needsYou.length, inProgress: inProgress.length, failing: failing.length, stale: stale.length, stalled: stalledNow.size, shippedThisWeek: shipped.length, agentsWorking: agents.length },
    needsYou, failing, stale, inProgress, agents, shipped,
    ...(off ? { off: { until: off.until, why: off.why } } : {}),
  };
}

// --- monitor: what a session sees first --------------------------------------------------------

export interface MonitorItem {
  id: string;
  title: string;
  stage: string;
  /** The last failed check's last line, for a failing story. */
  lastCheck?: string;
  /** ISO time of the newest work on the story since its check failed: it is stuck or failing and still moving. */
  movingSince?: string;
  /** What to do next: the same hint `codeloop next` prints. */
  fix?: string;
}

export interface MonitorReport {
  summary: { needsYou: number; failing: number; stale: number; working: number };
  needsYou: MonitorItem[];
  failing: MonitorItem[];
  stale: MonitorItem[];
}

/**
 * The monitor every session starts with: what waits on a person, what is failing and how to fix
 * it, what is stale. Read straight from cards.json, so a hook does not need the index.
 */
export function monitorReport(projectDir: string, opts: { limit?: number; now?: number } = {}): MonitorReport {
  const limit = opts.limit ?? 5;
  const now = opts.now ?? Date.now();
  const held = new Set(activeSessions(projectDir).map(s => s.card));
  const rows = readCards(projectDir).cards
    .map(card => ({ card, state: liveState(projectDir, card, openQuestions(projectDir, card).length, now, held) }))
    .filter((r): r is { card: Card; state: StoryState } => Boolean(r.state?.health));
  const lastFail = (card: Card) => card.events.filter(e => e.action === 'fail' && e.stage === card.stage).at(-1)?.note?.split('\n').filter(Boolean).at(-1);
  const item = (card: Card, withFix = false): MonitorItem => {
    const check = lastFail(card);
    const moved = rows.find(r => r.card.id === card.id)?.state.movingAt;
    return { id: card.id, title: card.title, stage: card.stage, ...(check ? { lastCheck: check } : {}), ...(moved ? { movingSince: new Date(moved).toISOString() } : {}), ...(withFix ? { fix: nextHint(projectDir, card, check) } : {}) };
  };
  const newest = (a: { card: Card }, b: { card: Card }) => b.card.updatedAt.localeCompare(a.card.updatedAt);
  const of = (h: string) => rows.filter(r => r.state.health === h).sort(newest);
  const needsYou = [...of('needs-you'), ...of('stuck')];
  const failing = of('failing');
  const stale = of('stale');
  return {
    summary: { needsYou: needsYou.length, failing: failing.length, stale: stale.length, working: of('working').length },
    needsYou: needsYou.slice(0, limit).map(r => item(r.card, r.state.health === 'stuck')),
    failing: failing.slice(0, limit).map(r => item(r.card, true)),
    stale: stale.slice(0, limit).map(r => item(r.card)),
  };
}

const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** The monitor as the lines a session-start hook prints. */
export function monitorLines(report: MonitorReport): string[] {
  const { summary: s } = report;
  const lines = [`codeloop monitor: ${s.needsYou} waiting for you, ${s.failing} failing, ${s.stale} stale, ${s.working} working`];
  if (report.needsYou.length) {
    lines.push('Waiting for you:');
    for (const c of report.needsYou) {
      lines.push(`  ${c.id} ${c.title} (${c.stage}${c.fix ? ', stuck' : ''})${c.lastCheck && c.fix ? `: ${c.lastCheck}` : ''}${c.movingSince ? `, moving since ${hhmm(c.movingSince)}` : ''}`);
      if (c.fix) lines.push(`    ${c.fix}`);
    }
  }
  if (report.failing.length) {
    lines.push('Failing:');
    for (const c of report.failing) {
      lines.push(`  ${c.id} ${c.title} (${c.stage})${c.lastCheck ? `: ${c.lastCheck}` : ''}${c.movingSince ? `, moving since ${hhmm(c.movingSince)}` : ''}`);
      if (c.fix) lines.push(`    ${c.fix}`);
    }
  }
  if (report.stale.length) {
    lines.push('Stale, nothing for two days (park or drop):');
    for (const c of report.stale) lines.push(`  ${c.id} ${c.title} (${c.stage}): \`codeloop card park ${c.id}\` or \`codeloop card drop ${c.id} "<why>"\``);
  }
  return lines;
}
export { listHandbacks, recordHandback, type HandbackInput, type HandbackRecord } from './handback.js';
export { stalledBuilders, stalledLines, type StalledBuilder } from './stall.js';
export { listGates, runGate, type GateInput, type GateRecord } from './gate.js';
export { ensureStoryWorktree, mergeStory, removeStoryWorktree, type MergeResult, type StoryWorktree, type WorktreeOptions } from './worktree.js';

// --- the orchestrator ------------------------------------------------------------------------
export { orchRun, orchStatus, orchReport, orchTurn, orchView, readOrch, startOrch, orchResume, orchInbox } from './orch.js';
export type { OrchOptions, OrchRecord, OrchReport, OrchRunResult, OrchStarted, OrchStatusRow, OrchTurn, OrchView } from './orch.js';
