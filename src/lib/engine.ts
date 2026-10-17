import { evidenceOf, LEGACY_NOTICE, usecasesOf } from './paths.js';
import { specPath, workDir } from './project-root.js';
import { spawnSync } from 'child_process';
import { checkEnv } from './shell.js';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { createHash } from 'crypto';
import { appendFindings } from './competitors.js';
import { decisionFromResearch } from './wiki-rules.js';
import { capture } from './wiki.js';
import { clock } from './clock.js';
import { loadConfig } from './config.js';
import { appendActivity, readActivity, type ActivityEntry } from './activity.js';
import { currentSession } from './active-card.js';
import { cardKey, CARD_ID, ConflictError, DONE, DROPPED, enter, findCard, gateRefusal, inLane, nextCardId, PROPOSAL_GATE, PROPOSED, QUEUED, readCards, RefusalError, failedTimes, NOTHING_CHANGED, stageEntryIndex, writeCards, type Card, type CardEvent, type CardExtras, type Size, type StoryFields } from './cards.js';

export { RefusalError };
import { firstStage, loadLane, loadLanes, nextStage, skippedStages, skipReason, stageApplies, substitute, type Lane, type Stage } from './lane.js';
import { pathInPlan, planFiles } from './plan-scope.js';
import { skipUnchangedRerun } from './rerun-skip.js';
import { untouchedOutput } from './stage-scaffold.js';
import { SPLIT_BEFORE_STAGE, storySizeProblem } from './story-size.js';
// Domain logic for the shape workflow's on_done.queue: parses the approved breakdown and makes the
// epic page and build stories. Imported here the same way researchSummary and appendFindings are:
// engine.ts drives a stage's domain-specific side effect without owning its parsing.
import { queueBreakdown } from './shape.js';

export type Role = 'owner' | 'reviewer' | 'agent';

export interface EngineConfig {
  gatesMode: 'all' | 'trusted';
  gatesPerDay?: number;
  /** `lanes.auto_start: true`: a lane's `on_done.start` makes the follow-on card. Off, the line is only announced. */
  autoStart: boolean;
  /** `capacity.park_stuck_after_days`: a story stuck this long is parked back to the inbox by the next run. */
  parkStuckAfterDays?: number;
}

export type CardFields = StoryFields & CardExtras;

export function loadEngineConfig(projectDir: string): EngineConfig {
  const raw = loadConfig(projectDir);
  return {
    gatesMode: raw.gates?.mode === 'trusted' ? 'trusted' : 'all',
    gatesPerDay: raw.capacity?.gates_per_day,
    autoStart: raw.lanes?.auto_start === true,
    parkStuckAfterDays: typeof raw.capacity?.park_stuck_after_days === 'number' ? raw.capacity.park_stuck_after_days : undefined,
  };
}

// A person and their assistant share one account and one shell, so the environment cannot tell them
// apart (a `!` command typed in a Claude Code session has no TTY, exactly like the assistant's own
// tool call). The default is therefore the person. The assistant is kept out where its actions
// actually pass: `run --agent` marks the processes it starts (CODELOOP_AGENT_RUN), the MCP server
// acts as agent, and the `guard bash` hook refuses owner actions in the assistant's shell tool.
export function resolveRole(flag?: string): Role {
  const role = flag ?? process.env.CODELOOP_ROLE ?? (process.env.CODELOOP_AGENT_RUN ? 'agent' : 'owner');
  if (role !== 'owner' && role !== 'reviewer' && role !== 'agent') {
    throw new RefusalError(`unknown role "${role}" (owner, reviewer or agent)`);
  }
  // Set by `codeloop run --agent` on the process it starts, so `--as owner` typed by that agent is refused.
  if (process.env.CODELOOP_AGENT_RUN && role !== 'agent') {
    throw new RefusalError(`this process was started by \`codeloop run --agent\` and acts as agent; it cannot act as ${role}`);
  }
  return role;
}

/** `check-error`: the stage's check command itself crashed, so the work was never judged and no retry is spent. */
export type Outcome = 'moved' | 'parked' | 'done' | 'failed' | 'stuck' | 'unchanged' | 'check-error';

export interface AdvanceResult {
  card: Card;
  outcome: Outcome;
  output?: string;
  started: Card[];
  /** Per started card: `build.on_done` or `market.trigger lane.done`, whichever made it. */
  because: Record<string, string>;
}

interface Clock {
  now?: Date;
}

function event(now: Date, role: Role | 'engine' | 'orchestrator', action: string, stage?: string, note?: string): CardEvent {
  return {
    at: now.toISOString(),
    actor: role,
    human: role === 'owner' || role === 'reviewer',
    action,
    ...(stage ? { stage } : {}),
    ...(note ? { note } : {}),
  };
}

/**
 * HEAD, the changed tracked files and their changes, and the names of untracked files. An untracked
 * file counts by name only: a new file is new work, while a check rewriting its report or log in
 * the repo on every run keeps the same names. `.codeloop/` is left out, as the engine writes there
 * on every attempt. null outside a git repo.
 */
function treeState(projectDir: string): string | null {
  const git = (args: string[]) => spawnSync('git', [...args, '--', '.', ':(exclude).codeloop'], { cwd: projectDir, encoding: 'utf-8' });
  const status = git(['status', '--porcelain', '--untracked-files=no']);
  if (status.status !== 0) return null;
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: projectDir, encoding: 'utf-8' }).stdout;
  const untracked = git(['ls-files', '--others', '--exclude-standard']).stdout.split('\n').filter(Boolean).sort();
  return [head, status.stdout, git(['diff', 'HEAD']).stdout, ...untracked].join('\n');
}

function tail(text: string): string {
  return text.trimEnd().split('\n').slice(-20).join('\n').slice(-2000);
}

export function currentStage(lane: Lane, card: Card): Stage {
  const stage = lane.stages.find(s => s.id === card.stage);
  if (!stage) throw new RefusalError(`card ${card.id} is at stage "${card.stage}", which lane ${lane.id} v${lane.version} does not have`);
  return stage;
}

const DECISIONS = ['approve', 'auto-approve', 'reject', 'park'];

// The latest gate event for the stage decides: a park or a rejection after an approval withdraws it.
function approval(card: Card, stage: Stage): CardEvent | undefined {
  const last = card.events.filter(e => e.stage === stage.id && DECISIONS.includes(e.action)).at(-1);
  return last && (last.action === 'approve' || last.action === 'auto-approve') ? last : undefined;
}

const approved = (card: Card, stage: Stage) => approval(card, stage) !== undefined;

/**
 * The orchestrator's review pass may move a story only where no person's decision is skipped: a
 * story waiting at an approval gate, or any gated stage from `from` up to (not including) `to`
 * that has no approval, refuses. `stuck` is a retry count, not an approval, so it does not.
 */
export function reviewMoveRefusal(lane: Lane, card: Card, to: number): string | undefined {
  const from = lane.stages.findIndex(s => s.id === card.stage);
  if (from < 0 || to <= from) return `the review pass moves ${card.id} only forward from ${card.stage}`;
  if (card.gate && card.gate !== 'stuck') return `${card.id} waits at the ${card.gate} gate; the review pass never moves past a gate`;
  const gated = lane.stages.slice(from, to).find(s => s.gate && stageApplies(s, card) && !approved(card, s));
  return gated ? `the ${gated.gate!.name} gate at ${gated.id} lies between; the review pass never moves past a gate` : undefined;
}

/** What the review pass passes to placeCard or closeCard: the merged commits its move rests on. */
export interface ReviewMove {
  commits: string[];
}
const reviewNote = (note: string, review: ReviewMove) => `review pass: ${note} (commits ${review.commits.map(s => s.slice(0, 8)).join(', ')})`;

/** True for a public step nobody has approved yet: no work and no check may run for it. */
export const awaitsApproval = (card: Card, stage: Stage) => !!stage.gate?.outward && !approved(card, stage);

const STACK_FRAME = /^\s+at\s.+(?:\(.*\)|:\d+(?::\d+)?)\s*$/;

/**
 * A check passes with 0 and fails with any other exit up to 125. A killed command, an exit of 126 or
 * more, or a failing output that is a stack trace (two or more `at ...` frames led by an Error or a
 * bare trace and no message of the check's own) means the command crashed, for example a CLI rebuilt
 * while the run was using it.
 */
export function checkCrashed(status: number | null, output: string): boolean {
  if (status === 0) return false;
  // Killed, not found (127), not executable (126) or ended by a signal (128+): the command never
  // judged the work. Exits 2 to 125 are a check's own failures: grep and test exit 2 on a missing file.
  if (status === null || status >= 126) return true;
  const lines = output.split('\n').map(l => l.trimEnd()).filter(Boolean);
  if (lines.filter(l => STACK_FRAME.test(l)).length < 2) return false;
  // Node ends an uncaught exception with its version line; a check failing on purpose never prints
  // it. The echoed source line of an `-e` script would otherwise read as the check's own message.
  if (lines.some(l => /^Node\.js v\d+/.test(l))) return true;
  const message = lines.filter(l => !STACK_FRAME.test(l) && !/^(Node\.js v|node:|file:\/\/|\^+\s*$|\s*throw |\s*\^|\s*at )/.test(l) && !/^\w*(Error|Exception)\b/.test(l) && !/^\s*\{?\s*(code|errno|syscall|path):/.test(l) && !/^[{}]$/.test(l));
  return message.length === 0;
}

/** Runs the stage's done command without touching the card. null when the stage has no command. `crashed` carries the output tail when the command itself broke. */
export const CHECK_TIMEOUT_MS = 600_000;

export function runCheck(projectDir: string, card: Card, stage: Stage, work?: string, ref?: string, timeoutMs: number = CHECK_TIMEOUT_MS): { passed: boolean; output: string; crashed?: string } | null {
  if (!stage.done?.cmd) return null;
  // `work` is a story worktree whose branch holds work not yet merged: the command runs there and
  // reads the story's files from it, while the board stays under projectDir.
  // `ref` without `work`: a tree-mode story's commit range on the main tree's branch.
  const env = work ? { ...checkEnv(), CODELOOP_PROJECT_DIR: projectDir, CODELOOP_WORK_DIR: work, ...(ref ? { CODELOOP_STORY_REF: ref } : {}) } : ref ? { ...checkEnv(), CODELOOP_STORY_REF: ref } : checkEnv();
  const run = spawnSync(substitute(stage.done.cmd, card, { shell: true, projectDir }), { cwd: work ?? projectDir, shell: true, encoding: 'utf-8', timeout: timeoutMs, env, killSignal: 'SIGKILL' });
  const raw = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  // The legacy-layout notice is printed by every codeloop command the check runs; it says nothing about the story.
  const text = raw.split('\n').filter(l => l.trimEnd() !== LEGACY_NOTICE).join('\n');
  const output = tail(text);
  // No lane or stage setting bounds a check today, so every check gets the default; a timeout is a crash, not a verdict on the work.
  if ((run.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT') return { passed: false, output, crashed: `timed out after ${+(timeoutMs / 60_000).toFixed(2)} min` };
  const passed = run.status === 0;
  if (checkCrashed(run.status, raw)) return { passed, output, crashed: output };
  const fault = passed ? undefined : toolFault(card, raw, text, work);
  return { passed, output, ...(fault ? { crashed: fault } : {}) };
}

/**
 * A failure no story work can fix, said in one line: the check printed nothing but the
 * legacy-layout notice, or could not find its own card on the board it read (a worktree's
 * cards.json that does not hold the story).
 */
function toolFault(card: Card, raw: string, text: string, work?: string): string | undefined {
  if (!text.trim() && raw.includes(LEGACY_NOTICE)) return 'the check printed only the legacy-layout notice; `codeloop store move --layout dotfolder` ends it';
  const missing = [...text.matchAll(/^card "([^"]+)" not found\s*$/gm)].some(m => m[1] === card.id);
  if (missing) return `card ${card.id} is not on the board where the check ran${work ? ` (${work})` : ''}; no story work changes that`;
  return undefined;
}

/**
 * What an approval is bound to: the check's text and the stage's output file. A public step is
 * approved before its work exists, so only its check is bound.
 */
// Lines that record where and when a check ran, not what it found: a shared tree's HEAD moves as
// other stories commit, so binding an approval to them re-parks the card on every run.
const VOLATILE_LINE = /^(sha|commit|at|ran at|env|workspace):\s*\S.*$/gim;

/** Files under a folder, sorted, as relative paths. */
function filesUnder(root: string, rel: string): string[] {
  const abs = join(root, rel);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [rel];
  return readdirSync(abs).sort().flatMap(name => filesUnder(root, `${rel}/${name}`));
}

/**
 * What an approval covers: the check, the stage output with run-location lines removed, the card's
 * use cases, and the files its plan lists. A change to any of those asks the owner again; another
 * story's commit moving HEAD does not.
 */
function stageFingerprint(projectDir: string, card: Card, stage: Stage): string {
  const hash = createHash('sha1').update(stage.done?.cmd ?? stage.done?.event ?? '');
  const output = !stage.gate?.outward && stage.output ? specPath(projectDir, substitute(stage.output, card, { projectDir })) : null;
  if (output) hash.update('\0').update(existsSync(output) && statSync(output).isFile() ? readFileSync(output, 'utf-8').replace(VOLATILE_LINE, '') : 'missing');
  // The card's evidence folder is what verify writes on every run, so it is never part of what was approved.
  const evidence = `${evidenceOf(projectDir, cardKey(card))}/`;
  const owned = [...filesUnder(workDir(projectDir), usecasesOf(projectDir, cardKey(card))), ...(planFiles(projectDir, card) ?? []).filter(f => !/[*?]/.test(f)).flatMap(f => filesUnder(workDir(projectDir), f.replace(/\/$/, '')))]
    .filter(rel => !rel.startsWith(evidence));
  for (const rel of [...new Set(owned)].sort()) hash.update('\0').update(rel).update('\0').update(readFileSync(specPath(projectDir, rel)));
  return hash.digest('hex');
}

// What a research stage found about a competitor is copied to that competitor's wiki page, so the
// next card's research starts from it. Returns the pages that gained rows.
function researchFindings(projectDir: string, card: Card, stage: Stage): string[] {
  if (stage.id !== 'research' || !stage.output) return [];
  const file = specPath(projectDir, substitute(stage.output, card, { projectDir }));
  return existsSync(file) && statSync(file).isFile() ? appendFindings(projectDir, card, readFileSync(file, 'utf-8')) : [];
}

// The verdict, the exists call, the pain and the options outlive the card as a decision page, so
// the next card that touches the same ground starts from what was already decided.
// The research stage writes a decision only when research.md compared options and makes a valid
// one (wiki-rules.ts); `check wiki-landed` refuses the stage when options were compared and it cannot.
function researchDecision(projectDir: string, card: Card, stage: Stage, now: Date): string | null {
  if (stage.id !== 'research' || !stage.output) return null;
  const file = specPath(projectDir, substitute(stage.output, card, { projectDir }));
  if (!existsSync(file) || !statSync(file).isFile()) return null;
  const made = decisionFromResearch(projectDir, card, readFileSync(file, 'utf-8'));
  if (!made || made.problems.length) return null;
  return capture(projectDir, made.input, now).path;
}

function park(card: Card, stage: Stage, now: Date, when: string): void {
  card.gate = stage.gate!.name;
  card.awaiting = stage.gate!.approver;
  card.events.push(event(now, 'engine', 'park', stage.id, `gate ${stage.gate!.name} (${when})`));
}

// An outward stage changes something public, so its gate is asked on entry, before any work or check runs.
function parkIfOutward(card: Card, lane: Lane, now: Date): void {
  const stage = lane.stages.find(s => s.id === card.stage);
  if (stage && awaitsApproval(card, stage)) park(card, stage, now, 'before the stage runs');
}

// A stage whose `when:` does not hold for the card is recorded as skipped, with the reason, so the
// card's history says why it never ran research or spec.
function skipEvents(lane: Lane, from: Stage | undefined, to: Stage | undefined, card: { size?: string }, now: Date): CardEvent[] {
  return skippedStages(lane, from, to, card).map(s => event(now, 'engine', 'skip', s.id, skipReason(s, card)));
}

/** Why the card skips its lane's `stageId` stage, or undefined when it runs it (or the ref is not a card). */
export function skipsStage(projectDir: string, ref: string, stageId: string): string | undefined {
  const card = readCards(projectDir).cards.find(c => c.id === ref || cardKey(c) === ref);
  if (!card) return undefined;
  const stage = loadLane(projectDir, card.lane).stages.find(s => s.id === stageId);
  return stage && !stageApplies(stage, card) ? `${card.id} skips the ${stageId} stage (${skipReason(stage, card)})` : undefined;
}

function replace(cards: Card[], card: Card): Card[] {
  return cards.map(c => (c.id === card.id ? card : c));
}

function newCard(cards: Card[], lane: Lane, title: string, id: string, now: Date, actor: Role | 'engine', note?: string, fields: CardFields = {}): Card {
  if (lane.stages.length === 0) throw new RefusalError(`lane ${lane.id} has no stages`);
  // The id is substituted into shell commands and used in folder names, so its shape is fixed.
  if (!CARD_ID.test(id)) throw new RefusalError(`card id "${id}" must be letters, a dash and digits, like c-001 or CL-12`);
  if (cards.some(c => c.id === id)) throw new RefusalError(`card "${id}" already exists`);
  const entry = firstStage(lane, fields);
  const at = now.toISOString();
  const number = parseInt(id.replace(/\D/g, ''), 10);
  const shared = cards.some(c => parseInt(c.id.replace(/\D/g, '') || '-1', 10) === number);
  const card: Card = {
    id,
    // Two prefixes with one number would otherwise share specs/001, usecases/001 and evidence/001.
    ...(shared ? { key: id.toLowerCase() } : {}),
    title,
    ...fields,
    lane: lane.id,
    laneVersion: lane.version,
    stage: entry.id,
    retries: {},
    evidence: [],
    events: [event(now, actor, 'create', entry.id, note), ...skipEvents(lane, undefined, entry, fields ?? {}, now)],
    createdAt: at,
    updatedAt: at,
  };
  parkIfOutward(card, lane, now);
  return card;
}

/** Records a spec folder or an evidence path on a card. It never changes the stage or the gate. */
export function annotateCard(
  projectDir: string,
  id: string,
  patch: { spec?: string; evidence?: string },
  action: string,
  opts: { note?: string; role?: Role } & Clock = {},
): Card {
  const file = readCards(projectDir);
  const before = findCard(file.cards, id);
  const now = opts.now ?? clock();
  const card: Card = {
    ...before,
    ...(patch.spec ? { spec: patch.spec } : {}),
    evidence: patch.evidence && !before.evidence.includes(patch.evidence) ? [...before.evidence, patch.evidence] : before.evidence,
    events: [...before.events, event(now, opts.role ?? 'agent', action, before.stage, opts.note)],
    updatedAt: now.toISOString(),
  };
  writeCards(projectDir, file, replace(file.cards, card));
  return card;
}

/**
 * Appends one event to a card; it never changes the stage or the gate. `build` sees the board the
 * write is checked against, so a limit it enforces by throwing cannot be passed by two writers.
 */
export function recordEvent(
  projectDir: string,
  id: string,
  build: (cards: Card[], card: Card) => Pick<CardEvent, 'action'> & Partial<CardEvent>,
  now: Date = clock(),
): CardEvent {
  for (let attempt = 0; ; attempt++) {
    const file = readCards(projectDir);
    const before = findCard(file.cards, id);
    const made: CardEvent = { ...event(now, 'engine', '', before.stage), ...build(file.cards, before) };
    try {
      writeCards(projectDir, file, replace(file.cards, { ...before, events: [...before.events, made], updatedAt: now.toISOString() }));
      return made;
    } catch (e) {
      // Another process wrote between the read and the write; `build` has to see the new board.
      if (!(e instanceof ConflictError) || attempt >= 5) throw e;
    }
  }
}

/**
 * Parks a card at gate stuck for the owner. The stuck note is `reason` on its first line and the
 * check output below it (`output`, or the stage's last fail), the shape the retry cap writes too.
 * A card already at a gate is left as it is.
 */
export function markStuck(projectDir: string, id: string, reason: string, now: Date = clock(), output?: string): Card {
  for (let attempt = 0; ; attempt++) {
    const file = readCards(projectDir);
    const before = findCard(file.cards, id);
    if (before.gate) return before;
    const tail = output ?? before.events.filter(e => e.action === 'fail' && e.stage === before.stage).at(-1)?.note;
    const card: Card = { ...before, gate: 'stuck', awaiting: 'owner', events: [...before.events, event(now, 'engine', 'stuck', before.stage, tail ? `${reason}\n${tail}` : reason)], updatedAt: now.toISOString() };
    try {
      writeCards(projectDir, file, replace(file.cards, card));
      return card;
    } catch (e) {
      if (!(e instanceof ConflictError) || attempt >= 5) throw e;
    }
  }
}

/**
 * Cards for work that already exists elsewhere (Spec Kit, BMAD). They are an inventory, so the
 * wip limit does not apply and each lands at the stage its source status maps to.
 */
export function importCards(
  projectDir: string,
  items: { lane: string; title: string; stage?: string; note: string; spec: (id: string) => string }[],
  now: Date = clock(),
): Card[] {
  const file = readCards(projectDir);
  let cards = file.cards;
  const made: Card[] = [];
  for (const item of items) {
    const lane = loadLane(projectDir, item.lane);
    const card = newCard(cards, lane, item.title, nextCardId(cards), now, 'engine');
    const stage = item.stage === DONE || lane.stages.some(s => s.id === item.stage) ? item.stage! : card.stage;
    const { gate: _gate, awaiting: _awaiting, ...rest } = card;
    const placed: Card = { ...rest, stage, spec: item.spec(card.id), events: [event(now, 'engine', 'import', stage, item.note)] };
    made.push(placed);
    cards = [...cards, placed];
  }
  if (made.length) writeCards(projectDir, file, cards);
  return made;
}

/** Started work that is parked at a gate. Proposals are not started work, so they do not use up capacity.gates_per_day. */
export const waitingOnOwner = (cards: Card[]) => cards.filter(c => c.gate && c.stage !== PROPOSED).length;

/**
 * A card that waits for the owner before it enters its lane: `approve` promotes it to the first
 * stage, `reject` drops it. Nothing starts it. With `dedupe`, a second proposal made from the same
 * finding returns the first card instead of creating another.
 */
export function proposeCard(
  projectDir: string,
  input: { lane: string; title: string; id?: string; description?: string; source?: string; dedupe?: string; role?: Role | 'engine'; fields?: CardFields } & Clock,
): { card: Card; created: boolean } {
  const lane = loadLane(projectDir, input.lane);
  if (lane.stages.length === 0) throw new RefusalError(`lane ${lane.id} has no stages`);
  const now = input.now ?? clock();
  for (let attempt = 0; ; attempt++) {
    const file = readCards(projectDir);
    const known = input.dedupe ? file.cards.find(c => c.dedupe === input.dedupe) : undefined;
    if (known) return { card: known, created: false };
    const at = now.toISOString();
    const id = input.id ?? nextCardId(file.cards);
    if (!CARD_ID.test(id)) throw new RefusalError(`card id "${id}" must be letters, a dash and digits, like c-001 or CL-12`);
    if (file.cards.some(c => c.id === id)) throw new RefusalError(`card "${id}" already exists`);
    const card: Card = {
      id,
      title: input.title,
      ...input.fields,
      lane: lane.id,
      laneVersion: lane.version,
      stage: PROPOSED,
      ...(input.description ? { description: input.description } : {}),
      ...(input.source ? { source: input.source } : {}),
      ...(input.dedupe ? { dedupe: input.dedupe } : {}),
      gate: PROPOSAL_GATE,
      awaiting: 'owner',
      retries: {},
      evidence: [],
      events: [event(now, input.role ?? 'agent', 'propose', PROPOSED, input.source)],
      createdAt: at,
      updatedAt: at,
    };
    try {
      writeCards(projectDir, file, [...file.cards, card]);
      return { card, created: true };
    } catch (e) {
      // A proposal depends on nothing else on the board, so it is made again on the newer one.
      if (!(e instanceof ConflictError) || attempt >= 5) throw e;
    }
  }
}

/**
 * Refuses when `adding` more cards would put the lane over its wip, naming the cards that hold the
 * slots and the commands that free one, so the refusal is a way forward rather than a dead end.
 */
/** In the lane and not waiting on a person: the stories a lane's wip counts. */
export const workable = (c: Card) => inLane(c) && !c.gate;

/**
 * Holds one of the lane's wip slots. A trivial story does not: it skips research and spec and runs
 * in one sitting, so making it wait behind M stories turns a small ask into a refusal.
 */
export const holdsSlot = (c: Card) => workable(c) && c.size !== 'trivial';

export function assertRoomInLane(cards: Card[], lane: { id: string; wip?: number }, adding: number, freeing: string[] = [], size?: string): void {
  if (lane.wip === undefined || size === 'trivial') return;
  // Only stories an agent can work hold a slot: one waiting at a gate or stuck is waiting on the
  // person, and that queue has its own cap (capacity.gates_per_day).
  const holding = cards.filter(c => c.lane === lane.id && holdsSlot(c) && !freeing.includes(c.id));
  if (holding.length + adding <= lane.wip) return;
  const list = holding.map(c => `${c.id} (${c.stage}${c.gate ? `, ${c.gate}` : ''}) ${c.title}`).join('; ');
  throw new RefusalError(
    `lane ${lane.id} works on ${lane.wip} card${lane.wip === 1 ? '' : 's'} at a time${adding > 1 ? `, this needs ${adding} slots,` : ''} and ${holding.length} ${holding.length === 1 ? 'holds a slot' : 'hold the slots'}: ${list || 'none'}. ` +
      `Free one with \`codeloop card done <id>\` or \`codeloop card drop <id> "<why>"\`, or raise \`wip\` in .codeloop/lanes/${lane.id}.yaml.`,
  );
}

/**
 * Ends a card: `done` (its work is finished) or `dropped` (not doing it). Either frees its lane
 * slot; stage, outputs and events are kept. Only the owner or reviewer may end a card.
 */
export function closeCard(projectDir: string, id: string, role: Role, outcome: 'done' | 'dropped', note?: string, opts: { structural?: boolean; review?: ReviewMove } & Clock = {}): Card {
  if (opts.review) return reviewClose(projectDir, id, note ?? 'merged and verified', opts.review, opts);
  if (!opts.structural && role === 'agent') throw new RefusalError(`ending a card is the owner's decision; ask them to run \`codeloop card ${outcome === 'done' ? 'done' : 'drop'} ${id}\``);
  if (outcome === 'dropped' && !note?.trim()) throw new RefusalError('say why it is dropped: `codeloop card drop <id> "<why>"`');
  const file = readCards(projectDir);
  const before = findCard(file.cards, id);
  if (!inLane(before) && before.stage !== PROPOSED && before.stage !== QUEUED) throw new RefusalError(`card ${before.id} is already ${before.stage}`);
  const now = opts.now ?? clock();
  const { gate: _gate, awaiting: _awaiting, ...rest } = before;
  const card: Card = {
    ...rest,
    stage: outcome === 'done' ? DONE : DROPPED,
    events: [...before.events, event(now, role, outcome === 'done' ? 'close' : 'drop', before.stage, note?.trim())],
    updatedAt: now.toISOString(),
  };
  writeCards(projectDir, file, file.cards.map(c => (c.id === before.id ? card : c)));
  return card;
}

// A review-pass close: only `done`, and only when every gated stage left on the lane is approved.
function reviewClose(projectDir: string, id: string, note: string, review: ReviewMove, opts: Clock): Card {
  const file = readCards(projectDir);
  const before = findCard(file.cards, id);
  if (!inLane(before)) throw new RefusalError(`card ${before.id} is ${before.stage}, not in a lane`);
  const lane = loadLane(projectDir, before.lane);
  const why = reviewMoveRefusal(lane, before, lane.stages.length);
  if (why) throw new RefusalError(why);
  const now = opts.now ?? clock();
  const { gate: _gate, awaiting: _awaiting, ...rest } = before;
  const card: Card = { ...rest, stage: DONE, events: [...before.events, event(now, 'orchestrator', 'close', before.stage, reviewNote(note, review))], updatedAt: now.toISOString() };
  writeCards(projectDir, file, file.cards.map(c => (c.id === before.id ? card : c)));
  return card;
}

/**
 * Moves a card out of its lane and back to the owner's inbox as a proposal, keeping where it was:
 * approving it returns it to that stage. Frees the lane slot a stuck or stale card was holding.
 */
export function parkCard(projectDir: string, id: string, role: Role, note?: string, opts: Clock = {}): Card {
  if (role === 'agent') throw new RefusalError(`parking a card is the owner's decision; ask them to run \`codeloop card park ${id}\``);
  const file = readCards(projectDir);
  const before = findCard(file.cards, id);
  if (!inLane(before)) throw new RefusalError(`card ${before.id} is ${before.stage}, not in a lane; only an active card can be parked`);
  const now = opts.now ?? clock();
  const { gate: _gate, awaiting: _awaiting, ...rest } = before;
  const card: Card = { ...rest, stage: PROPOSED, gate: PROPOSAL_GATE, awaiting: 'owner', parked_from: before.stage, events: [...before.events, event(now, role, 'park', before.stage, note?.trim())], updatedAt: now.toISOString() };
  writeCards(projectDir, file, file.cards.map(c => (c.id === before.id ? card : c)));
  return card;
}

/**
 * Parks every story stuck longer than `capacity.park_stuck_after_days`, so a story nobody is
 * fixing goes back to the owner's inbox (with where it was) instead of sitting on the board.
 * Run by `codeloop run`; returns the ids it parked.
 */
export function parkStuck(projectDir: string, opts: Clock = {}): string[] {
  const days = loadEngineConfig(projectDir).parkStuckAfterDays;
  if (days === undefined) return [];
  const now = opts.now ?? clock();
  const file = readCards(projectDir);
  const parked: string[] = [];
  const cards = file.cards.map(c => {
    if (c.gate !== 'stuck' || !inLane(c)) return c;
    const since = c.events.filter(e => e.action === 'stuck').at(-1)?.at ?? c.updatedAt;
    if (now.getTime() - new Date(since).getTime() < days * 86_400_000) return c;
    parked.push(c.id);
    const { gate: _gate, awaiting: _awaiting, ...rest } = c;
    return { ...rest, stage: PROPOSED, gate: PROPOSAL_GATE, awaiting: 'owner', parked_from: c.stage, events: [...c.events, event(now, 'engine', 'park', c.stage, `stuck for more than ${days} day${days === 1 ? '' : 's'}`)], updatedAt: now.toISOString() } as Card;
  });
  if (parked.length) writeCards(projectDir, file, cards);
  return parked;
}

/**
 * A trivial card whose diff outgrew the trivial cap is not trivial: it becomes S and parks at the
 * first gate of its lane's ceremony (the spec gate), where the owner decides what to write up.
 */
export function resizeTrivial(projectDir: string, id: string, why: string, opts: Clock = {}): Card {
  const file = readCards(projectDir);
  const before = findCard(file.cards, id);
  if (before.size !== 'trivial') return before;
  const lane = loadLane(projectDir, before.lane);
  const here = lane.stages.findIndex(x => x.id === before.stage);
  const gatedFor = (size: Size) => lane.stages.find((s, i) => s.gate && i < here && stageApplies(s, { size }));
  // The smallest size that runs a gate the card has already passed, so the grown card stops there;
  // a fixed S would stop nowhere on a lane whose ceremony stages run only for M and up.
  const size = (['S', 'M', 'L'] as const).find(z => gatedFor(z)) ?? 'S';
  const gated = gatedFor(size);
  const now = opts.now ?? clock();
  const card: Card = { ...before, size, retries: { ...before.retries }, events: [...before.events, event(now, 'engine', 'resize', before.stage, `trivial to ${size}: ${why}`)], updatedAt: now.toISOString() };
  if (gated) {
    card.stage = gated.id;
    card.retries[gated.id] = 0;
    park(card, gated, now, 'the trivial diff cap was exceeded');
  }
  writeCards(projectDir, file, replace(file.cards, card));
  return card;
}

/** Puts a just-created card at a later stage of its lane, for work already under way: the owner's call. */
export function placeCard(projectDir: string, id: string, stage: string, role: Role, opts: Clock & { note?: string; structural?: boolean; review?: ReviewMove } = {}): Card {
  // A split carries its parent's stage over; the decision was the split, which any role may make.
  // The review pass may place too, bounded by reviewMoveRefusal instead of the gate check below.
  if (role === 'agent' && !opts.structural && !opts.review) throw new RefusalError('starting a card past the first stage is the owner\'s decision');
  const file = readCards(projectDir);
  const before = findCard(file.cards, id);
  const lane = loadLane(projectDir, before.lane);
  if (!lane.stages.some(s => s.id === stage)) throw new RefusalError(`lane ${lane.id} has no stage "${stage}" (stages: ${lane.stages.map(s => s.id).join(', ')})`);
  // An approval or a stuck count belongs to the stage it was given at; placing past it would carry it to the new one.
  // A card made at an outward first stage parks at that stage's entry gate on creation. Until
  // anything has run, that gate decides nothing yet, so placing the card past it is allowed.
  const first = firstStage(lane, before);
  const onlyEntryGate = before.stage === first.id && !!first.gate?.outward && before.gate === first.gate.name && before.events.every(e => ['create', 'skip', 'park'].includes(e.action));
  const waiting = opts.review ? reviewMoveRefusal(lane, before, lane.stages.findIndex(s => s.id === stage)) : onlyEntryGate ? undefined : gateRefusal(before);
  if (waiting) throw new RefusalError(waiting);
  if (stage === SPLIT_BEFORE_STAGE) {
    const problem = storySizeProblem(projectDir, before);
    if (problem) throw new RefusalError(problem);
  }
  const now = opts.now ?? clock();
  const note = opts.note ?? `started at ${stage}: work already under way`;
  const card: Card = { ...enter(before, stage), events: [...before.events, opts.review ? event(now, 'orchestrator', 'place', stage, reviewNote(note, opts.review)) : event(now, role, 'place', stage, note)], updatedAt: now.toISOString() };
  parkIfOutward(card, lane, now);
  writeCards(projectDir, file, file.cards.map(c => (c.id === before.id ? card : c)));
  return card;
}

export function createCard(
  projectDir: string,
  input: { lane: string; title: string; id?: string; role?: Role; note?: string; fields?: CardFields } & Clock,
): Card {
  const lane = loadLane(projectDir, input.lane);
  const file = readCards(projectDir);
  const config = loadEngineConfig(projectDir);

  const parked = waitingOnOwner(file.cards);
  if (config.gatesPerDay !== undefined && parked >= config.gatesPerDay) {
    throw new RefusalError(`${parked} ${parked === 1 ? 'card is' : 'cards are'} waiting on you (capacity.gates_per_day is ${config.gatesPerDay}); clear the inbox before starting new work`);
  }
  assertRoomInLane(file.cards, lane, 1, [], input.fields?.size);

  const card = newCard(file.cards, lane, input.title, input.id ?? nextCardId(file.cards), input.now ?? clock(), input.role ?? 'agent', input.note, input.fields);
  writeCards(projectDir, file, [...file.cards, card]);
  return card;
}

/**
 * A card made directly at `QUEUED`: it holds no lane slot (`inLane` excludes it), so it is never
 * subject to wip. `promoteQueued` moves it into the lane's first stage once it is ready. Used by
 * the shape workflow's on_done.queue to make every story after the first, which must wait for the
 * one before it regardless of wip, and to make the first one too when wip refused it outright.
 */
export function queueCard(
  projectDir: string,
  input: { lane: string; title: string; id?: string; role?: Role | 'engine'; note?: string; fields?: CardFields } & Clock,
): Card {
  const lane = loadLane(projectDir, input.lane);
  if (lane.stages.length === 0) throw new RefusalError(`lane ${lane.id} has no stages`);
  const now = input.now ?? clock();
  const file = readCards(projectDir);
  const id = input.id ?? nextCardId(file.cards);
  if (!CARD_ID.test(id)) throw new RefusalError(`card id "${id}" must be letters, a dash and digits, like c-001 or CL-12`);
  if (file.cards.some(c => c.id === id)) throw new RefusalError(`card "${id}" already exists`);
  const at = now.toISOString();
  const card: Card = {
    id,
    title: input.title,
    ...input.fields,
    lane: lane.id,
    laneVersion: lane.version,
    stage: QUEUED,
    retries: {},
    evidence: [],
    events: [event(now, input.role ?? 'agent', 'queue', QUEUED, input.note)],
    createdAt: at,
    updatedAt: at,
  };
  writeCards(projectDir, file, [...file.cards, card]);
  return card;
}

/**
 * Promotes every queued card that is ready: its `after` card (if it has one) is `done`, and its
 * lane has room under wip. Only `codeloop run` calls this (src/lib/run.ts) — nothing else promotes
 * a queued card, because the owner's approval of the plan that queued it is the only approval it needs.
 */
export function promoteQueued(projectDir: string, opts: { lane?: string } & Clock = {}): Card[] {
  const now = opts.now ?? clock();
  const promoted: Card[] = [];
  // Each iteration promotes at most one card, so a lane's wip is re-checked fresh after every
  // promotion instead of being computed once against a board that is about to change under it.
  for (let i = 0; i < 1000; i++) {
    const file = readCards(projectDir);
    const ready = file.cards.find(c => {
      if (c.stage !== QUEUED) return false;
      if (opts.lane && c.lane !== opts.lane) return false;
      if (c.after && file.cards.find(p => p.id === c.after)?.stage !== DONE) return false;
      const lane = loadLane(projectDir, c.lane);
      const active = file.cards.filter(x => x.lane === c.lane && holdsSlot(x)).length;
      return lane.wip === undefined || c.size === 'trivial' || active < lane.wip;
    });
    if (!ready) break;
    const lane = loadLane(projectDir, ready.lane);
    const entry = lane.stages.find(s => s.id === ready.start_stage) ?? firstStage(lane, ready);
    const card: Card = {
      ...ready,
      stage: entry.id,
      laneVersion: lane.version,
      events: [...ready.events, event(now, 'engine', 'promote', entry.id, `queue: ${ready.after ? `after ${ready.after} reached done` : 'wip opened up'}`), ...(ready.start_stage ? [] : skipEvents(lane, undefined, entry, ready, now))],
      updatedAt: now.toISOString(),
    };
    parkIfOutward(card, lane, now);
    writeCards(projectDir, file, replace(file.cards, card));
    promoted.push(card);
  }
  return promoted;
}

// Activity lines that are someone working on the story: a session's edits, commands, prompts and
// commits (the guard hooks), an edit from the app, a hand-back, a merge. Engine, doctor and orch
// lines, a lane upgrade or a sweep are not.
const WORK_LINES = new Set(['edit', 'story-edit', 'cmd', 'prompt', 'commit', 'handback', 'merge']);

/** True when a work line sits on the card's activity after its last check line (or there is no check line). */
function workSinceLastCheck(projectDir: string, id: string): boolean {
  const items: ActivityEntry[] = [];
  for (let page = readActivity(projectDir, id, { limit: 1000 }); ; page = readActivity(projectDir, id, { after: page.next, limit: 1000 })) {
    items.push(...page.items);
    if (!page.next) break;
  }
  const lastCheck = items.map(i => i.kind).lastIndexOf('check');
  // A session's own `codeloop next` or `card check` writes a cmd line just before the check it runs.
  return items.slice(lastCheck + 1).some(i => WORK_LINES.has(i.kind) && !(i.kind === 'cmd' && /^(npx )?codeloop\b/.test(String(i.text ?? ''))));
}

/** HEAD of the project's git repo, or undefined outside one. */
export function headCommit(projectDir: string): string | undefined {
  const run = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: projectDir, encoding: 'utf-8' });
  return run.status === 0 ? run.stdout.trim() || undefined : undefined;
}

/**
 * What the stage's work is now, as a hash: the output file, or for a stage with none the working
 * tree. The check's own output is no guide (test runners print timings); outside a git repo there
 * is no tree to read, and `outside` stands in.
 */
export function workFingerprint(projectDir: string, card: Card, stage: Stage, outside = 'no tree'): string {
  const stageOutput = stage.output ? specPath(projectDir, substitute(stage.output, card, { projectDir })) : null;
  const work = stageOutput ? (existsSync(stageOutput) && statSync(stageOutput).isFile() ? readFileSync(stageOutput) : 'missing') : treeState(projectDir) ?? outside;
  return createHash('sha1').update(work).digest('hex');
}

/*
 * Retries, restarts and stuck: one model, applied here (advanceCard), in run.ts (agentStep,
 * doctorTick) and in journey.ts (storyLiveLine).
 * 1. Every failed check writes a fail event, counted or not, at the cap or not.
 * 2. A failure counts toward lane.retries only when work was tried since the last counted failure
 *    of the stage (or, for the first, since the card entered the stage): an agent run, a person's
 *    work line, a commit that is work on this card (commitsWorkOn), or a stage output that differs
 *    from the last counted failure's and is neither missing nor the bare template. On a stage with
 *    no output file, tree changes alone never count.
 * 3. A failing stage is failing for the inbox, the doctor and run whether or not the failure
 *    counted (states.ts reads fail events, not retries). The doctor and `run --agent` start an agent
 *    on it within the start limits (wip, gates_per_day, max_runs_per_day, run budget, memory).
 * 4. No restart while head and work are unchanged since the last agent start. When that refusal
 *    meets a failed check, the card parks stuck with NOTHING_CHANGED (a crashed check: CHECK_CRASHED),
 *    and the check is not rerun until something the check can see changes (rerun-skip.ts).
 * 5. At lane.retries counted failures the card parks stuck with failedTimes(n) as the reason.
 * 6. Owner approve on stuck clears the gate and the counts and writes `unstick`, which allows one
 *    agent start even on unchanged work; the next start on unchanged work is refused again (4).
 * 7. The stuck event's first note line is the reason; stuckReason reads it for the story page.
 */

/** The stage's last counted failure since the card entered it, or undefined. A fail event older than the counted flag counts as counted. */
function lastCountedFail(card: Card, stage: string): CardEvent | undefined {
  const events = card.events ?? [];
  return events.slice(stageEntryIndex(events, stage) + 1).filter(e => e.stage === stage && e.action === 'fail' && e.counted !== false).at(-1);
}

function workTried(card: Card, stage: Stage, opts: { workLines: boolean; fingerprint: string; head?: string; untouched: boolean; storyCommits: (since: { from?: string; at: number }) => boolean }): boolean {
  const events = card.events ?? [];
  const entry = stageEntryIndex(events, stage.id);
  const base = lastCountedFail(card, stage.id);
  const after = base ? events.indexOf(base) : entry;
  // An agent-run with no exit and no duration is a start that was refused before the agent ran.
  if (opts.workLines || events.slice(after + 1).some(e => e.stage === stage.id && e.action === 'agent-run' && !(e.exit === null && e.durationMs === 0))) return true;
  const since = base ? Date.parse(base.at) : entry >= 0 ? Date.parse(events[entry].at) : Date.parse(card.createdAt);
  if (base?.head && opts.head) {
    if (base.head !== opts.head && opts.storyCommits({ from: base.head, at: since })) return true;
  } else if (opts.head && opts.storyCommits({ at: since })) return true;
  if (!stage.output || opts.untouched) return false;
  if (!base) return true;
  // A base that kept no fingerprint says nothing about what the work was, so a changed output cannot be shown.
  const judged = base.fingerprint ?? card.failures?.[stage.id];
  return judged !== undefined && judged !== opts.fingerprint;
}

const TRAILER = /^(?:Card|Feature):[ \t]*(\S+)[ \t]*$/gm;

/**
 * Whether a commit since `from` is work on this card. A commit naming the card in a `Card:` or
 * `Feature:` trailer is; otherwise one touching a file in the card's plan is, whatever other
 * trailers it carries; for a card with no plan, a commit with no trailers is when it touches a file
 * that one of the card's own trailered commits touched, so a chore on main is nobody's retry; when
 * it has no trailered commits either, one is when it changes the stage output or a file in the
 * card's spec folder, so a person's untrailered work on the story still counts. With
 * no `from` (the first failure: no head was kept when the card entered the stage) commits since `at`
 * are read and only the first two rules apply, as there is no head move to judge. A `from` the log
 * cannot reach (the branch was rewritten) falls back to `at`.
 */
function commitsWorkOn(projectDir: string, card: Card, stage: Stage, since: { from?: string; at: number }): boolean {
  const log = (range: string[]) => spawnSync('git', ['log', '--name-only', '--format=%x01%H%x00%B%x00', ...range], { cwd: projectDir, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  const byTime = [`--since=@${Math.floor(since.at / 1000)}`, 'HEAD'];
  let run = log(since.from ? [`${since.from}..HEAD`] : byTime);
  if (run.status !== 0 && since.from) run = log(byTime);
  if (run.status !== 0) return false;
  const plan = planFiles(projectDir, card);
  const records = (stdout: string) => stdout.split('\u0001').flatMap(rec => {
    const [sha, body = '', files = ''] = rec.split('\u0000');
    return sha?.trim() ? [{ cards: [...body.matchAll(TRAILER)].map(m => m[1]), files: files.split('\n').map(f => f.trim()).filter(Boolean) }] : [];
  });
  let owned: Set<string> | undefined;
  // Files the card's own trailered commits touched, over all history; read once, only when needed.
  const ownFiles = () => (owned ??= new Set(records(log([`--grep=^(Card|Feature):[[:space:]]*${card.id}[[:space:]]*$`, '-E', 'HEAD']).stdout).filter(r => r.cards.includes(card.id)).flatMap(r => r.files)));
  // The story's own files when it has neither a plan nor a trailered commit: the stage output and the spec folder.
  const storyFiles = () => [...(stage.output ? [relative(workDir(projectDir), specPath(projectDir, substitute(stage.output, card, { projectDir })))] : []), ...(card.spec ? [card.spec] : [])];
  for (const { cards, files } of records(run.stdout)) {
    if (cards.includes(card.id)) return true;
    if (plan) {
      if (files.some(f => pathInPlan(projectDir, plan, f))) return true;
    } else if (since.from && !cards.length && files.some(f => (ownFiles().size ? ownFiles().has(f) : pathInPlan(projectDir, storyFiles(), f)))) return true;
  }
  return false;
}

/**
 * `rerunStuck` lets the doctor rerun the check of a story parked stuck, after work landed on it: a
 * pass advances it and the stuck gate goes with it (an `unstick` event is written), a failure
 * leaves it stuck and is recorded uncounted. The gate is cleared only on the working copy.
 */
export function advanceCard(projectDir: string, ref: string, opts: { event?: string; unattended?: boolean; rerunStuck?: boolean; checkTimeoutMs?: number; force?: boolean } & Clock = {}): AdvanceResult {
  let file = readCards(projectDir);
  let before = findCard(file.cards, ref);
  const id = before.id;
  if (before.stage === DONE) throw new RefusalError(`card ${id} is already done`);
  if (before.stage === DROPPED) throw new RefusalError(`card ${id} was dropped as a proposal`);
  const rerun = Boolean(opts.rerunStuck && before.gate === 'stuck');
  if (before.gate && !rerun) throw new RefusalError(`card ${id} is waiting for you at gate "${before.gate}" (${before.awaiting} approves)`);

  const lane = loadLane(projectDir, before.lane);
  const stage = currentStage(lane, before);
  const now = opts.now ?? clock();
  const draft = (from: Card): Card => ({ ...from, retries: { ...from.retries }, events: [...from.events], evidence: [...from.evidence], updatedAt: now.toISOString() });
  let card = draft(before);
  if (rerun) {
    delete card.gate;
    delete card.awaiting;
  }

  // Covers a card whose outward gate was rejected, or that sat in the stage before the gate was added.
  if (awaitsApproval(card, stage)) {
    park(card, stage, now, 'before the stage runs');
    writeCards(projectDir, file, replace(file.cards, card));
    return { card, outcome: 'parked', started: [], because: {} };
  }

  // A scheduled run or the doctor does not rerun a failed check nothing has changed under. A person's
  // `card check` and the app's Check now are neither, so they always run; `force` says so explicitly.
  if (!opts.force && (opts.unattended || rerun) && skipUnchangedRerun(projectDir, before, stage.id, now)) {
    return { card: before, outcome: 'unchanged', started: [], because: {} };
  }

  // Read before this run's own check line is appended: only work by someone since the last check
  // makes the next failure a fresh attempt.
  const workLines = workSinceLastCheck(projectDir, id);
  const check = runCheck(projectDir, card, stage, undefined, undefined, opts.checkTimeoutMs);
  const output = check?.output ?? '';
  if (check) appendActivity(projectDir, id, { session: currentSession(), kind: 'check', stage: stage.id, pass: check.passed, output });
  // A check may itself write the board: the scan stage proposes cards, and `verify` records its
  // evidence on this card. The advance is then written on the board as the check left it. A card
  // that was moved or parked meanwhile is someone else's decision, and that is a conflict.
  const after = readCards(projectDir);
  if (after.version !== file.version) {
    const current = after.cards.find(c => c.id === id);
    if (!current || current.stage !== before.stage || current.gate !== before.gate) {
      throw new ConflictError(`card ${id} was moved while its ${stage.id} check ran; re-read and retry`);
    }
    file = after;
    before = current;
    card = draft(current);
    if (rerun) {
      delete card.gate;
      delete card.awaiting;
    }
  }
  if (check) {
    if (check.crashed !== undefined) {
      // The tool broke, not the work: one event with the tail (not one per rerun), no retry spent.
      const last = before.events.filter(e => e.stage === stage.id).at(-1);
      if (last?.action === 'check-error' && last.note === check.crashed) return { card: before, outcome: 'check-error', output, started: [], because: {} };
      card.events.push(event(now, 'engine', 'check-error', stage.id, check.crashed));
      writeCards(projectDir, file, replace(file.cards, card));
      return { card, outcome: 'check-error', output, started: [], because: {} };
    }
    if (!check.passed) {
      const fingerprint = workFingerprint(projectDir, card, stage, output);
      const head = headCommit(projectDir);
      const failed = (counted: boolean): CardEvent => ({ ...event(now, 'engine', 'fail', stage.id, output), ...(head ? { head } : {}), fingerprint, counted });
      // At the retry cap the failure is recorded and never counted, so `retries` never passes
      // `lane.retries`; a card at the cap that is not parked yet (the lane's retries were lowered) parks.
      if (before.gate === 'stuck' || (before.retries[stage.id] ?? 0) >= lane.retries) {
        const kept = draft(before);
        kept.failures = { ...before.failures, [stage.id]: fingerprint };
        kept.events.push(failed(false));
        if (!kept.gate) {
          kept.gate = 'stuck';
          kept.awaiting = 'owner';
          kept.events.push(event(now, 'engine', 'stuck', stage.id, `${failedTimes(kept.retries[stage.id] ?? 0)}\n${output}`));
        }
        writeCards(projectDir, file, replace(file.cards, kept));
        return { card: kept, outcome: 'stuck', output, started: [], because: {} };
      }
      const counted = workTried(before, stage, { workLines, fingerprint, head, untouched: untouchedOutput(projectDir, card, stage) !== undefined, storyCommits: since => commitsWorkOn(projectDir, before, stage, since) });
      card.events.push(failed(counted));
      // An unattended run on the work the last failure judged, with nothing tried since, has nothing new to say.
      if (opts.unattended && !counted && before.failures?.[stage.id] === fingerprint) {
        writeCards(projectDir, file, replace(file.cards, card));
        return { card, outcome: 'unchanged', output, started: [], because: {} };
      }
      card.failures = { ...before.failures, [stage.id]: fingerprint };
      const failures = (card.retries[stage.id] ?? 0) + (counted ? 1 : 0);
      card.retries[stage.id] = failures;
      const stuck = failures >= lane.retries;
      if (stuck) {
        card.gate = 'stuck';
        card.awaiting = 'owner';
        card.events.push(event(now, 'engine', 'stuck', stage.id, `${failedTimes(failures)}\n${output}`));
      }
      writeCards(projectDir, file, replace(file.cards, card));
      return { card, outcome: stuck ? 'stuck' : 'failed', output, started: [], because: {} };
    }
  } else if (stage.done?.event) {
    if (opts.event !== stage.done.event) throw new RefusalError(`card ${id} stage ${stage.id} is waiting for event "${stage.done.event}"`);
  } else {
    throw new RefusalError(`lane ${lane.id} stage ${stage.id} has no done check`);
  }

  const given = stage.gate ? approval(card, stage) : undefined;
  if (given?.fingerprint && given.fingerprint !== stageFingerprint(projectDir, card, stage)) {
    park(card, stage, now, 'the output or the check changed since it was approved');
    writeCards(projectDir, file, replace(file.cards, card));
    return { card, outcome: 'parked', output, started: [], because: {} };
  }

  if (stage.gate && !given) {
    if (loadEngineConfig(projectDir).gatesMode === 'trusted') {
      card.events.push(event(now, 'engine', 'auto-approve', stage.id, `gate ${stage.gate.name} (gates.mode trusted)`));
    } else {
      park(card, stage, now, 'after the check passed');
      writeCards(projectDir, file, replace(file.cards, card));
      return { card, outcome: 'parked', output, started: [], because: {} };
    }
  }

  if (rerun) {
    card.retries[stage.id] = 0;
    card.events.push(event(now, 'engine', 'unstick', stage.id, 'the check passes after work landed on the story'));
  }
  const next = nextStage(lane, stage, card);
  if (next?.id === SPLIT_BEFORE_STAGE) {
    const problem = storySizeProblem(projectDir, card);
    if (problem) throw new RefusalError(problem);
  }
  card.stage = next ? next.id : DONE;
  if (stage.output) card.evidence.push(substitute(stage.output, card, { projectDir }));
  card.events.push(event(now, 'engine', 'advance', stage.id, `to ${card.stage}`), ...skipEvents(lane, stage, next, card, now));
  for (const page of researchFindings(projectDir, card, stage)) card.events.push(event(now, 'engine', 'findings', stage.id, page));
  const decision = researchDecision(projectDir, card, stage, now);
  if (decision) card.events.push(event(now, 'engine', 'decision', stage.id, decision));
  if (next) parkIfOutward(card, lane, now);

  let cards = replace(file.cards, card);
  const started: Card[] = [];
  const because: Record<string, string> = {};
  if (!next) {
    // on_done.start here and `trigger: { on: lane.done, lane }` there mean the same thing; a Map
    // keeps a lane that declares both from getting two cards. on_done is opt-in (lanes.auto_start);
    // without it the line is announced on the finished card and nothing starts.
    const targets = new Map<string, string>();
    if (lane.on_done?.start) {
      if (loadEngineConfig(projectDir).autoStart) targets.set(lane.on_done.start, `${lane.id}.on_done`);
      else card.events.push(event(now, 'engine', 'on_done-skipped', stage.id, `would start ${lane.on_done.start} (lanes.auto_start is off)`));
    }
    for (const other of loadLanes(projectDir)) {
      if (other.trigger?.on === 'lane.done' && other.trigger.lane === lane.id && !targets.has(other.id)) targets.set(other.id, `${other.id}.trigger lane.done`);
    }
    // Not subject to wip or capacity: refusing here would drop the follow-on for a finished card.
    for (const [target, reason] of targets) {
      // A follow-on that cannot start (its lane file is missing or names no stages) is recorded
      // on the finished card. It must not undo the finish.
      try {
        const follow = newCard(cards, loadLane(projectDir, target), card.title, nextCardId(cards), now, 'engine', `started by ${card.id} finishing lane ${lane.id} (${reason})`);
        started.push(follow);
        because[follow.id] = reason;
        cards = [...cards, follow];
      } catch (e) {
        if (!(e instanceof RefusalError)) throw e;
        card.events.push(event(now, 'engine', 'on_done-failed', stage.id, e.message));
      }
    }
  }
  writeCards(projectDir, file, cards);
  // Runs as its own read-modify-write, after the write above has committed the shape card as done:
  // queueBreakdown makes new cards and wiki pages of its own, so folding it into the write above
  // would mean this advance's compare-and-swap loses the race against queueBreakdown's.
  if (!next && lane.on_done?.queue) {
    try {
      queueBreakdown(projectDir, card.id, lane.on_done.queue, now);
    } catch (e) {
      if (!(e instanceof RefusalError)) throw e;
      recordEvent(projectDir, card.id, () => ({ action: 'on_done-failed', note: e.message }), now);
    }
  }
  return { card, outcome: !next ? 'done' : card.gate ? 'parked' : 'moved', output, started, because };
}

export function approveCard(projectDir: string, ref: string, role: Role, opts: { note?: string } & Clock = {}): Card {
  const file = readCards(projectDir);
  const before = findCard(file.cards, ref);
  const id = before.id;
  if (!before.gate) throw new RefusalError(`card ${id} is not waiting at a gate`);
  if (role !== before.awaiting) throw new RefusalError(`gate "${before.gate}" needs ${before.awaiting}; ${role} cannot approve it${role === 'agent' ? `. If you are the ${before.awaiting}, run it yourself in a terminal (or with \`--as ${before.awaiting}\`), or approve it on the board` : ''}`);

  const now = opts.now ?? clock();
  const { gate, awaiting: _awaiting, ...rest } = before;
  const card: Card = { ...rest, retries: { ...before.retries }, updatedAt: now.toISOString() };
  if (before.stage === PROPOSED) {
    // Not subject to wip: the owner chose this card. A run still works a lane `wip` cards at a time.
    const lane = loadLane(projectDir, before.lane);
    const back = before.parked_from && lane.stages.some(s => s.id === before.parked_from) ? before.parked_from : undefined;
    card.stage = back ?? firstStage(lane, card).id;
    delete card.parked_from;
    // Back on the stage it was parked from, it enters fresh: a stuck story kept at the retry cap
    // would park stuck again on its first check, under the old reason.
    if (back) {
      const fresh = enter(card, back);
      card.retries = fresh.retries;
      if (card.failures) card.failures = fresh.failures;
    }
    card.laneVersion = lane.version;
    card.events = [...before.events, event(now, role, back ? 'unpark' : 'promote', card.stage, opts.note), ...(back ? [] : skipEvents(lane, undefined, lane.stages.find(s => s.id === card.stage), card, now))];
    parkIfOutward(card, lane, now);
  } else if (gate === 'stuck') {
    card.retries[card.stage] = 0;
    card.events = [...before.events, event(now, role, 'unstick', card.stage, opts.note)];
  } else {
    const stage = loadLane(projectDir, before.lane).stages.find(s => s.id === before.stage);
    const fingerprint = stage ? stageFingerprint(projectDir, before, stage) : undefined;
    card.events = [...before.events, { ...event(now, role, 'approve', card.stage, opts.note ?? `gate ${gate}`), ...(fingerprint ? { fingerprint } : {}) }];
  }
  writeCards(projectDir, file, replace(file.cards, card));
  return card;
}

export function rejectCard(projectDir: string, ref: string, role: Role, note: string, opts: Clock = {}): Card {
  const file = readCards(projectDir);
  const before = findCard(file.cards, ref);
  const id = before.id;
  if (!before.gate) throw new RefusalError(`card ${id} is not waiting at a gate`);
  if (before.gate === 'stuck') throw new RefusalError(`card ${id} is stuck, not at a gate; approve it to retry`);
  if (role !== before.awaiting) throw new RefusalError(`gate "${before.gate}" needs ${before.awaiting}; ${role} cannot reject it`);
  if (!note?.trim()) throw new RefusalError('a rejection needs a note saying what to change');

  const now = opts.now ?? clock();
  const { gate: _gate, awaiting: _awaiting, ...rest } = before;
  const card: Card = { ...rest, ...(before.stage === PROPOSED ? { stage: DROPPED } : {}), events: [...before.events, event(now, role, 'reject', before.stage, note.trim())], updatedAt: now.toISOString() };
  // A gate asked on entry judges the stage before it: nothing of this stage has run, so the card
  // goes back to that stage with the note. A gate asked after the check keeps the card for a redo.
  const previous = returnTarget(projectDir, before);
  if (previous) {
    card.stage = previous;
    card.events.push(event(now, 'engine', 'returned', previous, `from ${before.stage}: ${note.trim()}`));
  }
  writeCards(projectDir, file, replace(file.cards, card));
  return card;
}

/** The stage a rejection at an entry gate sends the card back to; undefined when it stays where it is. */
export function returnTarget(projectDir: string, card: Card): string | undefined {
  if (!card.gate || card.stage === PROPOSED || card.gate === 'stuck') return undefined;
  const lane = loadLane(projectDir, card.lane);
  const at = lane.stages.findIndex(s => s.id === card.stage);
  if (at < 1 || !awaitsApproval(card, lane.stages[at])) return undefined;
  return lane.stages[at - 1].id;
}
