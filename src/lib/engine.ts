import { spawnSync } from 'child_process';
import { checkEnv } from './shell.js';
import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { appendFindings } from './competitors.js';
import { researchSummary } from './research.js';
import { capture } from './wiki.js';
import { clock } from './clock.js';
import { loadConfig } from './config.js';
import { CARD_ID, ConflictError, DONE, DROPPED, findCard, inLane, nextCardId, PROPOSAL_GATE, PROPOSED, QUEUED, readCards, RefusalError, writeCards, type Card, type CardEvent, type CardExtras, type StoryFields } from './cards.js';

export { RefusalError };
import { loadLane, loadLanes, substitute, type Lane, type Stage } from './lane.js';
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
}

export type CardFields = StoryFields & CardExtras;

export function loadEngineConfig(projectDir: string): EngineConfig {
  const raw = loadConfig(projectDir);
  return {
    gatesMode: raw.gates?.mode === 'trusted' ? 'trusted' : 'all',
    gatesPerDay: raw.capacity?.gates_per_day,
    autoStart: raw.lanes?.auto_start === true,
  };
}

/**
 * `--as`, then CODELOOP_ROLE, then the terminal: a person typing at a TTY is the owner, anything
 * piped or spawned (an agent, CI, the MCP server) is an agent.
 */
export function resolveRole(flag?: string, tty: boolean = Boolean(process.stdin.isTTY)): Role {
  const role = flag ?? process.env.CODELOOP_ROLE ?? (tty ? 'owner' : 'agent');
  if (role !== 'owner' && role !== 'reviewer' && role !== 'agent') {
    throw new RefusalError(`unknown role "${role}" (owner, reviewer or agent)`);
  }
  // Set by `codeloop run --agent` on the process it starts, so `--as owner` typed by that agent is refused.
  if (process.env.CODELOOP_AGENT_RUN && role !== 'agent') {
    throw new RefusalError(`this process was started by \`codeloop run --agent\` and acts as agent; it cannot act as ${role}`);
  }
  return role;
}

export type Outcome = 'moved' | 'parked' | 'done' | 'failed' | 'stuck' | 'unchanged';

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

function event(now: Date, role: Role | 'engine', action: string, stage?: string, note?: string): CardEvent {
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
 * HEAD, the list of changed files, the tracked changes themselves, and size and mtime of untracked
 * files. `.codeloop/` is left out: the engine writes there on every attempt. null outside a git repo.
 */
function treeState(projectDir: string): string | null {
  const git = (args: string[]) => spawnSync('git', [...args, '--', '.', ':(exclude).codeloop'], { cwd: projectDir, encoding: 'utf-8' });
  const status = git(['status', '--porcelain']);
  if (status.status !== 0) return null;
  const untracked = git(['ls-files', '--others', '--exclude-standard']).stdout.split('\n').filter(Boolean).map(f => {
    const s = statSync(join(projectDir, f), { throwIfNoEntry: false });
    return `${f} ${s?.size} ${s?.mtimeMs}`;
  });
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: projectDir, encoding: 'utf-8' }).stdout;
  return [head, status.stdout, git(['diff', 'HEAD']).stdout, ...untracked].join('\n');
}

function tail(text: string): string {
  return text.trimEnd().split('\n').slice(-20).join('\n').slice(-2000);
}

function currentStage(lane: Lane, card: Card): Stage {
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

/** True for a public step nobody has approved yet: no work and no check may run for it. */
export const awaitsApproval = (card: Card, stage: Stage) => !!stage.gate?.outward && !approved(card, stage);

/** Runs the stage's done command without touching the card. null when the stage has no command. */
export function runCheck(projectDir: string, card: Card, stage: Stage): { passed: boolean; output: string } | null {
  if (!stage.done?.cmd) return null;
  const run = spawnSync(substitute(stage.done.cmd, card, { shell: true }), { cwd: projectDir, shell: true, encoding: 'utf-8', timeout: 600_000, env: checkEnv() });
  return { passed: run.status === 0, output: tail(`${run.stdout ?? ''}${run.stderr ?? ''}`) };
}

/**
 * What an approval is bound to: the check's text and the stage's output file. A public step is
 * approved before its work exists, so only its check is bound.
 */
function stageFingerprint(projectDir: string, card: Card, stage: Stage): string {
  const hash = createHash('sha1').update(stage.done?.cmd ?? stage.done?.event ?? '');
  const output = !stage.gate?.outward && stage.output ? join(projectDir, substitute(stage.output, card)) : null;
  if (output) hash.update('\0').update(existsSync(output) && statSync(output).isFile() ? readFileSync(output) : 'missing');
  return hash.digest('hex');
}

// What a research stage found about a competitor is copied to that competitor's wiki page, so the
// next card's research starts from it. Returns the pages that gained rows.
function researchFindings(projectDir: string, card: Card, stage: Stage): string[] {
  if (stage.id !== 'research' || !stage.output) return [];
  const file = join(projectDir, substitute(stage.output, card));
  return existsSync(file) && statSync(file).isFile() ? appendFindings(projectDir, card, readFileSync(file, 'utf-8')) : [];
}

// The verdict, the exists call, the pain and the options outlive the card as a decision page, so
// the next card that touches the same ground starts from what was already decided.
function researchDecision(projectDir: string, card: Card, stage: Stage, now: Date): string | null {
  if (stage.id !== 'research' || !stage.output) return null;
  const file = join(projectDir, substitute(stage.output, card));
  if (!existsSync(file) || !statSync(file).isFile()) return null;
  const summary = researchSummary(readFileSync(file, 'utf-8'));
  if (!summary) return null;
  const body = [
    `Verdict: ${summary.verdict}`,
    ...(summary.exists ? [`Exists: ${summary.exists}`] : []),
    ...(summary.pain ? [`Pain: ${summary.pain}`] : []),
    ...(summary.options ? ['', '## Options', '', summary.options] : []),
    '',
    `From ${substitute(stage.output, card)}.`,
  ].join('\n');
  return capture(projectDir, { title: `${card.title}: ${summary.verdict}`, scope: [], body, kind: 'decision', card: card.id }, now).path;
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

function replace(cards: Card[], card: Card): Card[] {
  return cards.map(c => (c.id === card.id ? card : c));
}

function newCard(cards: Card[], lane: Lane, title: string, id: string, now: Date, actor: Role | 'engine', note?: string, fields: CardFields = {}): Card {
  if (lane.stages.length === 0) throw new RefusalError(`lane ${lane.id} has no stages`);
  // The id is substituted into shell commands and used in folder names, so its shape is fixed.
  if (!CARD_ID.test(id)) throw new RefusalError(`card id "${id}" must be letters, a dash and digits, like c-001 or CL-12`);
  if (cards.some(c => c.id === id)) throw new RefusalError(`card "${id}" already exists`);
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
    stage: lane.stages[0].id,
    retries: {},
    evidence: [],
    events: [event(now, actor, 'create', lane.stages[0].id, note)],
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
  const active = file.cards.filter(c => c.lane === lane.id && inLane(c)).length;
  if (lane.wip !== undefined && active >= lane.wip) {
    throw new RefusalError(`lane ${lane.id} already has ${active} active cards (wip ${lane.wip})`);
  }

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
      const active = file.cards.filter(x => x.lane === c.lane && inLane(x)).length;
      return lane.wip === undefined || active < lane.wip;
    });
    if (!ready) break;
    const lane = loadLane(projectDir, ready.lane);
    const card: Card = {
      ...ready,
      stage: lane.stages[0].id,
      laneVersion: lane.version,
      events: [...ready.events, event(now, 'engine', 'promote', lane.stages[0].id, `queue: ${ready.after ? `after ${ready.after} reached done` : 'wip opened up'}`)],
      updatedAt: now.toISOString(),
    };
    parkIfOutward(card, lane, now);
    writeCards(projectDir, file, replace(file.cards, card));
    promoted.push(card);
  }
  return promoted;
}

export function advanceCard(projectDir: string, ref: string, opts: { event?: string; unattended?: boolean } & Clock = {}): AdvanceResult {
  let file = readCards(projectDir);
  let before = findCard(file.cards, ref);
  const id = before.id;
  if (before.stage === DONE) throw new RefusalError(`card ${id} is already done`);
  if (before.stage === DROPPED) throw new RefusalError(`card ${id} was dropped as a proposal`);
  if (before.gate) throw new RefusalError(`card ${id} is waiting for you at gate "${before.gate}" (${before.awaiting} approves)`);

  const lane = loadLane(projectDir, before.lane);
  const stage = currentStage(lane, before);
  const now = opts.now ?? clock();
  const draft = (from: Card): Card => ({ ...from, retries: { ...from.retries }, events: [...from.events], evidence: [...from.evidence], updatedAt: now.toISOString() });
  let card = draft(before);

  // Covers a card whose outward gate was rejected, or that sat in the stage before the gate was added.
  if (awaitsApproval(card, stage)) {
    park(card, stage, now, 'before the stage runs');
    writeCards(projectDir, file, replace(file.cards, card));
    return { card, outcome: 'parked', started: [], because: {} };
  }

  const check = runCheck(projectDir, card, stage);
  const output = check?.output ?? '';
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
  }
  if (check) {
    if (!check.passed) {
      // An unattended run retries on a schedule. If the work has not changed since the last failure
      // there is nothing new to judge, so it must not use up a retry.
      // The check's own output is no guide (test runners print timings), so a stage with no output
      // file is judged by the working tree instead.
      const stageOutput = stage.output ? join(projectDir, substitute(stage.output, card)) : null;
      const work = stageOutput ? (existsSync(stageOutput) && statSync(stageOutput).isFile() ? readFileSync(stageOutput) : 'missing') : treeState(projectDir) ?? output;
      const fingerprint = createHash('sha1').update(work).digest('hex');
      if (opts.unattended && before.failures?.[stage.id] === fingerprint) return { card: before, outcome: 'unchanged', output, started: [], because: {} };
      card.failures = { ...before.failures, [stage.id]: fingerprint };
      const failures = (card.retries[stage.id] ?? 0) + 1;
      card.retries[stage.id] = failures;
      card.events.push(event(now, 'engine', 'fail', stage.id, output));
      const stuck = failures >= lane.retries;
      if (stuck) {
        card.gate = 'stuck';
        card.awaiting = 'owner';
        card.events.push(event(now, 'engine', 'stuck', stage.id, output));
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

  const next = lane.stages[lane.stages.indexOf(stage) + 1];
  card.stage = next ? next.id : DONE;
  if (stage.output) card.evidence.push(substitute(stage.output, card));
  card.events.push(event(now, 'engine', 'advance', stage.id, `to ${card.stage}`));
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
  if (role !== before.awaiting) throw new RefusalError(`gate "${before.gate}" needs ${before.awaiting}; ${role} cannot approve it`);

  const now = opts.now ?? clock();
  const { gate, awaiting: _awaiting, ...rest } = before;
  const card: Card = { ...rest, retries: { ...before.retries }, updatedAt: now.toISOString() };
  if (before.stage === PROPOSED) {
    // Not subject to wip: the owner chose this card. A run still works a lane `wip` cards at a time.
    const lane = loadLane(projectDir, before.lane);
    card.stage = lane.stages[0].id;
    card.laneVersion = lane.version;
    card.events = [...before.events, event(now, role, 'promote', card.stage, opts.note)];
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
