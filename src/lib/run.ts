import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { AGENT_RUNS_DIR, briefPath, buildBrief, runAgent, type AgentConfig } from './agent.js';
import { findCard, inLane, readCards, safeName, type Card } from './cards.js';
import { lastDueSlot } from './cron.js';
import { advanceCard, awaitsApproval, createCard, loadEngineConfig, recordEvent, RefusalError, runCheck, waitingOnOwner, type Outcome } from './engine.js';
import { nextHint } from './flow.js';
import { loadLane, loadLanes, shellQuote, type Lane, type Stage } from './lane.js';
import { clock } from './clock.js';
import { withLock } from './lock.js';

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
  const file = join(projectDir, LAST_RUN);
  // Two schedulers started together must not both see the same slot as new.
  const result = withLock(file, () => startDue(projectDir, file, now, filter));

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
  return cards.filter(c => inLane(c) && !c.gate && (!filter.lane || c.lane === filter.lane) && (!only || c.id === only));
}
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// An agent-start with no agent-run after it, younger than the timeout: another run is in the middle of this stage.
function running(card: Card, agent: AgentConfig, now: Date): boolean {
  const last = card.events.filter(e => e.stage === card.stage && (e.action === 'agent-start' || e.action === 'agent-run')).at(-1);
  return last?.action === 'agent-start' && now.getTime() - new Date(last.at).getTime() < agent.timeoutMinutes * 60_000 + 60_000;
}

/** Why no agent may start for this card now, from the board as given. `planned` counts starts a dry run has already listed. */
function limit(projectDir: string, cards: Card[], card: Card, lane: Lane, agent: AgentConfig, now: Date, planned = 0): string | undefined {
  const ahead = cards.filter(c => c.lane === lane.id && inLane(c)).findIndex(c => c.id === card.id);
  if (lane.wip !== undefined && ahead >= lane.wip) return `lane ${lane.id} works on ${plural(lane.wip, 'card', 'cards')} at a time (wip); this one waits its turn`;
  const { gatesPerDay } = loadEngineConfig(projectDir);
  const parked = waitingOnOwner(cards);
  if (gatesPerDay !== undefined && parked >= gatesPerDay) return `${plural(parked, 'card is', 'cards are')} waiting on you (capacity.gates_per_day is ${gatesPerDay}); clear the inbox first`;
  const starts = planned + cards.flatMap(c => c.events).filter(e => e.action === 'agent-start' && e.agent === agent.name && now.getTime() - new Date(e.at).getTime() < DAY_MS).length;
  if (starts >= agent.maxRunsPerDay) return `agent ${agent.name} has started ${plural(starts, 'time', 'times')} in the last 24 hours (max_runs_per_day is ${agent.maxRunsPerDay})`;
  return undefined;
}

// null when the card needs no agent: its stage has no command to check the work with, or the check passes already.
async function agentStep(projectDir: string, id: string, agent: AgentConfig, now: Date, logFile?: string): Promise<(AgentStep & { busy?: boolean }) | null> {
  const card = findCard(readCards(projectDir).cards, id);
  const lane = loadLane(projectDir, card.lane);
  const stage: Stage | undefined = lane.stages.find(s => s.id === card.stage);
  if (!stage?.done?.cmd) return null;
  const step = { id, stage: stage.id, agent: agent.name };
  if (awaitsApproval(card, stage)) return { ...step, started: false, reason: `${stage.id} is a public step that has not been approved` };
  if (running(card, agent, now)) return { ...step, started: false, busy: true, reason: `agent ${agent.name} is still running on ${stage.id} from an earlier run` };
  // A rejection, or a return from the next stage's entry gate, asks for the work to be done again,
  // so the agent is started with the note even though the check still passes. Once per note.
  const asked = card.events.filter(e => e.stage === stage.id && (e.action === 'reject' || e.action === 'returned' || e.action === 'agent-start')).at(-1);
  if (asked?.action !== 'reject' && asked?.action !== 'returned' && runCheck(projectDir, card, stage)?.passed) return null;

  let log = '';
  try {
    // The limits are judged on the same read of the board the start is written against.
    recordEvent(projectDir, id, (cards, current) => {
      const reason = limit(projectDir, cards, current, lane, agent, now);
      if (reason) throw new RefusalError(reason);
      const n = current.events.filter(e => e.action === 'agent-start' && e.stage === stage.id).length + 1;
      log = logFile ?? `${AGENT_RUNS_DIR}/${id}-${safeName(stage.id, 'stage id')}-${n}.log`;
      return { action: 'agent-start', agent: agent.name, log };
    }, now);
  } catch (e) {
    if (!(e instanceof RefusalError)) throw e;
    return { ...step, started: false, reason: e.message };
  }

  const brief = join(projectDir, briefPath(card));
  mkdirSync(dirname(brief), { recursive: true });
  writeFileSync(brief, buildBrief(projectDir, card));
  const run = await runAgent(projectDir, agent, brief, join(projectDir, log));
  const note = run.timedOut ? `timed out after ${agent.timeoutMinutes} minutes` : run.exit === null ? 'was killed' : undefined;
  recordEvent(projectDir, id, () => ({ action: 'agent-run', agent: agent.name, exit: run.exit, durationMs: run.durationMs, log, ...(note ? { note } : {}) }), new Date(now.getTime() + run.durationMs));
  return { ...step, started: true, exit: run.exit, durationMs: run.durationMs, log };
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

export async function workCard(projectDir: string, id: string, stage: string, agent: AgentConfig | null, now: Date, logFile?: string): Promise<CardTurn> {
  const turn: CardTurn = { advanced: { id, outcome: 'refused' } };
  try {
    const step = agent ? await agentStep(projectDir, id, agent, now, logFile) : null;
    if (step) {
      const { busy, ...entry } = step;
      turn.agent = entry;
      if (busy) {
        turn.busy = true;
        turn.advanced = { id, outcome: 'refused', note: entry.reason };
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
export async function runDueWithAgent(projectDir: string, agent: AgentConfig, now: Date = clock(), filter: RunFilter = {}): Promise<RunResult> {
  const file = join(projectDir, LAST_RUN);
  const result: RunResult = { ...withLock(file, () => startDue(projectDir, file, now, filter)), agents: [] };

  for (const { id, stage } of active(projectDir, filter)) {
    let current = stage;
    let turn: CardTurn = { advanced: { id, outcome: 'refused' } };
    for (let i = 0; i < MAX_ADVANCES_PER_CARD; i++) {
      turn = await workCard(projectDir, id, current, agent, now);
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
export function planRun(projectDir: string, agent: AgentConfig | null, now: Date = clock(), filter: RunFilter = {}): string[] {
  const { cards } = readCards(projectDir);
  let planned = 0;
  return active(projectDir, filter).map(card => {
    const lane = loadLane(projectDir, card.lane);
    const stage = lane.stages.find(s => s.id === card.stage);
    if (!agent || !stage?.done?.cmd) return `${card.id}: would run the ${card.stage} check and move the card if it passes`;
    const reason = awaitsApproval(card, stage)
      ? `${stage.id} is a public step that has not been approved`
      : running(card, agent, now)
        ? `agent ${agent.name} is still running on ${stage.id} from an earlier run`
        : limit(projectDir, cards, card, lane, agent, now, planned);
    if (reason) return `${card.id}: would not start agent ${agent.name} on ${stage.id}: ${reason}`;
    planned++;
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
