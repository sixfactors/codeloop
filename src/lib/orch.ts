/**
 * The orchestrator: one turn takes a story through its current stage with a builder agent, gates
 * the result and merges it. A turn is seven steps (worktree, brief, builder, hand-back, gate,
 * merge, report); every one is an existing operation, so this file only sequences them and keeps
 * the record `.codeloop/state/orch/<card>.json`. The orchestrator itself never edits the worktree.
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { AGENT_RUNS_DIR, briefPath, buildBrief, loadAgents, resolveAgent, runAgent, type AgentConfig } from './agent.js';
import { activeSessions, currentSession, type SessionCard } from './active-card.js';
import { appendActivity } from './activity.js';
import { DONE, findCard, readCards, RefusalError, safeName, writeCards, type Card } from './cards.js';
import { clock } from './clock.js';
import { currentStage, advanceCard, recordEvent, type Outcome } from './engine.js';
import { listGates, runGate, type GateRecord } from './gate.js';
import { listHandbacks, type HandbackRecord } from './handback.js';
import { loadConfig } from './config.js';
import { openQuestions } from './interview.js';
import { loadLane } from './lane.js';
import { builderIdle, NUDGE_PREFIX } from './stall.js';
import { checkEnv } from './shell.js';
import { waitUnderCeiling, type MemoryProbe } from './memory.js';
import { ensureStoryWorktree, mergeStory } from './worktree.js';
import { dropLease, holdsLease, isolation, placeTurn, takeLease, treeRange, type Mode } from './orch-isolation.js';
import { AgentRefusal, agentStatus, isUnavailable, noteAgentRun, quickExitMs, startsToday } from './agent-ledger.js';
import { LockedError, withRunLock, withRunLockSync } from './run-lock.js';
import { Budget } from './budget.js';

export const ORCH_DIR = '.codeloop/state/orch';
const DAY_MS = 24 * 60 * 60 * 1000;
const FOOTER = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates/orch/brief-footer.md');
const FOOTER_TREE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates/orch/brief-footer-tree.md');

export interface OrchTurn {
  n: number;
  stage: string;
  startedAt: string;
  endedAt?: string;
  agent: string;
  worktree: string;
  branch: string;
  /** What the builder reported, when it reported. */
  handback?: { head: string; proofExit: number; left: string; blocked: string; at: string; selfcheck?: { pass: boolean; failing: string[] } };
  gate?: { verdict: 'pass' | 'fail'; findings: string[]; proof?: { cmd: string; exit: number } };
  merge?: { sha: string; mode: 'ff' | 'merge' };
  /** What ran on the main tree after the merge: verify, then the project's build and restart. */
  postMerge?: PostMergeStep[];
  /** The engine's result of the advance after the merge. */
  advance?: Outcome;
  /** `briefed`: a session or person was handed the brief and has not handed back yet. */
  /** `check-error`: the stage check itself crashed; no retry is spent. `builder-unavailable`: the agent cannot run (not logged in); no retry is spent. */
  /** `merge-failed`: the gate passed but the merge did not; the work was right, so it costs no retry. */
  /** `waiting-lease`: another live story leases a file this one's plan names; `queued`: orch.max_builders were already running. Neither ran a builder or costs a retry; the doctor tick tries again. `locked`: another run held the repo lock past orch.lock_wait_minutes; no retry is spent. */
  outcome: 'merged' | 'failed' | 'stuck' | 'briefed' | 'merge-failed' | 'questions' | 'check-error' | 'builder-unavailable' | 'locked' | 'waiting-lease' | 'queued';
  /** Where the builder worked: the main tree (`tree`, no merge step) or its own worktree. */
  mode?: Mode;
  builderKind?: 'agent' | 'session' | 'person';
  findings: string[];
  /** Set when the hand-back gated was recorded before the turn started. */
  note?: string;
  log?: string;
}

export interface PostMergeStep {
  name: 'verify' | 'build' | 'restart';
  cmd: string;
  exit: number | null;
}

export interface OrchRecord {
  card: string;
  turns: OrchTurn[];
  /** Why the last `orchRun` stopped, kept so `orch status` can say it after the process is gone. */
  stopped?: { reason: string; at: string };
}

export interface OrchOptions {
  agent?: string;
  /** A gate name or a stage id to stop at; any gate stops the loop anyway. */
  until?: string;
  /** `agent[:name]` (default), `session:<id-or-label-prefix>` or `person`. */
  builder?: string;
  /** The run's budget; default one from orch.budget. A caller running several stories shares one. */
  budget?: Budget;
  /** How long to wait for the repo lock; default orch.lock_wait_minutes (10). */
  lockWaitMs?: number;
  /** Minutes to wait for a session or person's hand-back; `false` returns at once with outcome `briefed`. Default `orch.wait_minutes` (120). */
  wait?: number | false;
  /** Replaces the process-table reading and the sleep when waiting under `limits.max_memory_mb`; tests only. */
  memory?: MemoryProbe;
}

export const ORCH_OUTBOX_DIR = `${ORCH_DIR}/outbox`;
export const DEFAULT_WAIT_MINUTES = 120;
const POLL_MS = 15_000;
const outboxMark = (card: string, n: number) => `<!-- orch-brief ${card} turn ${n} -->`;

export type BuilderSpec = { kind: 'agent'; name?: string } | { kind: 'session'; ref: string } | { kind: 'person' };

export function parseBuilder(text?: string, agent?: string): BuilderSpec {
  const t = (text ?? '').trim();
  if (!t || t === 'agent') return { kind: 'agent', name: agent };
  if (t.startsWith('agent:')) return { kind: 'agent', name: t.slice(6) || agent };
  if (t === 'person') return { kind: 'person' };
  if (t.startsWith('session:') && t.length > 8) return { kind: 'session', ref: t.slice(8) };
  throw new RefusalError(`unknown builder "${t}": use agent[:name], session:<id-or-label-prefix> or person`);
}

function findSession(projectDir: string, ref: string): SessionCard {
  const all = activeSessions(projectDir);
  const hit = all.find(s => s.session === ref) ?? all.find(s => s.session.startsWith(ref) || (s.label ?? '').startsWith(ref));
  if (!hit) throw new RefusalError(`no live session matches "${ref}" under ${ACTIVE_SESSIONS_DIR_HINT}`);
  return hit;
}
const ACTIVE_SESSIONS_DIR_HINT = '.codeloop/state/active';

export function waitMinutes(projectDir: string, opt?: number): number {
  if (typeof opt === 'number' && opt >= 0) return opt;
  const orch = (loadConfig(projectDir) as { orch?: unknown }).orch;
  const v = orch && typeof orch === 'object' ? (orch as { wait_minutes?: unknown }).wait_minutes : undefined;
  return typeof v === 'number' && v >= 0 ? v : DEFAULT_WAIT_MINUTES;
}

export interface OrchRunResult {
  card: string;
  turns: OrchTurn[];
  stopped: string;
}

export interface OrchStatusRow {
  card: string;
  title: string;
  stage: string;
  gate?: string;
  turns: number;
  lastOutcome?: OrchTurn['outcome'];
  builder?: string;
  /** Who built the last turn, as a person reads it: "agent claude", "claude on dean-mbp", "a person". */
  builderLabel?: string;
  idleMinutes: number;
  /** Quiet longer than `monitor.stall_minutes`. */
  stalled: boolean;
  /** Where the last turn's builder worked, or `orch.isolation` for a story with no turn that ran a builder yet. */
  mode: Mode | 'auto';
  /** A builder holds this story's plan files now. */
  lease: boolean;
}

export interface OrchReport {
  card: string;
  stage: string;
  works: string;
  proof: string;
  left: string;
  nextGate: string;
  text: string;
}

const file = (projectDir: string, card: string) => join(projectDir, ORCH_DIR, `${safeName(card, 'card id')}.json`);

export function readOrch(projectDir: string, cardRef: string): OrchRecord {
  const id = findCard(readCards(projectDir).cards, cardRef).id;
  const path = file(projectDir, id);
  if (!existsSync(path)) return { card: id, turns: [] };
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as OrchRecord;
  } catch {
    return { card: id, turns: [] };
  }
}

function saveOrch(projectDir: string, record: OrchRecord): void {
  const path = file(projectDir, record.card);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`);
}

/** The brief an orchestrated builder gets: the stage brief, the last gate's findings, then the rules and the hand-back line. */
export function orchBrief(projectDir: string, card: Card, worktree: string, branch: string, findings: string[], mode: Mode = 'worktree'): string {
  const footer = readFileSync(mode === 'tree' ? FOOTER_TREE : FOOTER, 'utf-8')
    .replaceAll('{{card}}', card.id)
    .replaceAll('{{worktree}}', worktree)
    .replaceAll('{{branch}}', branch)
    .replaceAll('{{project}}', projectDir);
  const feedback = findings.length ? ['## Latest gate findings', '', `Latest gate findings: the last turn did not pass the gate.`, '', ...findings.map(f => `- ${f}`), ''].join('\n') : '';
  return `${buildBrief(projectDir, card).trimEnd()}\n\n${feedback}${feedback ? '\n' : ''}${footer}`;
}


/** The engine's `check-error` event, written once per distinct tail: a crashed check spends no retry. */
function checkError(projectDir: string, id: string, stage: string, tail: string): void {
  const last = findCard(readCards(projectDir).cards, id).events.filter(e => e.stage === stage).at(-1);
  if (last?.action === 'check-error' && last.note === tail) return;
  recordEvent(projectDir, id, () => ({ action: 'check-error', stage, note: tail }));
}

/** A failed turn costs a retry, the same way a failed check does; the lane's last retry parks the story stuck. */
function countFailure(projectDir: string, id: string, note: string): 'failed' | 'stuck' {
  const file = readCards(projectDir);
  const card = findCard(file.cards, id);
  // Parked stories take no more failures: `retries` never passes `lane.retries`.
  if (card.gate === 'stuck') return 'stuck';
  const lane = loadLane(projectDir, card.lane);
  const stage = currentStage(lane, card);
  const now = clock().toISOString();
  const failures = Math.min((card.retries[stage.id] ?? 0) + 1, lane.retries);
  const stuck = failures >= lane.retries;
  const ev = (action: string) => ({ at: now, actor: 'engine', human: false, action, stage: stage.id, note });
  const next: Card = {
    ...card,
    retries: { ...card.retries, [stage.id]: failures },
    events: [...card.events, ev('fail'), ...(stuck ? [ev('stuck')] : [])],
    ...(stuck ? { gate: 'stuck', awaiting: 'owner' as const } : {}),
    updatedAt: now,
  };
  writeCards(projectDir, file, file.cards.map(c => (c.id === card.id ? next : c)));
  return stuck ? 'stuck' : 'failed';
}

const outboxFile = (projectDir: string, to: string) => join(projectDir, ORCH_OUTBOX_DIR, `${safeName(to, 'session id')}.md`);

/** Steps 4 to 7: take the hand-back recorded since the turn began, gate it, merge it, record the turn. */
function settle(projectDir: string, record: OrchRecord, turn: OrchTurn, noHandback: string): OrchTurn {
  const card = findCard(readCards(projectDir).cards, record.card);
  const started = Date.parse(turn.startedAt);
  // 4. hand-back: the newest one for this card recorded after the turn started
  const all = listHandbacks(projectDir, card.id).filter(h => h.stage === card.stage);
  let hb: HandbackRecord | undefined = all.find(h => Date.parse(h.at) >= started);
  if (!hb) {
    // A hand-back stamped before the turn began (clock skew, or the builder handed back early) is
    // still the builder's work unless it is the one the last turn already gated.
    const lastGated = record.turns.at(-1)?.handback?.head;
    hb = all.find(h => h.head !== lastGated);
    if (hb) turn.note = `using hand-back ${hb.head.slice(0, 8)} recorded at ${hb.at}, before this turn started (${turn.startedAt}); it is not the last gated head`;
  }
  let mergeFailed = false;
  let crashed = false;
  // A stage whose check waits on a person's answers is waiting, not failing: nothing to gate yet.
  const open = openQuestions(projectDir, card);
  if (open.length) {
    turn.note = `waiting for answers: ${open.map(q => `Q${q.n}`).join(', ')} on ${card.id}`;
    turn.outcome = 'questions';
    turn.endedAt = new Date().toISOString();
    upsertTurn(record, turn);
    saveOrch(projectDir, record);
    appendActivity(projectDir, card.id, { kind: 'orch', stage: turn.stage, n: turn.n, outcome: 'questions', text: turn.note });
    return turn;
  }
  if (!hb) {
    turn.findings.push(noHandback);
  } else {
    turn.handback = { head: hb.head, proofExit: hb.proof.exit, left: hb.left, blocked: hb.blocked, at: hb.at, ...(hb.selfcheck ? { selfcheck: hb.selfcheck } : {}) };
    // 5. gate
    const gate = runGate(projectDir, card.id, { handbackId: hb.head, ...(turn.mode === 'tree' ? { storyRef: treeRange(projectDir, card.id, hb.head) } : {}) });
    turn.gate = { verdict: gate.verdict, findings: gate.findings, proof: { cmd: gate.proof.cmd, exit: gate.proof.exit } };
    if (gate.checkCrashed !== undefined) {
      checkError(projectDir, card.id, turn.stage, gate.checkCrashed);
      turn.findings.push(...gate.findings);
      crashed = true;
    } else if (gate.verdict === 'fail') turn.findings.push(...gate.findings, ...(turn.note ? [turn.note] : []), ...(turn.mode === 'tree' ? ['fix forward with a new commit on the branch; nothing was reset or reverted'] : []));
    else if (turn.mode === 'tree') {
      // 6. tree mode: the commits are already on the branch, so there is no merge; the engine advances.
      const adv = advanceCard(projectDir, card.id, { unattended: true });
      turn.advance = adv.outcome;
      if (adv.outcome === 'check-error') {
        crashed = true;
        turn.findings.push(`stage check crashed after the gate: ${(adv.output ?? '').split('\n').slice(-3).join(' ').slice(0, 300)}`);
      } else if (adv.outcome === 'failed' || adv.outcome === 'stuck') {
        turn.outcome = adv.outcome === 'stuck' ? 'stuck' : 'failed';
        turn.findings.push(`stage check failed after the gate${adv.output ? `: ${adv.output.split('\n').slice(-3).join(' ').slice(0, 300)}` : ''}`);
      } else {
        turn.outcome = 'merged';
        const after = postMerge(projectDir, card.id, turn.stage, hb.head);
        turn.postMerge = after.steps;
        if (after.failed) {
          turn.findings.push(after.failed);
          turn.outcome = parkAfterMerge(projectDir, card.id, after.failed);
        }
      }
    } else {
      // 6. merge, then the engine's own advance
      try {
        const merged = mergeStory(projectDir, card.id);
        turn.merge = { sha: merged.sha, mode: merged.mode };
        const adv = advanceCard(projectDir, card.id, { unattended: true });
        turn.advance = adv.outcome;
        if (adv.outcome === 'check-error') {
          crashed = true;
          turn.findings.push(`stage check crashed after the merge: ${(adv.output ?? '').split('\n').slice(-3).join(' ').slice(0, 300)}`);
        } else if (adv.outcome === 'failed' || adv.outcome === 'stuck') {
          turn.outcome = adv.outcome === 'stuck' ? 'stuck' : 'failed';
          turn.findings.push(`stage check failed after the merge${adv.output ? `: ${adv.output.split('\n').slice(-3).join(' ').slice(0, 300)}` : ''}`);
        } else {
          turn.outcome = 'merged';
          // 6b. after the merge: what a person otherwise runs by hand on the main tree.
          const after = postMerge(projectDir, card.id, turn.stage, merged.sha);
          turn.postMerge = after.steps;
          if (after.failed) {
            turn.findings.push(after.failed);
            turn.outcome = parkAfterMerge(projectDir, card.id, after.failed);
          }
        }
      } catch (e) {
        if (!(e instanceof RefusalError)) throw e;
        turn.findings.push(e.message);
        mergeFailed = true;
      }
    }
  }

  if (!turn.findings.length) turn.outcome = 'merged';
  else if (crashed) turn.outcome = 'check-error';
  else if (mergeFailed) turn.outcome = 'merge-failed';
  else if (!turn.advance) turn.outcome = countFailure(projectDir, card.id, turn.findings.join('; '));
  turn.endedAt = new Date().toISOString();
  upsertTurn(record, turn);
  saveOrch(projectDir, record);
  // The builder has handed back (or never will): its files are free for the next story.
  dropLease(projectDir, card.id);
  // 7. report
  appendActivity(projectDir, card.id, { kind: 'orch', stage: turn.stage, n: turn.n, outcome: turn.outcome, text: turn.findings.length ? turn.findings.join('; ') : `merged ${turn.merge?.sha.slice(0, 8) ?? ''}` });
  return turn;
}

const TAIL_BYTES = 4096;
const POST_MERGE_TIMEOUT_MS = 15 * 60_000;

/** `orch.after_merge` in config: the project's own build and restart commands, run on the main tree after every merge. */
export function afterMergeCommands(projectDir: string): { build?: string; restart?: string } {
  const orch = (loadConfig(projectDir) as { orch?: { after_merge?: { build?: unknown; restart?: unknown } } }).orch;
  const am = orch && typeof orch === 'object' ? orch.after_merge : undefined;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return { ...(str(am?.build) ? { build: str(am?.build) } : {}), ...(str(am?.restart) ? { restart: str(am?.restart) } : {}) };
}

/**
 * Runs, on the main tree at the merged HEAD: `codeloop verify <card>` when the merged stage is verify
 * or later in its lane, then `orch.after_merge.build` and `.restart`. Each step writes a `post-merge`
 * activity line with its exit and the last 4 kB of its output. The first failure stops the rest and
 * is returned as the finding.
 */
function postMerge(projectDir: string, cardId: string, mergedStage: string, sha: string): { steps: PostMergeStep[]; failed?: string } {
  const card = findCard(readCards(projectDir).cards, cardId);
  const stages = loadLane(projectDir, card.lane).stages.map(s => s.id);
  const at = stages.indexOf(mergedStage);
  const verifyAt = stages.indexOf('verify');
  const plan: { name: PostMergeStep['name']; cmd: string }[] = [];
  if (verifyAt >= 0 && at >= verifyAt) plan.push({ name: 'verify', cmd: `codeloop verify ${cardId}` });
  const named = afterMergeCommands(projectDir);
  if (named.build) plan.push({ name: 'build', cmd: named.build });
  if (named.restart) plan.push({ name: 'restart', cmd: named.restart });
  const steps: PostMergeStep[] = [];
  if (!plan.length) return { steps };
  // A build or restart never overlaps another run's: the repo lock (re-entrant for this turn's own holder).
  return withRunLockSync(projectDir, `post-merge ${cardId}`, () => {
  for (const step of plan) {
    const run = spawnSync(step.cmd, { cwd: projectDir, shell: true, encoding: 'utf-8', timeout: POST_MERGE_TIMEOUT_MS, env: checkEnv() });
    const exit = run.error && !run.status ? null : run.status;
    const tail = Buffer.from(`${run.stdout ?? ''}${run.stderr ?? ''}`).subarray(-TAIL_BYTES).toString('utf-8');
    steps.push({ ...step, exit });
    appendActivity(projectDir, cardId, { kind: 'post-merge', step: step.name, cmd: step.cmd, exit, sha, text: tail });
    if (exit !== 0) return { steps, failed: `after the merge, ${step.name} (\`${step.cmd}\`) exited ${exit ?? 'without finishing'}: ${tail.trim().split('\n').slice(-5).join(' | ').slice(-600)}` };
  }
  return { steps };
  });
}

/** A post-merge failure parks the story for its owner: the merge stands, but nobody is told it works. */
function parkAfterMerge(projectDir: string, id: string, finding: string): 'stuck' {
  const file = readCards(projectDir);
  const card = findCard(file.cards, id);
  const now = clock().toISOString();
  const next: Card = { ...card, gate: 'stuck', awaiting: 'owner', events: [...card.events, { at: now, actor: 'engine', human: false, action: 'stuck', stage: card.stage, note: finding }], updatedAt: now };
  writeCards(projectDir, file, file.cards.map(c => (c.id === card.id ? next : c)));
  return 'stuck';
}

function upsertTurn(record: OrchRecord, turn: OrchTurn): void {
  const i = record.turns.findIndex(t => t.n === turn.n);
  if (i >= 0) record.turns[i] = turn;
  else record.turns.push(turn);
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Polls for a hand-back recorded after the turn began; one `doctor` nudge when the card's stream goes quiet for `monitor.stall_minutes`. */
async function awaitHandback(projectDir: string, cardId: string, turn: OrchTurn, minutes: number): Promise<boolean> {
  const started = Date.parse(turn.startedAt);
  const deadline = Date.now() + minutes * 60_000;
  for (;;) {
    if (listHandbacks(projectDir, cardId).some(h => Date.parse(h.at) >= started && h.stage === turn.stage)) return true;
    const idle = builderIdle(projectDir, cardId);
    if (idle.stalled && !idle.nudged) appendActivity(projectDir, cardId, { kind: 'doctor', text: `${NUDGE_PREFIX} ${idle.idleMinutes} min on ${turn.stage}: hand back with the line in the brief` });
    const left = deadline - Date.now();
    if (left <= 0) return false;
    await sleep(Math.min(POLL_MS, left));
  }
}

const currentBranch = (projectDir: string): string => {
  const r = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: projectDir, encoding: 'utf-8' });
  if (r.status !== 0) throw new RefusalError(`cannot read the checked-out branch: ${r.stderr.trim()}`);
  return r.stdout.trim();
};

/**
 * One turn: the story's current stage through the builder, the gate, and the merge. The repo lock is
 * held for the board steps (placing the turn, then gating and merging it) and released while the
 * builder works, so `orch.max_builders` builders run side by side on disjoint leased plans. A turn
 * that cannot take the lock within orch.lock_wait_minutes is recorded as `locked`, names the holder
 * and spends no retry; one that ran its builder and then could not settle is resumed with
 * `codeloop orch resume`.
 */
export async function orchTurn(projectDir: string, cardRef: string, opts: OrchOptions = {}): Promise<OrchTurn> {
  const id = findCard(readCards(projectDir).cards, cardRef).id;
  try {
    return await orchTurnSteps(projectDir, id, opts);
  } catch (e) {
    if (!(e instanceof LockedError)) throw e;
    const record = readOrch(projectDir, id);
    const card = findCard(readCards(projectDir).cards, id);
    const at = new Date().toISOString();
    const turn: OrchTurn = { n: record.turns.length + 1, stage: card.stage, startedAt: at, endedAt: at, agent: opts.agent ?? '', worktree: '', branch: '', outcome: 'locked', findings: [e.message] };
    upsertTurn(record, turn);
    saveOrch(projectDir, record);
    appendActivity(projectDir, id, { kind: 'orch', stage: card.stage, n: turn.n, outcome: 'locked', text: e.message });
    return turn;
  }
}

async function orchTurnSteps(projectDir: string, cardRef: string, opts: OrchOptions = {}): Promise<OrchTurn> {
  const locked = <T>(what: string, fn: () => Promise<T> | T) => withRunLock(projectDir, `orch ${cardRef} ${what}`, fn, opts.lockWaitMs);
  const ready = await locked('placement', () => placeAndBrief(projectDir, cardRef, opts));
  if ('done' in ready) return ready.done;
  const { record, turn, card, agent, brief, wt, mode, builderName } = ready;
  // 3. builder: outside the lock, so another story's builder can work at the same time.
  if (!agent) {
    if (opts.wait === false) return turn;
    const got = await awaitHandback(projectDir, card.id, turn, waitMinutes(projectDir, opts.wait));
    return settleLocked(projectDir, record, turn, got ? 'no hand-back' : 'no hand-back within the wait', opts);
  }
  void builderName;
  // A builder is a new process tree; start it only while codeloop's total is under the ceiling.
  // Waited for outside the lock, so a turn waiting on memory never holds back another story's gate.
  await waitUnderCeiling(projectDir, opts.memory);
  let log = '';
  recordEvent(projectDir, card.id, (_cards, current) => {
    const k = current.events.filter(e => e.action === 'agent-start' && e.stage === card.stage).length + 1;
    log = `${AGENT_RUNS_DIR}/${card.id}-${safeName(card.stage, 'stage id')}-${k}.log`;
    return { action: 'agent-start', agent: agent.name, log };
  });
  turn.log = log;
  const ran = await runAgent(projectDir, agent, brief, join(projectDir, log), { cwd: wt.path, env: mode === 'tree' ? { CODELOOP_CARD: card.id, CODELOOP_PROJECT_DIR: projectDir } : { CODELOOP_CARD: card.id, CODELOOP_PROJECT_DIR: projectDir, CODELOOP_WORK_DIR: wt.path } });
  recordEvent(projectDir, card.id, () => ({ action: 'agent-run', agent: agent.name, exit: ran.exit, durationMs: ran.durationMs, log, ...(ran.timedOut ? { note: `timed out after ${agent.timeoutMinutes} minutes` } : {}) }));
  // An agent that exits within seconds with nothing handed back could not run (not logged in, not
  // installed): that is a stop, not a failed attempt, and the second in a row marks it unavailable.
  const handedBack = listHandbacks(projectDir, card.id).some(h => Date.parse(h.at) >= Date.parse(turn.startedAt) && h.stage === card.stage);
  const marked = noteAgentRun(projectDir, agent.name, { durationMs: ran.durationMs, handedBack, exit: ran.exit });
  if (!handedBack && ran.durationMs < quickExitMs(projectDir)) {
    turn.outcome = 'builder-unavailable';
    turn.findings.push(`agent ${agent.name} exited ${ran.exit ?? 'without a code'} after ${Math.round(ran.durationMs / 100) / 10} s with nothing handed back${marked ? `; it is now marked unavailable until \`codeloop agent clear ${agent.name}\`` : ''} (see ${log})`);
    turn.endedAt = new Date().toISOString();
    upsertTurn(record, turn);
    saveOrch(projectDir, record);
    dropLease(projectDir, card.id);
    appendActivity(projectDir, card.id, { kind: 'orch', stage: turn.stage, n: turn.n, outcome: turn.outcome, text: turn.findings.join('; ') });
    return turn;
  }
  return settleLocked(projectDir, record, turn, ran.timedOut ? `no hand-back (the agent timed out after ${agent.timeoutMinutes} minutes)` : `no hand-back (the agent exited ${ran.exit})`, opts);
}

/**
 * Settles under the repo lock. A builder's work is already done, so a turn that cannot take the lock
 * is kept as `locked` with its lease, for `codeloop orch resume`, rather than thrown away.
 */
async function settleLocked(projectDir: string, record: OrchRecord, turn: OrchTurn, noHandback: string, opts: OrchOptions): Promise<OrchTurn> {
  try {
    return await withRunLock(projectDir, `orch ${record.card} gate`, () => settle(projectDir, record, turn, noHandback), opts.lockWaitMs);
  } catch (e) {
    if (!(e instanceof LockedError)) throw e;
    turn.outcome = 'locked';
    turn.findings.push(`${e.message}; the builder's work is kept: \`codeloop orch resume ${record.card}\` gates it once the lock is free`);
    upsertTurn(record, turn);
    saveOrch(projectDir, record);
    appendActivity(projectDir, record.card, { kind: 'orch', stage: turn.stage, n: turn.n, outcome: 'locked', text: e.message });
    return turn;
  }
}

type Placed =
  | { done: OrchTurn }
  | { record: OrchRecord; turn: OrchTurn; card: Card; agent?: AgentConfig; brief: string; wt: { path: string; branch: string }; mode: Mode; builderName: string };

/** Steps 1 and 2 under the lock: checks, where the builder works (or why it waits), the lease, the brief. */
async function placeAndBrief(projectDir: string, cardRef: string, opts: OrchOptions): Promise<Placed> {
  const first = findCard(readCards(projectDir).cards, cardRef);
  if (first.stage === DONE) throw new RefusalError(`card ${first.id} is done`);
  const asked = openQuestions(projectDir, first);
  if (asked.length) throw new RefusalError(`${first.id} is waiting for answers: ${asked.map(q => `Q${q.n}`).join(', ')}; answer them and run again`);
  if (first.gate) throw new RefusalError(`card ${first.id} is waiting at gate "${first.gate}" (${first.awaiting} approves)`);
  const lane = loadLane(projectDir, first.lane);
  const spec = parseBuilder(opts.builder, opts.agent);
  const now = clock();
  let agent: AgentConfig | undefined;
  let session: SessionCard | undefined;
  if (spec.kind === 'agent') {
    agent = resolveAgent(projectDir, spec.name, lane.agent);
    if (isUnavailable(projectDir, agent.name)) throw new AgentRefusal(`agent ${agent.name} is marked unavailable (${agentStatus(projectDir, agent.name).unavailable!.reason}); fix it, then run \`codeloop agent clear ${agent.name}\``, 'unavailable');
    const used = startsToday(projectDir, agent.name, now);
    if (used >= agent.maxRunsPerDay) throw new AgentRefusal(`agent ${agent.name} has started ${used} times today (max_runs_per_day is ${agent.maxRunsPerDay})`, 'ledger');
  } else if (spec.kind === 'session') session = findSession(projectDir, spec.ref);
  const builderName = agent?.name ?? (session ? (session.label ?? session.session) : 'person');

  // 1. where the builder works: the main tree under a lease, its own worktree, or nowhere yet
  const record = readOrch(projectDir, first.id);
  const placed = placeTurn(projectDir, first.id);
  if ('wait' in placed) {
    const waiting: OrchTurn = { n: record.turns.length + 1, stage: first.stage, startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), agent: builderName, builderKind: spec.kind, worktree: '', branch: '', outcome: placed.wait === 'lease' ? 'waiting-lease' : 'queued', findings: [], note: placed.why };
    upsertTurn(record, waiting);
    saveOrch(projectDir, record);
    appendActivity(projectDir, first.id, { kind: 'orch', stage: first.stage, n: waiting.n, outcome: waiting.outcome, text: placed.why });
    return { done: waiting };
  }
  const mode: Mode = placed.mode;
  const wt = mode === 'tree' ? { path: projectDir, branch: currentBranch(projectDir) } : ensureStoryWorktree(projectDir, first.id);
  // The lease claims the plan's files for this story while the builder runs, in either mode.
  takeLease(projectDir, first.id);
  const card = findCard(readCards(projectDir).cards, first.id);
  const n = record.turns.length + 1;
  const turn: OrchTurn = { n, stage: card.stage, startedAt: new Date().toISOString(), agent: builderName, builderKind: spec.kind, worktree: wt.path, branch: wt.branch, outcome: 'failed', findings: [], mode, note: placed.why };
  const lastFailed = [...record.turns].reverse().find(t => t.outcome !== 'waiting-lease' && t.outcome !== 'queued');
  const carried = lastFailed && lastFailed.outcome !== 'merged' && lastFailed.outcome !== 'briefed' && lastFailed.outcome !== 'questions' && lastFailed.stage === card.stage ? lastFailed.findings : [];

  // A briefed turn nobody answered is closed by the next one, without costing a retry.
  for (const t of record.turns) if (t.outcome === 'briefed' && !t.endedAt) Object.assign(t, { outcome: 'failed', endedAt: turn.startedAt, findings: [`superseded by turn ${n}`] });
  // 2. brief
  const brief = join(projectDir, briefPath(card));
  mkdirSync(dirname(brief), { recursive: true });
  const briefText = orchBrief(projectDir, card, wt.path, wt.branch, carried, mode);
  writeFileSync(brief, briefText);

  // The brief goes to a session's or the person's outbox; an agent is started by the caller, unlocked.
  if (!agent) {
    const to = session ? session.session : 'person';
    const outbox = outboxFile(projectDir, to);
    mkdirSync(dirname(outbox), { recursive: true });
    writeFileSync(outbox, `${outboxMark(card.id, n)}\n${briefText.trimEnd()}\n\n`, { flag: 'a' });
    turn.outcome = 'briefed';
    upsertTurn(record, turn);
    saveOrch(projectDir, record);
    appendActivity(projectDir, card.id, { kind: 'orch-brief', to: session ? (session.label ?? session.session) : 'person', stage: card.stage, n, text: `brief at ${briefPath(card)}` });
    console.log(`  brief for ${card.id} (${builderName}): ${brief}`);
    console.log(`  outbox: ${outbox}`);
    console.log(`  hand-back line: codeloop card handback ${card.id} --branch ${wt.branch} --head "$(git rev-parse HEAD)" --proof "<proof command>" --left "<what is left>" --blocked "<what blocked you, or empty>"${mode === 'worktree' ? ` --worktree "${wt.path}"` : ''}`);
  }
  return { record, turn, card, ...(agent ? { agent } : {}), brief, wt, mode, builderName };
}

/** Picks up a briefed turn once its hand-back exists: gate, merge, advance. */
export function orchResume(projectDir: string, cardRef: string): OrchTurn {
  const card = findCard(readCards(projectDir).cards, cardRef);
  const record = readOrch(projectDir, card.id);
  const turn = [...record.turns].reverse().find(t => (t.outcome === 'briefed' || (t.outcome === 'locked' && t.mode)) && !t.endedAt);
  if (!turn) throw new RefusalError(`card ${card.id} has no briefed or locked turn to resume`);
  if (card.gate) throw new RefusalError(`card ${card.id} is waiting at gate "${card.gate}" (${card.awaiting} approves)`);
  const started = Date.parse(turn.startedAt);
  if (!listHandbacks(projectDir, card.id).some(h => Date.parse(h.at) >= started && h.stage === turn.stage)) throw new RefusalError(`no hand-back for ${card.id} ${turn.stage} since the brief; the builder has not handed back yet`);
  return settle(projectDir, record, turn, 'no hand-back');
}

/** Briefs waiting for this session, and for the person, that no hand-back has answered yet. */
export function orchInbox(projectDir: string, session: string | undefined = currentSession()): { to: string; card: string; n: number; text: string }[] {
  const out: { to: string; card: string; n: number; text: string }[] = [];
  for (const to of [...(session ? [session] : []), 'person']) {
    const path = outboxFile(projectDir, to);
    if (!existsSync(path)) continue;
    for (const part of readFileSync(path, 'utf-8').split(/^(?=<!-- orch-brief )/m)) {
      const m = /^<!-- orch-brief (\S+) turn (\d+) -->\n/.exec(part);
      if (!m) continue;
      const open = readOrch(projectDir, m[1]).turns.some(t => t.n === Number(m[2]) && t.outcome === 'briefed' && !t.endedAt);
      if (open) out.push({ to, card: m[1], n: Number(m[2]), text: part.slice(m[0].length).trim() });
    }
  }
  return out;
}

/** What made a turn fail, as a stable string: two turns with the same one learned nothing new. */
const fingerprint = (t: OrchTurn) => `${t.outcome}|${t.stage}|${t.findings.join(';')}`;

/** The reason a run should stop after `turns` (this invocation's turns, newest last), if it should. */
function breaker(turns: OrchTurn[]): string | undefined {
  const last = turns.at(-1);
  if (!last || last.outcome === 'merged') return undefined;
  const lastThree = turns.slice(-3);
  if (lastThree.length === 3 && lastThree.every(t => t.outcome === 'failed' && t.stage === last.stage)) return `failed 3 times in a row on ${last.stage}; fix the cause before running again`;
  const prev = turns.at(-2);
  if (prev && fingerprint(prev) === fingerprint(last)) return `the same failure twice on ${last.stage} (${last.outcome}): ${last.findings.join('; ').slice(0, 300)}; not retrying`;
  return undefined;
}

/** Turns until the story parks at a gate, is stuck or done, reaches `until`, a breaker trips, or the agent runs out of starts for the day. */
export async function orchRun(projectDir: string, cardRef: string, opts: OrchOptions = {}): Promise<OrchRunResult> {
  const id = findCard(readCards(projectDir).cards, cardRef).id;
  const turns: OrchTurn[] = [];
  const stop = (stopped: string): OrchRunResult => {
    const record = readOrch(projectDir, id);
    record.stopped = { reason: stopped, at: new Date().toISOString() };
    saveOrch(projectDir, record);
    return { card: id, turns, stopped };
  };
  const budget = opts.budget ?? Budget.for(projectDir);
  for (;;) {
    const card = findCard(readCards(projectDir).cards, id);
    if (card.stage === DONE) return stop('done');
    if (card.gate === 'stuck') return stop('stuck');
    if (card.gate) return stop(`gate ${card.gate}`);
    if (opts.until && card.stage === opts.until) return stop(`reached ${opts.until}`);
    const spent = budget.stop(`${id}:${card.stage}`);
    if (spent) return stop(spent);
    let turn: OrchTurn;
    try {
      turn = await orchTurn(projectDir, id, opts);
    } catch (e) {
      if (e instanceof AgentRefusal) return stop(`${e.kind === 'unavailable' ? 'builder-unavailable' : 'refused'}: ${e.message}`);
      if (e instanceof RefusalError && /waiting for answers/.test(e.message)) return stop('waiting for answers');
      if (e instanceof RefusalError) return stop(`refused: ${e.message}`);
      throw e;
    }
    turns.push(turn);
    budget.turn();
    if (turn.log) budget.agentStart();
    if (turn.outcome === 'failed') budget.fail(`${id}:${turn.stage}`);
    if (turn.outcome === 'builder-unavailable') return stop(`builder-unavailable: ${turn.findings.at(-1) ?? ''}`);
    if (turn.outcome === 'locked') return stop(turn.findings.at(-1) ?? 'locked');
    if (turn.outcome === 'briefed') return stop('briefed');
    if (turn.outcome === 'questions') return stop('waiting for answers');
    if (turn.outcome === 'merge-failed') return stop(`merge failed: ${turn.findings.at(-1)}`);
    if (turn.outcome === 'stuck') return stop('stuck');
    if (turn.outcome === 'check-error') return stop(`the stage check itself crashed; fix the tool before retrying: ${turn.findings.at(-1)?.slice(0, 300) ?? ''}`);
    const tripped = breaker(turns);
    if (tripped) return stop(tripped);
  }
}

/** Stories whose last orchestrated turn waited for a lease or a builder slot and are still in a lane with no gate. */
export function waitingOrchCards(projectDir: string): string[] {
  const dir = join(projectDir, ORCH_DIR);
  if (!existsSync(dir)) return [];
  const cards = readCards(projectDir).cards;
  return readdirSync(dir).filter(f => f.endsWith('.json')).flatMap(f => {
    try {
      const rec = JSON.parse(readFileSync(join(dir, f), 'utf-8')) as OrchRecord;
      const last = rec.turns.at(-1);
      const card = cards.find(c => c.id === rec.card);
      return card && !card.gate && card.stage !== DONE && (last?.outcome === 'waiting-lease' || last?.outcome === 'queued') ? [card.id] : [];
    } catch {
      return [];
    }
  });
}

export function orchStatus(projectDir: string): OrchStatusRow[] {
  const dir = join(projectDir, ORCH_DIR);
  if (!existsSync(dir)) return [];
  const cards = readCards(projectDir).cards;
  const rows: OrchStatusRow[] = [];
  for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
    let rec: OrchRecord;
    try {
      rec = JSON.parse(readFileSync(join(dir, f), 'utf-8')) as OrchRecord;
    } catch {
      continue;
    }
    const card = cards.find(c => c.id === rec.card);
    if (!card) continue;
    const last = rec.turns.at(-1);
    const idle = builderIdle(projectDir, card.id);
    const ran = [...rec.turns].reverse().find(t => t.mode);
    rows.push({ card: card.id, title: card.title, stage: card.stage, ...(card.gate ? { gate: card.gate } : {}), turns: rec.turns.length, lastOutcome: last?.outcome, builder: last?.agent, ...(last ? { builderLabel: builderLabel(last) } : {}), idleMinutes: idle.idleMinutes, stalled: idle.stalled, mode: ran?.mode ?? (rec.turns.some(t => t.worktree && t.worktree !== projectDir) ? 'worktree' : isolation(projectDir)), lease: holdsLease(projectDir, card.id) });
  }
  return rows.sort((a, b) => a.card.localeCompare(b.card));
}

/** The owner's paragraph: what works now, the proof, what is left, and the next gate. */
export function orchReport(projectDir: string, cardRef: string): OrchReport {
  const card = findCard(readCards(projectDir).cards, cardRef);
  const record = readOrch(projectDir, card.id);
  const lane = loadLane(projectDir, card.lane);
  const good = [...record.turns].reverse().find(t => t.outcome === 'merged' && t.handback);
  const gateRec = listGates(projectDir, card.id)[0];
  const hb = good?.handback;
  const proofCmd = hb ? (listHandbacks(projectDir, card.id).find(h => h.head === hb.head)?.proof.cmd ?? '') : '';
  const works = good ? `${good.stage} is on the trunk at ${good.merge?.sha.slice(0, 8)} (turn ${good.n}, ${good.branch})` : 'nothing has merged yet';
  // The verdict of the gate that let this turn merge, not whichever gate ran last on the card.
  const verdict = good?.gate?.verdict ?? (hb ? gateRec?.verdict : undefined);
  const proof = hb ? `\`${proofCmd}\` exited ${hb.proofExit}${verdict ? `; the gate said ${verdict}` : ''}` : 'no passing hand-back yet';
  const left = hb ? hb.left || 'nothing was reported' : record.turns.at(-1)?.findings.join('; ') || 'the first turn has not run';
  let nextGate: string;
  if (card.stage === DONE) nextGate = 'none, the story is done';
  else if (card.gate) nextGate = card.gate;
  else {
    const from = lane.stages.findIndex(s => s.id === card.stage);
    const ahead = lane.stages.slice(Math.max(from, 0)).find(s => s.gate);
    nextGate = ahead?.gate?.name ?? 'none ahead';
  }
  const text = `${card.id} is at ${card.stage}. Works now: ${works}. Proof: ${proof}. Left: ${left}. Next gate: ${nextGate}.`;
  return { card: card.id, stage: card.stage, works, proof, left, nextGate, text };
}

/** What `POST /api/cards/:id/orch` answers with: the turn that has begun, not its result. */
export interface OrchStarted {
  card: string;
  n: number;
  status: 'running';
}

/** One turn as the story page shows it: who built it, and the full hand-back and gate it produced. */
export interface OrchTurnDetail {
  n: number;
  builder: string;
  handback?: HandbackRecord;
  gate?: GateRecord;
  /** On a turn handed to a person or session and not yet answered: where the brief is, and the line that reports back. */
  brief?: string;
  handbackLine?: string;
}

/** `GET /api/cards/:id/orch`. */
export interface OrchView {
  record: OrchRecord;
  report: OrchReport;
  /** Per turn, matched here by stage and head so a screen joins nothing. */
  details: OrchTurnDetail[];
}

/** A builder as a person reads it. Session turns already carry the session's label. */
export function builderLabel(turn: Pick<OrchTurn, 'agent' | 'builderKind'>): string {
  if (turn.builderKind === 'person' || turn.agent === 'person') return 'a person';
  if (turn.builderKind === 'session') return turn.agent;
  return `agent ${turn.agent}`;
}

const running = new Set<string>();

/** Starts a turn (or, with `until`, a run) in the background and returns at once; read the result from the record. */
export function startOrch(projectDir: string, cardRef: string, opts: OrchOptions = {}): OrchStarted {
  const id = findCard(readCards(projectDir).cards, cardRef).id;
  const key = `${projectDir}\0${id}`;
  if (running.has(key)) throw new RefusalError(`${id} already has an orchestrated turn running`);
  const card = findCard(readCards(projectDir).cards, id);
  if (card.gate) throw new RefusalError(`card ${id} is waiting at gate "${card.gate}" (${card.awaiting} approves)`);
  const started: OrchStarted = { card: id, n: readOrch(projectDir, id).turns.length + 1, status: 'running' };
  running.add(key);
  (opts.until ? orchRun(projectDir, id, opts) : orchTurn(projectDir, id, opts))
    .catch(e => appendActivity(projectDir, id, { kind: 'orch', outcome: 'error', text: (e as Error).message }))
    .finally(() => running.delete(key));
  return started;
}

export function orchView(projectDir: string, cardRef: string): OrchView {
  const record = readOrch(projectDir, cardRef);
  const handbacks = listHandbacks(projectDir, record.card);
  const gates = listGates(projectDir, record.card);
  const card = findCard(readCards(projectDir).cards, record.card);
  const details = record.turns.map((t): OrchTurnDetail => {
    if (t.outcome === 'briefed' && !t.endedAt) {
      const line = `codeloop card handback ${card.id} --branch ${t.branch} --head $(git -C ${t.worktree} rev-parse HEAD) --proof "<the command that proves it>" --worktree ${t.worktree}`;
      return { n: t.n, builder: builderLabel(t), ...(t.stage === card.stage ? { brief: briefPath(card) } : {}), handbackLine: line };
    }
    const head = t.handback?.head;
    const handback = head ? [...handbacks].reverse().find(h => h.head === head && h.stage === t.stage) ?? [...handbacks].reverse().find(h => h.head === head) : undefined;
    const gate = head ? [...gates].reverse().find(g => g.handback.head === head) : undefined;
    return { n: t.n, builder: builderLabel(t), ...(handback ? { handback } : {}), ...(gate ? { gate } : {}) };
  });
  return { record, report: orchReport(projectDir, cardRef), details };
}
