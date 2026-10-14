/**
 * The orchestrator: one turn takes a story through its current stage with a builder agent, gates
 * the result and merges it. A turn is seven steps (worktree, brief, builder, hand-back, gate,
 * merge, report); every one is an existing operation, so this file only sequences them and keeps
 * the record `.codeloop/state/orch/<card>.json`. The orchestrator itself never edits the worktree.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { AGENT_RUNS_DIR, briefPath, buildBrief, loadAgents, resolveAgent, runAgent, type AgentConfig } from './agent.js';
import { appendActivity } from './activity.js';
import { DONE, findCard, readCards, RefusalError, safeName, writeCards, type Card } from './cards.js';
import { clock } from './clock.js';
import { currentStage, advanceCard, recordEvent, type Outcome } from './engine.js';
import { listGates, runGate } from './gate.js';
import { listHandbacks, type HandbackRecord } from './handback.js';
import { loadLane } from './lane.js';
import { builderIdle } from './stall.js';
import { ensureStoryWorktree, mergeStory } from './worktree.js';

export const ORCH_DIR = '.codeloop/state/orch';
const DAY_MS = 24 * 60 * 60 * 1000;
const FOOTER = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates/orch/brief-footer.md');

export interface OrchTurn {
  n: number;
  stage: string;
  startedAt: string;
  endedAt?: string;
  agent: string;
  worktree: string;
  branch: string;
  /** What the builder reported, when it reported. */
  handback?: { head: string; proofExit: number; left: string; blocked: string; at: string };
  gate?: { verdict: 'pass' | 'fail'; findings: string[] };
  merge?: { sha: string; mode: 'ff' | 'merge' };
  /** The engine's result of the advance after the merge. */
  advance?: Outcome;
  outcome: 'merged' | 'failed' | 'stuck';
  findings: string[];
  log?: string;
}

export interface OrchRecord {
  card: string;
  turns: OrchTurn[];
}

export interface OrchOptions {
  agent?: string;
  /** A gate name or a stage id to stop at; any gate stops the loop anyway. */
  until?: string;
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
  idleMinutes: number;
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
export function orchBrief(projectDir: string, card: Card, worktree: string, branch: string, findings: string[]): string {
  const footer = readFileSync(FOOTER, 'utf-8')
    .replaceAll('{{card}}', card.id)
    .replaceAll('{{worktree}}', worktree)
    .replaceAll('{{branch}}', branch)
    .replaceAll('{{project}}', projectDir);
  const feedback = findings.length ? ['## Latest gate findings', '', `Latest gate findings: the last turn did not pass the gate.`, '', ...findings.map(f => `- ${f}`), ''].join('\n') : '';
  return `${buildBrief(projectDir, card).trimEnd()}\n\n${feedback}${feedback ? '\n' : ''}${footer}`;
}

function agentStartsToday(projectDir: string, agent: AgentConfig, now: Date): number {
  return readCards(projectDir).cards.flatMap(c => c.events).filter(e => e.action === 'agent-start' && e.agent === agent.name && now.getTime() - new Date(e.at).getTime() < DAY_MS).length;
}

/** A failed turn costs a retry, the same way a failed check does; the lane's last retry parks the story stuck. */
function countFailure(projectDir: string, id: string, note: string): 'failed' | 'stuck' {
  const file = readCards(projectDir);
  const card = findCard(file.cards, id);
  const lane = loadLane(projectDir, card.lane);
  const stage = currentStage(lane, card);
  const now = clock().toISOString();
  const failures = (card.retries[stage.id] ?? 0) + 1;
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

/** One turn: the story's current stage through the builder, the gate, and the merge. */
export async function orchTurn(projectDir: string, cardRef: string, opts: OrchOptions = {}): Promise<OrchTurn> {
  const first = findCard(readCards(projectDir).cards, cardRef);
  if (first.stage === DONE) throw new RefusalError(`card ${first.id} is done`);
  if (first.gate) throw new RefusalError(`card ${first.id} is waiting at gate "${first.gate}" (${first.awaiting} approves)`);
  const lane = loadLane(projectDir, first.lane);
  const agent = resolveAgent(projectDir, opts.agent, lane.agent);
  const now = clock();
  const limit = agentStartsToday(projectDir, agent, now);
  if (limit >= agent.maxRunsPerDay) throw new RefusalError(`agent ${agent.name} has started ${limit} times in the last 24 hours (max_runs_per_day is ${agent.maxRunsPerDay})`);

  // 1. worktree
  const wt = ensureStoryWorktree(projectDir, first.id);
  const record = readOrch(projectDir, first.id);
  const card = findCard(readCards(projectDir).cards, first.id);
  const n = record.turns.length + 1;
  const turn: OrchTurn = { n, stage: card.stage, startedAt: new Date().toISOString(), agent: agent.name, worktree: wt.path, branch: wt.branch, outcome: 'failed', findings: [] };
  const lastFailed = record.turns.at(-1);
  const carried = lastFailed && lastFailed.outcome !== 'merged' && lastFailed.stage === card.stage ? lastFailed.findings : [];

  // 2. brief
  const brief = join(projectDir, briefPath(card));
  mkdirSync(dirname(brief), { recursive: true });
  writeFileSync(brief, orchBrief(projectDir, card, wt.path, wt.branch, carried));

  // 3. builder
  let log = '';
  recordEvent(projectDir, card.id, (_cards, current) => {
    const k = current.events.filter(e => e.action === 'agent-start' && e.stage === card.stage).length + 1;
    log = `${AGENT_RUNS_DIR}/${card.id}-${safeName(card.stage, 'stage id')}-${k}.log`;
    return { action: 'agent-start', agent: agent.name, log };
  });
  turn.log = log;
  const ran = await runAgent(projectDir, agent, brief, join(projectDir, log), { cwd: wt.path, env: { CODELOOP_CARD: card.id, CODELOOP_PROJECT_DIR: projectDir } });
  recordEvent(projectDir, card.id, () => ({ action: 'agent-run', agent: agent.name, exit: ran.exit, durationMs: ran.durationMs, log, ...(ran.timedOut ? { note: `timed out after ${agent.timeoutMinutes} minutes` } : {}) }));

  // 4. hand-back: the newest one for this card recorded after the turn started
  const started = Date.parse(turn.startedAt);
  const hb: HandbackRecord | undefined = listHandbacks(projectDir, card.id).find(h => Date.parse(h.at) >= started && h.stage === card.stage);
  if (!hb) {
    turn.findings.push(ran.timedOut ? `no hand-back (the agent timed out after ${agent.timeoutMinutes} minutes)` : `no hand-back (the agent exited ${ran.exit})`);
  } else {
    turn.handback = { head: hb.head, proofExit: hb.proof.exit, left: hb.left, blocked: hb.blocked, at: hb.at };
    // 5. gate
    const gate = runGate(projectDir, card.id, { handbackId: hb.head });
    turn.gate = { verdict: gate.verdict, findings: gate.findings };
    if (gate.verdict === 'fail') turn.findings.push(...gate.findings);
    else {
      // 6. merge, then the engine's own advance
      try {
        const merged = mergeStory(projectDir, card.id);
        turn.merge = { sha: merged.sha, mode: merged.mode };
        const adv = advanceCard(projectDir, card.id, { unattended: true });
        turn.advance = adv.outcome;
        if (adv.outcome === 'failed' || adv.outcome === 'stuck') {
          turn.outcome = adv.outcome === 'stuck' ? 'stuck' : 'failed';
          turn.findings.push(`stage check failed after the merge${adv.output ? `: ${adv.output.split('\n').slice(-3).join(' ').slice(0, 300)}` : ''}`);
        } else turn.outcome = 'merged';
      } catch (e) {
        if (!(e instanceof RefusalError)) throw e;
        turn.findings.push(e.message);
      }
    }
  }

  if (!turn.findings.length) turn.outcome = 'merged';
  else if (!turn.advance) turn.outcome = countFailure(projectDir, card.id, turn.findings.join('; '));
  turn.endedAt = new Date().toISOString();
  record.turns.push(turn);
  saveOrch(projectDir, record);
  appendActivity(projectDir, card.id, { kind: 'orch', stage: turn.stage, n, outcome: turn.outcome, text: turn.findings.length ? turn.findings.join('; ') : `merged ${turn.merge?.sha.slice(0, 8) ?? ''}` });
  return turn;
}

/** Turns until the story parks at a gate, is stuck or done, reaches `until`, or the agent runs out of starts for the day. */
export async function orchRun(projectDir: string, cardRef: string, opts: OrchOptions = {}): Promise<OrchRunResult> {
  const id = findCard(readCards(projectDir).cards, cardRef).id;
  const turns: OrchTurn[] = [];
  for (let i = 0; i < 50; i++) {
    const card = findCard(readCards(projectDir).cards, id);
    if (card.stage === DONE) return { card: id, turns, stopped: 'done' };
    if (card.gate === 'stuck') return { card: id, turns, stopped: 'stuck' };
    if (card.gate) return { card: id, turns, stopped: `gate ${card.gate}` };
    if (opts.until && card.stage === opts.until) return { card: id, turns, stopped: `reached ${opts.until}` };
    let turn: OrchTurn;
    try {
      turn = await orchTurn(projectDir, id, opts);
    } catch (e) {
      if (e instanceof RefusalError && /max_runs_per_day/.test(e.message)) return { card: id, turns, stopped: e.message };
      throw e;
    }
    turns.push(turn);
  }
  return { card: id, turns, stopped: 'turn cap' };
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
    rows.push({ card: card.id, title: card.title, stage: card.stage, ...(card.gate ? { gate: card.gate } : {}), turns: rec.turns.length, lastOutcome: last?.outcome, builder: last?.agent, idleMinutes: builderIdle(projectDir, card.id).idleMinutes });
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
  const proof = hb ? `\`${proofCmd}\` exited ${hb.proofExit}${gateRec ? `; the gate said ${gateRec.verdict}` : ''}` : 'no passing hand-back yet';
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

/** `GET /api/cards/:id/orch`. */
export interface OrchView {
  record: OrchRecord;
  report: OrchReport;
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

export const orchView = (projectDir: string, cardRef: string): OrchView => ({ record: readOrch(projectDir, cardRef), report: orchReport(projectDir, cardRef) });
