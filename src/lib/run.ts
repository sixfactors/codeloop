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

export function runDue(projectDir: string, now: Date = clock()): RunResult {
  const file = join(projectDir, LAST_RUN);
  // Two schedulers started together must not both see the same slot as new.
  const result = withLock(file, () => startDue(projectDir, file, now));

  for (const { id } of active(projectDir)) {
    try {
      result.advanced.push({ id, outcome: advanceCard(projectDir, id, { now, unattended: true }).outcome });
    } catch (e) {
      if (!(e instanceof RefusalError)) throw e;
      result.advanced.push({ id, outcome: 'refused', note: e.message });
    }
  }
  return result;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const active = (projectDir: string) => readCards(projectDir).cards.filter(c => inLane(c) && !c.gate);
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
async function agentStep(projectDir: string, id: string, agent: AgentConfig, now: Date): Promise<(AgentStep & { busy?: boolean }) | null> {
  const card = findCard(readCards(projectDir).cards, id);
  const lane = loadLane(projectDir, card.lane);
  const stage: Stage | undefined = lane.stages.find(s => s.id === card.stage);
  if (!stage?.done?.cmd) return null;
  const step = { id, stage: stage.id, agent: agent.name };
  if (awaitsApproval(card, stage)) return { ...step, started: false, reason: `${stage.id} is a public step that has not been approved` };
  if (running(card, agent, now)) return { ...step, started: false, busy: true, reason: `agent ${agent.name} is still running on ${stage.id} from an earlier run` };
  // A rejection asks for the work to be done again, so the agent is started with the note even
  // though the check that passed before the gate still passes. Once per rejection.
  const asked = card.events.filter(e => e.stage === stage.id && (e.action === 'reject' || e.action === 'agent-start')).at(-1);
  if (asked?.action !== 'reject' && runCheck(projectDir, card, stage)?.passed) return null;

  let log = '';
  try {
    // The limits are judged on the same read of the board the start is written against.
    recordEvent(projectDir, id, (cards, current) => {
      const reason = limit(projectDir, cards, current, lane, agent, now);
      if (reason) throw new RefusalError(reason);
      const n = current.events.filter(e => e.action === 'agent-start' && e.stage === stage.id).length + 1;
      log = `${AGENT_RUNS_DIR}/${id}-${safeName(stage.id, 'stage id')}-${n}.log`;
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

/** `runDue`, with an agent started first on each card whose stage check does not pass yet. One stage per card. */
export async function runDueWithAgent(projectDir: string, agent: AgentConfig, now: Date = clock()): Promise<RunResult> {
  const file = join(projectDir, LAST_RUN);
  const result: RunResult = { ...withLock(file, () => startDue(projectDir, file, now)), agents: [] };

  for (const { id, stage } of active(projectDir)) {
    try {
      const step = await agentStep(projectDir, id, agent, now);
      if (step) {
        const { busy, ...entry } = step;
        result.agents!.push(entry);
        if (busy) continue;
      }
      const card = findCard(readCards(projectDir).cards, id);
      if (card.stage !== stage || card.gate) {
        result.advanced.push({ id, outcome: 'refused', note: 'the card was moved while the agent ran; nothing more this run' });
        continue;
      }
      // What an agent just did is a new attempt even when it left the output as it was, so it is
      // judged and counted. Without that a failing agent would be started again on every run.
      const advance = advanceCard(projectDir, id, { now: new Date(now.getTime() + (step?.durationMs ?? 0)), unattended: !step?.started });
      const failed = step?.started && (advance.outcome === 'failed' || advance.outcome === 'stuck');
      result.advanced.push({ id, outcome: advance.outcome, ...(failed ? { next: nextHint(projectDir, advance.card, advance.outcome === 'failed' ? advance.output ?? '' : undefined) } : {}) });
    } catch (e) {
      if (!(e instanceof RefusalError)) throw e;
      result.advanced.push({ id, outcome: 'refused', note: e.message });
    }
  }
  return result;
}

/** What a run would do, for `--dry-run`. Nothing is started, checked or written. */
export function planRun(projectDir: string, agent: AgentConfig | null, now: Date = clock()): string[] {
  const { cards } = readCards(projectDir);
  let planned = 0;
  return cards.filter(c => inLane(c) && !c.gate).map(card => {
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

function startDue(projectDir: string, file: string, now: Date): RunResult {
  const last: LastRun | null = existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : null;
  const after = last ? new Date(last.at) : new Date(now.getTime() - FIRST_RUN_LOOKBACK_MS);
  const slots = { ...(last?.slots ?? {}) };
  const seen = { ...(last?.git ?? {}) };
  const result: RunResult = { created: [], skipped: [], advanced: [] };

  for (const lane of loadLanes(projectDir)) {
    const args = GIT_VALUE[lane.trigger?.on ?? ''];
    if (!args) continue;
    const value = git(projectDir, args);
    // The last value is recorded per lane, so the same HEAD or tag starts one card however often this runs.
    if (!value || seen[lane.id] === value) continue;
    try {
      const label = lane.trigger!.on === 'git.commit' ? value.slice(0, 7) : value;
      const card = createCard(projectDir, { lane: lane.id, title: `${lane.id} ${label}`, now, note: `${lane.trigger!.on} ${value}` });
      result.created.push({ lane: lane.id, id: card.id, slot: value, trigger: `${lane.trigger!.on} ${label}` });
      seen[lane.id] = value;
    } catch (e) {
      if (!(e instanceof RefusalError)) throw e;
      result.skipped.push({ lane: lane.id, reason: e.message });
    }
  }

  for (const lane of loadLanes(projectDir)) {
    if (!lane.trigger?.cron) continue;
    // One lane's unreadable schedule is that lane's problem; the others still run.
    let due: Date | null;
    try {
      due = lastDueSlot(lane.trigger.cron, after, now);
    } catch (e) {
      result.skipped.push({ lane: lane.id, reason: (e as Error).message });
      continue;
    }
    const slot = due?.toISOString();
    // The slot is recorded per lane, so a re-run inside the same window cannot create a second card.
    if (!slot || slots[lane.id] === slot) continue;
    try {
      const card = createCard(projectDir, { lane: lane.id, title: `${lane.id} ${localDate(due!)}`, now, note: `cron ${lane.trigger.cron}` });
      result.created.push({ lane: lane.id, id: card.id, slot, trigger: `cron ${lane.trigger.cron}` });
      slots[lane.id] = slot;
    } catch (e) {
      if (!(e instanceof RefusalError)) throw e;
      result.skipped.push({ lane: lane.id, reason: e.message });
    }
  }

  // A refused slot must be found again next run, so the window start only moves when nothing was skipped.
  const at = result.skipped.length ? after.toISOString() : now.toISOString();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ at, slots, git: seen }, null, 2) + '\n');
  return result;
}
