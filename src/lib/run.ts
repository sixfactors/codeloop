import { builderIdle, stalledBuilders } from './stall.js';
import { offLine, readOff } from './off.js';
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { AGENT_RUNS_DIR, briefPath, buildBrief, loadAgents, resolveAgent, runAgent, type AgentConfig } from './agent.js';
import { appendActivity, lastActivityAt } from './activity.js';
import { loadConfig } from './config.js';
import { addQuestions, openQuestions } from './interview.js';
import { storyState } from './states.js';
import { progressSince } from './progress.js';
import { CHECK_CRASHED, findCard, inLane, NOTHING_CHANGED, readCards, safeName, stageEntryIndex, type Card } from './cards.js';
import { lastDueSlot } from './cron.js';
import { SPLIT_BEFORE_STAGE, storySizeProblem } from './story-size.js';
import { advanceCard, awaitsApproval, createCard, headCommit, laneFullRefusal, loadEngineConfig, slotHolders, markStuck, parkStuck, promoteQueued, recordEvent, RefusalError, runCheck, waitingOnOwner, workFingerprint, type Outcome } from './engine.js';
import { nextHint } from './flow.js';
import { loadLane, loadLanes, shellQuote, type Lane, type Stage } from './lane.js';
import { clock } from './clock.js';
import { checkTimeoutMs } from './check-timeout.js';
import { withLock } from './lock.js';
import { overCeiling, type MemoryProbe } from './memory.js';
import { reviewBrief } from './rubric.js';
import { reviewPass } from './review-pass.js';
import { startOrch, waitingOrchCards } from './orch.js';
import { placeTurn } from './orch-isolation.js';
import { isUnavailable, noteAgentRun, startsToday } from './agent-ledger.js';
import { Budget } from './budget.js';
import { stageScaffold } from './stage-scaffold.js';
import { LockedError, withRunLock } from './run-lock.js';
import { rankCards } from './features.js';

export const LAST_RUN = '.codeloop/state/last-run.json';
const FIRST_RUN_LOOKBACK_MS = 24 * 60 * 60 * 1000;
// A tick keeps advancing one card stage by stage until its own check stops it. A lane whose
// stages keep passing into each other with no gate would otherwise loop forever.
const MAX_ADVANCES_PER_CARD = 20;

interface LastRun {
  at: string;
  slots: Record<string, string>;
  git?: Record<string, string>;
}

// The slot is a local time (cron is local), so its date in the title is the local one too.
const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const GIT_VALUE: Record<string, string[]> = {
  'git.commit': ['rev-parse', 'HEAD'],
  'git.tag': ['for-each-ref', '--sort=-creatordate', '--count=1', '--format=%(refname:short)', 'refs/tags'],
};

function git(projectDir: string, args: string[]): string {
  const run = spawnSync('git', args, { cwd: projectDir, encoding: 'utf-8' });
  return run.status === 0 ? run.stdout.trim() : '';
}

export interface RunResult {
  created: { lane: string; id: string; slot: string; trigger: string }[];
  // slot is the cron minute, or the commit sha / tag for a git trigger
  skipped: { lane: string; reason: string }[];
  advanced: { id: string; outcome: Outcome | 'refused'; note?: string; next?: string }[];
  /** Only on a run with an agent: one entry per card an agent was started for, or would have been. */
  agents?: AgentStep[];
  /** Every lane with a trigger, and what this run did about it. */
  lanes: LaneDue[];
  /** Why the run stopped early: its budget, or the repo lock another run held. */
  stopped?: string;
}

export interface LaneDue {
  lane: string;
  trigger: string;
  status: 'created' | 'not due' | 'skipped' | 'manual';
  note?: string;
}

/** `--lane` or `--card`: only that lane's cards (and trigger), or only that card and no triggers. */
export interface RunFilter {
  lane?: string;
  card?: string;
}

export interface AgentStep {
  id: string;
  stage: string;
  agent: string;
  started: boolean;
  reason?: string;
  exit?: number | null;
  durationMs?: number;
  log?: string;
}

export function runDue(projectDir: string, now: Date = clock(), filter: RunFilter = {}): RunResult {
  const off = readOff(projectDir);
  if (off) return { created: [], skipped: [], advanced: [], lanes: [], stopped: offLine(off) };
  const file = join(projectDir, LAST_RUN);
  // Two schedulers started together must not both see the same slot as new.
  const result = withLock(file, () => startDue(projectDir, file, now, filter));
  // A queued story (shape's on_done.queue) is promoted into its lane's first stage here, not on
  // every advance: the owner's plan approval already covers the promotion, so it only needs a run.
  promoteQueued(projectDir, { now, lane: filter.lane });
  parkStuck(projectDir, { now });

  for (const { id } of active(projectDir, filter)) {
    result.advanced.push(advanceUntilStop(projectDir, id, now));
  }
  return result;
}

// Keeps calling advanceCard on the same card, which re-reads it each time, until the card stops
// moving on its own: a failed check, a gate, stuck, done, or the safety cap.
function advanceUntilStop(projectDir: string, id: string, now: Date): RunResult['advanced'][number] {
  let last: RunResult['advanced'][number] = { id, outcome: 'refused' };
  for (let i = 0; i < MAX_ADVANCES_PER_CARD; i++) {
    try {
      last = { id, outcome: advanceCard(projectDir, id, { now, unattended: true }).outcome };
    } catch (e) {
      if (!(e instanceof RefusalError)) throw e;
      last = { id, outcome: 'refused', note: e.message };
      break;
    }
    if (last.outcome !== 'moved') break;
  }
  return last;
}

const DAY_MS = 24 * 60 * 60 * 1000;
function active(projectDir: string, filter: RunFilter = {}): Card[] {
  const { cards } = readCards(projectDir);
  if (filter.lane && !loadLanes(projectDir).some(l => l.id === filter.lane)) throw new RefusalError(`lane "${filter.lane}" not found`);
  const only = filter.card ? findCard(cards, filter.card).id : undefined;
  return rankCards(projectDir, cards.filter(c => inLane(c) && !c.gate && (!filter.lane || c.lane === filter.lane) && (!only || c.id === only)));
}
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// An agent-start with no agent-run after it, younger than the timeout: another run is in the middle of this stage.
function running(card: Card, agent: AgentConfig, now: Date): boolean {
  const last = card.events.filter(e => e.stage === card.stage && (e.action === 'agent-start' || e.action === 'agent-run')).at(-1);
  // A carried or batched turn records its own, longer limit on the agent-start.
  const minutes = typeof last?.timeoutMinutes === 'number' && last.timeoutMinutes > 0 ? last.timeoutMinutes : agent.timeoutMinutes;
  return last?.action === 'agent-start' && now.getTime() - new Date(last.at).getTime() < minutes * 60_000 + 60_000;
}

/** Why no agent may start for this card now, from the board as given. `planned` counts starts a dry run has already listed. */
function limit(projectDir: string, cards: Card[], card: Card, lane: Lane, agent: AgentConfig, now: Date, planned = 0, plannedInLane = 0): string | undefined {
  // Only stories an agent is working on hold a slot (engine.slotHolders); a trivial card never
  // needs one. A dry run counts the starts it already listed in this lane as working.
  if (lane.wip !== undefined && card.size !== 'trivial') {
    const holding = slotHolders(projectDir, cards, lane.id, now).filter(h => h.card.id !== card.id);
    if (holding.length + plannedInLane >= lane.wip) return `${laneFullRefusal(lane, holding)} (wip); this one waits its turn`;
  }
  const { gatesPerDay } = loadEngineConfig(projectDir);
  const parked = waitingOnOwner(cards);
  if (gatesPerDay !== undefined && parked >= gatesPerDay) return `${plural(parked, 'card is', 'cards are')} waiting on you (capacity.gates_per_day is ${gatesPerDay}); clear the inbox first`;
  if (isUnavailable(projectDir, agent.name)) return `agent ${agent.name} is marked unavailable; \`codeloop agent clear ${agent.name}\` once it can run`;
  const starts = planned + startsToday(projectDir, agent.name, now);
  if (starts >= agent.maxRunsPerDay) return `agent ${agent.name} has started ${plural(starts, 'time', 'times')} today (max_runs_per_day is ${agent.maxRunsPerDay})`;
  return undefined;
}

// A move or reopen into the stage is the owner asking for the stage to be worked again.
const ASKS_FOR_START = new Set(['reject', 'returned', 'agent-start', 'doctor-start', 'unstick', 'move', 'reopen']);

// null when the card needs no agent: its stage has no command to check the work with, or the check passes already.
// `stuck`: the start was refused on unchanged work after a failed check and the card was parked
// for a person (rules 4 and 6 of the model above workTried in engine.ts).
async function agentStep(projectDir: string, id: string, agent: AgentConfig, now: Date, logFile?: string, budget?: Budget): Promise<(AgentStep & { busy?: boolean; stuck?: boolean }) | null> {
  const card = findCard(readCards(projectDir).cards, id);
  const lane = loadLane(projectDir, card.lane);
  const stage: Stage | undefined = lane.stages.find(s => s.id === card.stage);
  if (!stage?.done?.cmd) return null;
  const step = { id, stage: stage.id, agent: agent.name };
  if (awaitsApproval(card, stage)) return { ...step, started: false, reason: `${stage.id} is a public step that has not been approved` };
  if (running(card, agent, now)) return { ...step, started: false, busy: true, reason: `agent ${agent.name} is still running on ${stage.id} from an earlier run` };
  // A rejection, or a return from the next stage's entry gate, asks for the work to be done again,
  // so the agent is started with the note even though the check still passes. Once per note.
  // A doctor-start or an owner's unstick asks for one more start on unchanged work.
  // Only asks since the card entered the stage: an agent start from an earlier visit says nothing
  // about this one. The entry event itself is kept, as a move, reopen or return is an ask.
  const entry = stageEntryIndex(card.events, stage.id);
  const asked = card.events.slice(Math.max(entry, 0)).filter(e => e.stage === stage.id && ASKS_FOR_START.has(e.action)).at(-1);
  const redo = asked?.action === 'reject' || asked?.action === 'returned';
  // A start on the head commit and stage work of the last one repeats that run; orch runs stop on
  // the same rule in breaker(). Outside git there is no head to compare.
  const head = headCommit(projectDir);
  const work = head ? workFingerprint(projectDir, card, stage) : undefined;
  const same = head !== undefined && asked?.action === 'agent-start' && asked.head === head && asked.fingerprint === work;
  // A check that already failed after that start, on this head and work, would fail the same way.
  const judged = same && card.events.slice(card.events.indexOf(asked!)).some(e => e.stage === stage.id && e.action === 'fail');
  let failedNow: string | undefined;
  let crashedNow: string | undefined;
  if (!redo && !judged) {
    const check = runCheck(projectDir, card, stage);
    if (check?.passed) return null;
    failedNow = check && check.crashed === undefined ? check.output : undefined;
    crashedNow = check?.crashed;
  }
  // The start records the work as the check left it: a report file the check creates on its first
  // run would otherwise read as new work on the next tick and start the agent again.
  const startWork = head && !redo && !judged ? workFingerprint(projectDir, card, stage) : work;
  if (same) {
    // Nothing new can follow on its own, so the story waits for a person instead of being checked
    // and refused on every tick.
    if (!card.gate && (judged || failedNow !== undefined)) {
      markStuck(projectDir, id, NOTHING_CHANGED, now, failedNow);
      return { ...step, started: false, stuck: true, reason: NOTHING_CHANGED };
    }
    // A check that crashes again on the same work would crash in the advance too, twice a tick.
    if (!card.gate && crashedNow !== undefined) {
      markStuck(projectDir, id, CHECK_CRASHED, now, crashedNow);
      return { ...step, started: false, stuck: true, reason: CHECK_CRASHED };
    }
    return { ...step, started: false, reason: `nothing changed since agent ${asked!.agent ?? agent.name} last started on ${stage.id} (head ${head!.slice(0, 8)}, same work); it starts again once the work or the head commit changes` };
  }

  const spent = budget?.stop(`${id}:${stage.id}`);
  if (spent) return { ...step, started: false, reason: spent };
  let log = '';
  try {
    // The limits are judged on the same read of the board the start is written against.
    recordEvent(projectDir, id, (cards, current) => {
      const reason = limit(projectDir, cards, current, lane, agent, now);
      if (reason) throw new RefusalError(reason);
      const n = current.events.filter(e => e.action === 'agent-start' && e.stage === stage.id).length + 1;
      log = logFile ?? `${AGENT_RUNS_DIR}/${id}-${safeName(stage.id, 'stage id')}-${n}.log`;
      return { action: 'agent-start', agent: agent.name, log, ...(head ? { head, fingerprint: startWork } : {}) };
    }, now);
  } catch (e) {
    if (!(e instanceof RefusalError)) throw e;
    return { ...step, started: false, reason: e.message };
  }

  const brief = join(projectDir, briefPath(card));
  mkdirSync(dirname(brief), { recursive: true });
  writeFileSync(brief, buildBrief(projectDir, card));
  let run;
  try {
    run = await runAgent(projectDir, agent, brief, join(projectDir, log), { now });
  } catch (e) {
    if (!(e instanceof RefusalError)) throw e;
    recordEvent(projectDir, id, () => ({ action: 'agent-run', agent: agent.name, exit: null, durationMs: 0, log, note: `not started: ${e.message}` }), now);
    return { ...step, started: false, reason: e.message };
  }
  budget?.agentStart();
  const marked = noteAgentRun(projectDir, agent.name, { durationMs: run.durationMs, handedBack: run.exit === 0, exit: run.exit });
  const note = run.timedOut ? `timed out after ${agent.timeoutMinutes} minutes` : run.exit === null ? 'was killed' : marked ? `marked unavailable: exited quickly twice; \`codeloop agent clear ${agent.name}\`` : undefined;
  recordEvent(projectDir, id, () => ({ action: 'agent-run', agent: agent.name, exit: run.exit, durationMs: run.durationMs, log, ...(note ? { note } : {}) }), new Date(now.getTime() + run.durationMs));
  const reviewed = run.exit === 0 && stage.review ? await reviewStep(projectDir, id, stage, log, new Date(now.getTime() + run.durationMs)) : 0;
  return { ...step, started: true, exit: run.exit, durationMs: run.durationMs + reviewed, log };
}

/**
 * A stage with `review: { agent }`: a second agent reads the output against the rubric's review and
 * attest rows and writes `{spec}/review-<stage>.md`, which `check rubric` reads. Runs after the
 * stage's own agent and before the check, so the advance judges both.
 */
async function reviewStep(projectDir: string, id: string, stage: Stage, workLog: string, now: Date): Promise<number> {
  const card = findCard(readCards(projectDir).cards, id);
  let reviewer: AgentConfig;
  try {
    reviewer = resolveAgent(projectDir, stage.review!.agent);
  } catch (e) {
    if (!(e instanceof RefusalError)) throw e;
    recordEvent(projectDir, id, () => ({ action: 'review-skipped', note: e.message }), now);
    return 0;
  }
  const brief = join(projectDir, briefPath(card).replace(/\.md$/, '-review.md'));
  mkdirSync(dirname(brief), { recursive: true });
  writeFileSync(brief, reviewBrief(projectDir, card, stage));
  const log = workLog.replace(/\.log$/, '-review.log');
  const run = await runAgent(projectDir, reviewer, brief, join(projectDir, log));
  recordEvent(projectDir, id, () => ({ action: 'review-run', agent: reviewer.name, exit: run.exit, durationMs: run.durationMs, log }), new Date(now.getTime() + run.durationMs));
  return run.durationMs;
}

/** One card's turn in a run: the agent first when its check does not pass, then one advance. */
export interface CardTurn {
  agent?: AgentStep;
  advanced: RunResult['advanced'][number];
  /** The check's output from the advance, when one ran. */
  output?: string;
  outcome?: Outcome;
  /** An earlier run's agent is still on this stage; nothing was checked or moved. */
  busy?: boolean;
}

/** `name` empty: the caller (`runDueWithAgent`) resolves per the card's own lane preference instead of one agent fixed for every card in the run. */
export type AgentWanted = { name?: string };

/** `agent` is already resolved: `evalFixture` and `startCardRun` build their own, outside any lane. */
export async function workCard(projectDir: string, id: string, stage: string, agent: AgentConfig | null, now: Date, logFile?: string, budget?: Budget): Promise<CardTurn> {
  const turn: CardTurn = { advanced: { id, outcome: 'refused' } };
  try {
    const step = agent ? await agentStep(projectDir, id, agent, now, logFile, budget) : null;
    if (step) {
      const { busy, stuck, ...entry } = step;
      turn.agent = entry;
      if (busy) {
        turn.busy = true;
        turn.advanced = { id, outcome: 'refused', note: entry.reason };
        return turn;
      }
      if (stuck) {
        turn.outcome = 'stuck';
        turn.advanced = { id, outcome: 'stuck', note: entry.reason };
        return turn;
      }
    }
    const card = findCard(readCards(projectDir).cards, id);
    if (card.stage !== stage || card.gate) {
      turn.advanced = { id, outcome: 'refused', note: 'the card was moved while the agent ran; nothing more this run' };
      return turn;
    }
    // What an agent just did is a new attempt even when it left the output as it was, so it is
    // judged and counted. Without that a failing agent would be started again on every run.
    const advance = advanceCard(projectDir, id, { now: new Date(now.getTime() + (step?.durationMs ?? 0)), unattended: !!agent && !step?.started });
    const failed = step?.started && (advance.outcome === 'failed' || advance.outcome === 'stuck');
    if (advance.outcome === 'failed') budget?.fail(`${id}:${stage}`);
    turn.output = advance.output;
    turn.outcome = advance.outcome;
    turn.advanced = { id, outcome: advance.outcome, ...(failed ? { next: nextHint(projectDir, advance.card, advance.outcome === 'failed' ? advance.output ?? '' : undefined) } : {}) };
  } catch (e) {
    if (!(e instanceof RefusalError)) throw e;
    turn.advanced = { id, outcome: 'refused', note: e.message };
  }
  return turn;
}

/** `runDue`, with an agent started first on each card whose stage check does not pass yet. Each
 *  card's stage keeps advancing until its own check stops it: a failed check, a gate, stuck, done,
 *  the agent's max_runs_per_day, or the safety cap. */
export async function runDueWithAgent(projectDir: string, wanted: AgentWanted, now: Date = clock(), filter: RunFilter = {}): Promise<RunResult> {
  const off = readOff(projectDir);
  if (off) return { created: [], skipped: [], advanced: [], agents: [], lanes: [], stopped: offLine(off) };
  try {
    return await withRunLock(projectDir, 'run --due', () => runDueLocked(projectDir, wanted, now, filter));
  } catch (e) {
    if (!(e instanceof LockedError)) throw e;
    return { created: [], skipped: [], advanced: [], agents: [], lanes: [], stopped: e.message };
  }
}

async function runDueLocked(projectDir: string, wanted: AgentWanted, now: Date, filter: RunFilter): Promise<RunResult> {
  const budget = Budget.for(projectDir, now.getTime());
  const file = join(projectDir, LAST_RUN);
  const result: RunResult = { ...withLock(file, () => startDue(projectDir, file, now, filter)), agents: [] };
  promoteQueued(projectDir, { now, lane: filter.lane });
  parkStuck(projectDir, { now });

  for (const { id, stage, lane: laneId } of active(projectDir, filter)) {
    const spent = budget.stop();
    if (spent) {
      result.stopped = spent;
      break;
    }
    // Resolved once per card, from that card's own lane: a lane naming its own `agent:` preset
    // (src/commands/wiki.ts's `wiki` lane, for instance) is not forced onto every other lane's
    // cards in the same run.
    const agent = resolveAgent(projectDir, wanted.name, loadLane(projectDir, laneId).agent);
    let current = stage;
    let turn: CardTurn = { advanced: { id, outcome: 'refused' } };
    for (let i = 0; i < MAX_ADVANCES_PER_CARD; i++) {
      turn = await workCard(projectDir, id, current, agent, now, undefined, budget);
      if (turn.agent) result.agents!.push(turn.agent);
      if (turn.busy || turn.advanced.outcome !== 'moved') break;
      current = findCard(readCards(projectDir).cards, id).stage;
    }
    if (turn.busy) continue;
    result.advanced.push(turn.advanced);
  }
  return result;
}

/** What a run would do, for `--dry-run`. Nothing is started, checked or written. */
export function planRun(projectDir: string, wanted: AgentWanted | null, now: Date = clock(), filter: RunFilter = {}): string[] {
  const { cards } = readCards(projectDir);
  let planned = 0;
  const plannedIn: Record<string, number> = {};
  return active(projectDir, filter).map(card => {
    const lane = loadLane(projectDir, card.lane);
    const stage = lane.stages.find(s => s.id === card.stage);
    if (!wanted || !stage?.done?.cmd) return `${card.id}: would run the ${card.stage} check and move the card if it passes`;
    const agent = resolveAgent(projectDir, wanted.name, lane.agent);
    const reason = awaitsApproval(card, stage)
      ? `${stage.id} is a public step that has not been approved`
      : running(card, agent, now)
        ? `agent ${agent.name} is still running on ${stage.id} from an earlier run`
        : limit(projectDir, cards, card, lane, agent, now, planned, plannedIn[lane.id] ?? 0);
    if (reason) return `${card.id}: would not start agent ${agent.name} on ${stage.id}: ${reason}`;
    planned++;
    if (card.size !== 'trivial') plannedIn[lane.id] = (plannedIn[lane.id] ?? 0) + 1;
    return `${card.id}: would start agent ${agent.name} on ${stage.id} unless its check already passes: ${agent.cmd.replaceAll('{brief}', shellQuote(join(projectDir, briefPath(card))))}`;
  });
}

function startDue(projectDir: string, file: string, now: Date, filter: RunFilter = {}): RunResult {
  const result: RunResult = { created: [], skipped: [], advanced: [], lanes: [] };
  // A run on one card starts nothing: the triggers stay for the next full run.
  if (filter.card) return result;
  const last: LastRun | null = existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : null;
  const after = last ? new Date(last.at) : new Date(now.getTime() - FIRST_RUN_LOOKBACK_MS);
  const slots = { ...(last?.slots ?? {}) };
  const seen = { ...(last?.git ?? {}) };
  const lanes = loadLanes(projectDir).filter(l => !filter.lane || l.id === filter.lane);
  const note = (lane: Lane, status: LaneDue['status'], trigger: string, text?: string) => result.lanes.push({ lane: lane.id, trigger, status, ...(text ? { note: text } : {}) });

  for (const lane of lanes) {
    const args = GIT_VALUE[lane.trigger?.on ?? ''];
    if (!args) continue;
    const trigger = lane.trigger!.on!;
    const value = git(projectDir, args);
    // The last value is recorded per lane, so the same HEAD or tag starts one card however often this runs.
    if (!value || seen[lane.id] === value) {
      note(lane, 'not due', trigger, value ? `${trigger === 'git.commit' ? value.slice(0, 7) : value} already started a card` : `no ${trigger === 'git.commit' ? 'commit' : 'tag'} yet`);
      continue;
    }
    try {
      const label = trigger === 'git.commit' ? value.slice(0, 7) : value;
      const card = createCard(projectDir, { lane: lane.id, title: `${lane.id} ${label}`, now, note: `${trigger} ${value}` });
      result.created.push({ lane: lane.id, id: card.id, slot: value, trigger: `${trigger} ${label}` });
      note(lane, 'created', trigger, card.id);
      seen[lane.id] = value;
    } catch (e) {
      if (!(e instanceof RefusalError)) throw e;
      result.skipped.push({ lane: lane.id, reason: e.message });
      note(lane, 'skipped', trigger, e.message);
    }
  }

  for (const lane of lanes) {
    if (!lane.trigger?.cron) {
      if (!lane.trigger?.on) note(lane, 'manual', lane.trigger?.manual ? 'manual' : 'none');
      continue;
    }
    const trigger = `cron ${lane.trigger.cron}`;
    // One lane's unreadable schedule is that lane's problem; the others still run.
    let due: Date | null;
    try {
      due = lastDueSlot(lane.trigger.cron, after, now);
    } catch (e) {
      result.skipped.push({ lane: lane.id, reason: (e as Error).message });
      note(lane, 'skipped', trigger, (e as Error).message);
      continue;
    }
    const slot = due?.toISOString();
    // The slot is recorded per lane, so a re-run inside the same window cannot create a second card.
    if (!slot || slots[lane.id] === slot) {
      note(lane, 'not due', trigger, slot ? `slot ${slot} already started a card` : `no slot since ${after.toISOString()}`);
      continue;
    }
    try {
      const card = createCard(projectDir, { lane: lane.id, title: `${lane.id} ${localDate(due!)}`, now, note: trigger });
      result.created.push({ lane: lane.id, id: card.id, slot, trigger });
      note(lane, 'created', trigger, card.id);
      slots[lane.id] = slot;
    } catch (e) {
      if (!(e instanceof RefusalError)) throw e;
      result.skipped.push({ lane: lane.id, reason: e.message });
      note(lane, 'skipped', trigger, e.message);
    }
  }

  // A refused slot must be found again next run, so the window start only moves when nothing was
  // skipped. A run on one lane leaves it too: the other lanes' slots in the window are not spent.
  const at = result.skipped.length || filter.lane ? after.toISOString() : now.toISOString();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ at, slots, git: seen }, null, 2) + '\n');
  return result;
}

// --- the doctor: what the monitor finds, something does without a person -------------------------

export interface DoctorAction {
  id: string;
  action: 'split-nudge' | 'agent-started' | 'agent-not-started' | 'suggest-park' | 'nudge-builder' | 'rerun-check' | 'orch-retry' | 'review';
  note: string;
}

const DAY_MS_DOCTOR = 24 * 60 * 60 * 1000;
const PARK_QUESTION = 'Park it?';

/** `doctor.scaffold_starts` in config.yaml: how many stuck-on-scaffold stories one tick may start an agent on. Default 0. */
export function scaffoldStartCap(projectDir: string): number {
  const doctor = (loadConfig(projectDir) as { doctor?: { scaffold_starts?: unknown } }).doctor;
  const cap = doctor && typeof doctor === 'object' ? doctor.scaffold_starts : undefined;
  return typeof cap === 'number' && cap >= 0 ? Math.floor(cap) : 0;
}

/** `doctor.review: on` in config.yaml lets the unattended doctor run the review pass; off by default so a project opts in after a supervised `orch run --review --dry-run`. */
export function doctorReviewEnabled(projectDir: string): boolean {
  const doctor = (loadConfig(projectDir) as { doctor?: { review?: unknown } }).doctor;
  const v = doctor && typeof doctor === 'object' ? doctor.review : undefined;
  return v === true || v === 'on';
}

/** On unless `.codeloop/config.yaml` sets `monitor: off`. */
export function monitorEnabled(projectDir: string): boolean {
  const value = (loadConfig(projectDir) as { monitor?: unknown }).monitor;
  return value !== 'off' && value !== false;
}

/**
 * One pass of the doctor: a failing story, counted fails or not, gets its agent started on its
 * stage again (the same turn `run --agent` takes), and a stuck or stale story untouched for a
 * day gets one "park it" question in the inbox. Each action is a line on the story's activity
 * stream. Stories in `skip` were already worked by this run.
 */
export async function doctorTick(projectDir: string, now: Date = clock(), opts: { skip?: Set<string>; agent?: string; memory?: MemoryProbe; onAction?: (a: DoctorAction) => void; onStep?: (line: string) => void; dryRun?: boolean; noChecks?: boolean; checkTimeoutMs?: number } = {}): Promise<DoctorAction[]> {
  if (!monitorEnabled(projectDir) || readOff(projectDir)) return [];
  const budget = Budget.for(projectDir, now.getTime());
  const actions: DoctorAction[] = [];
  const hasAgents = Object.keys(loadAgents(projectDir).agents).length > 0;
  const dry = opts.dryRun === true;
  const log = (a: DoctorAction) => {
    actions.push(a);
    if (!dry) appendActivity(projectDir, a.id, { kind: 'doctor', text: a.note });
    opts.onAction?.(a);
  };
  const checkMs = opts.checkTimeoutMs ?? checkTimeoutMs(projectDir);
  // The review pass first, on the stories changed since the last one, so what follows sees the
  // board it repaired. It keeps its own budget: its fixes are not agent turns.
  const review = doctorReviewEnabled(projectDir) ? reviewPass(projectDir, { now, dryRun: dry, skip: opts.skip }) : { fixed: [], asked: [], unclear: [] };
  for (const l of [...review.fixed, ...review.asked, ...review.unclear]) log({ id: l.id, action: 'review', note: `review pass ${l.verb}: ${l.note} (evidence: ${l.evidence})` });
  // A builder holding a card with a quiet stream gets one request for a hand-back per stall.
  for (const b of stalledBuilders(projectDir, now.getTime())) {
    if (builderIdle(projectDir, b.card, now.getTime()).nudged) continue;
    if (dry) {
      log({ id: b.card, action: 'nudge-builder', note: `would nudge the builder: idle ${b.idleMinutes} min on ${b.stage}` });
      continue;
    }
    log({ id: b.card, action: 'nudge-builder', note: `builder idle ${b.idleMinutes} min on ${b.stage}; asked for a hand-back` });
  }
  // An orchestrated turn that waited for a lease or a builder slot is tried again once one is free.
  for (const id of waitingOrchCards(projectDir)) {
    if (opts.skip?.has(id)) continue;
    const placed = placeTurn(projectDir, id);
    if ('wait' in placed) continue;
    if (dry) {
      log({ id, action: 'orch-retry', note: `would start the waiting turn again (${placed.mode})` });
      continue;
    }
    try {
      startOrch(projectDir, id, opts.agent ? { agent: opts.agent } : {});
      log({ id, action: 'orch-retry', note: `doctor started the waiting turn again (${placed.mode}): ${placed.why}` });
    } catch (e) {
      if (!(e instanceof RefusalError)) throw e;
    }
  }
  // A stuck story whose stage output no agent ever wrote failed three checks on a scaffold. It gets
  // one start of its stage skill (event `doctor-start`), never a second, up to doctor.scaffold_starts a tick.
  const scaffoldCap = scaffoldStartCap(projectDir);
  const onScaffold = new Map<string, string>();
  for (const card of readCards(projectDir).cards) {
    if (opts.skip?.has(card.id) || card.gate !== 'stuck' || card.events.some(e => e.action === 'doctor-start')) continue;
    const stage = loadLane(projectDir, card.lane).stages.find(s => s.id === card.stage);
    const why = stage && stageScaffold(projectDir, card, stage);
    if (why) onScaffold.set(card.id, why);
  }
  let scaffoldSeen = 0;
  let scaffoldStarted = 0;
  for (const card of readCards(projectDir).cards) {
    if (opts.skip?.has(card.id)) continue;
    // A story that entered build before the size rule existed is not thrown out; it is told once.
    if (card.stage === SPLIT_BEFORE_STAGE && !card.events.some(e => e.action === 'split-nudge')) {
      const problem = storySizeProblem(projectDir, card);
      if (problem && dry) log({ id: card.id, action: 'split-nudge', note: `would tell ${card.id} to split: ${problem}` });
      else if (problem) {
        recordEvent(projectDir, card.id, () => ({ action: 'split-nudge', note: problem }), now);
        log({ id: card.id, action: 'split-nudge', note: problem });
      }
    }
    const state = storyState(card, openQuestions(projectDir, card).length, { now: now.getTime(), lastActivityAt: lastActivityAt(projectDir, card.id), progressAt: () => progressSince(projectDir, card) });
    if (!state?.health) continue;
    // Work landed since the check failed: rerun the check, no agent. A pass advances the story and
    // clears stuck; a failure on unchanged work costs nothing (unattended), a changed one is recorded as always.
    if (state.moving && (state.health === 'stuck' || state.health === 'failing')) {
      if (opts.noChecks) continue;
      if (dry) {
        log({ id: card.id, action: 'rerun-check', note: `would rerun the ${card.stage} check (${state.health}, work landed)` });
        continue;
      }
      opts.onStep?.(`rerunning the ${card.stage} check for ${card.id}, up to ${+(checkMs / 60_000).toFixed(2)} min`);
      try {
        const r = advanceCard(projectDir, card.id, { unattended: true, rerunStuck: true, now, checkTimeoutMs: checkMs });
        if (r.outcome === 'check-error') {
          const why = readCards(projectDir).cards.find(c => c.id === card.id)?.events.filter(e => e.action === 'check-error').at(-1)?.note ?? '';
          log({ id: card.id, action: 'rerun-check', note: `check-error: ${why.split('\n').pop()}` });
        } else if (r.outcome !== 'unchanged') log({ id: card.id, action: 'rerun-check', note: `doctor reran the ${card.stage} check after work landed (${state.health}): ${r.outcome}` });
      } catch (e) {
        log({ id: card.id, action: 'rerun-check', note: `doctor could not rerun the ${card.stage} check: ${(e as Error).message}` });
      }
      continue;
    }
    // No cap on fails here: the lane's retries park the story stuck first (engine.ts, rule 5).
    const fails = card.retries[card.stage] ?? 0;
    if (state.health === 'failing') {
      if (!hasAgents) continue;
      const agent = resolveAgent(projectDir, opts.agent, loadLane(projectDir, card.lane).agent);
      // An agent a person has to fix first is never restarted by the doctor.
      if (isUnavailable(projectDir, agent.name)) continue;
      if (dry) {
        log({ id: card.id, action: 'agent-started', note: `would start agent ${agent.name} on ${card.stage} (failing, ${fails} fails)` });
        continue;
      }
      const spent = budget.stop(`${card.id}:${card.stage}`);
      if (spent) {
        log({ id: card.id, action: 'agent-not-started', note: `doctor stopped: ${spent}` });
        break;
      }
      // Last of the three gates (unavailable agent, run budget, memory): a new agent is a new process tree.
      const mem = overCeiling(projectDir, opts.memory);
      if (mem.over) {
        log({ id: card.id, action: 'agent-not-started', note: `doctor waited: codeloop processes hold ${mem.total} MB, over limits.max_memory_mb ${mem.ceiling}` });
        break;
      }
      opts.onStep?.(`starting agent ${agent.name} on ${card.id}`);
      const turn = await workCard(projectDir, card.id, card.stage, agent, now, undefined, budget);
      const started = Boolean(turn.agent?.started);
      log({ id: card.id, action: started ? 'agent-started' : 'agent-not-started', note: started ? `doctor started agent ${agent.name} on ${card.stage} (failing, ${fails} fails); outcome ${turn.advanced.outcome}` : `doctor did not start an agent on ${card.stage}: ${turn.agent?.reason ?? turn.advanced.note ?? turn.advanced.outcome}` });
      continue;
    }
    const scaffold = state.health === 'stuck' && hasAgents ? onScaffold.get(card.id) : undefined;
    if (scaffold) {
      scaffoldSeen++;
      const agent = resolveAgent(projectDir, opts.agent, loadLane(projectDir, card.lane).agent);
      const which = `(scaffold, ${scaffoldSeen} of ${onScaffold.size})`;
      if (dry) {
        log({ id: card.id, action: 'agent-started', note: `would start ${agent.name} on ${card.id} ${card.stage} ${which}${scaffoldSeen > scaffoldCap ? `; doctor.scaffold_starts is ${scaffoldCap}` : ''}: ${scaffold}` });
        continue;
      }
      if (scaffoldStarted < scaffoldCap && !isUnavailable(projectDir, agent.name)) {
        const spent = budget.stop(`${card.id}:${card.stage}`);
        if (spent) {
          log({ id: card.id, action: 'agent-not-started', note: `doctor stopped: ${spent}` });
          break;
        }
        const mem = overCeiling(projectDir, opts.memory);
        if (mem.over) {
          log({ id: card.id, action: 'agent-not-started', note: `doctor waited: codeloop processes hold ${mem.total} MB, over limits.max_memory_mb ${mem.ceiling}` });
          break;
        }
        scaffoldStarted++;
        // Recorded before the start, so a run that dies midway still counts as the one start.
        recordEvent(projectDir, card.id, () => ({ action: 'doctor-start', note: `${agent.name} on ${card.stage} ${which}: ${scaffold}` }), now);
        opts.onStep?.(`starting agent ${agent.name} on ${card.id} ${card.stage} ${which}`);
        const step = await agentStep(projectDir, card.id, agent, now, undefined, budget);
        log({ id: card.id, action: step?.started ? 'agent-started' : 'agent-not-started', note: step?.started ? `doctor started ${agent.name} on ${card.id} ${card.stage} ${which}: ${scaffold}` : `doctor did not start an agent on ${card.stage}: ${step?.reason ?? 'the check passes'}` });
        continue;
      }
    }
    const untouched = now.getTime() - Date.parse(card.updatedAt) > DAY_MS_DOCTOR;
    if ((state.health === 'stale' || state.health === 'stuck') && untouched) {
      if (openQuestions(projectDir, card).some(q => q.question.startsWith(PARK_QUESTION))) continue;
      if (dry) {
        log({ id: card.id, action: 'suggest-park', note: `would ask to park ${card.id}: ${state.health} since ${card.updatedAt.slice(0, 10)}` });
        continue;
      }
      try {
        addQuestions(projectDir, card.id, [{ question: `${PARK_QUESTION} ${card.id} has been ${state.health} since ${card.updatedAt.slice(0, 10)}.`, recommended: `yes: \`codeloop card park ${card.id}\`` }], 'agent');
      } catch {
        // A story with nowhere to keep questions still gets the activity line.
      }
      log({ id: card.id, action: 'suggest-park', note: `doctor suggests parking ${card.id}: ${state.health} since ${card.updatedAt.slice(0, 10)}` });
    }
  }
  return actions;
}
