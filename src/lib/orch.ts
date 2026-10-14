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
import { activeSessions, currentSession, type SessionCard } from './active-card.js';
import { appendActivity } from './activity.js';
import { DONE, findCard, readCards, RefusalError, safeName, writeCards, type Card } from './cards.js';
import { clock } from './clock.js';
import { currentStage, advanceCard, recordEvent, type Outcome } from './engine.js';
import { listGates, runGate, type GateRecord } from './gate.js';
import { listHandbacks, type HandbackRecord } from './handback.js';
import { loadConfig } from './config.js';
import { loadLane } from './lane.js';
import { builderIdle, NUDGE_PREFIX } from './stall.js';
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
  gate?: { verdict: 'pass' | 'fail'; findings: string[]; proof?: { cmd: string; exit: number } };
  merge?: { sha: string; mode: 'ff' | 'merge' };
  /** The engine's result of the advance after the merge. */
  advance?: Outcome;
  /** `briefed`: a session or person was handed the brief and has not handed back yet. */
  outcome: 'merged' | 'failed' | 'stuck' | 'briefed';
  builderKind?: 'agent' | 'session' | 'person';
  findings: string[];
  /** Set when the hand-back gated was recorded before the turn started. */
  note?: string;
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
  /** `agent[:name]` (default), `session:<id-or-label-prefix>` or `person`. */
  builder?: string;
  /** Minutes to wait for a session or person's hand-back; `false` returns at once with outcome `briefed`. Default `orch.wait_minutes` (120). */
  wait?: number | false;
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
  if (!hb) {
    turn.findings.push(noHandback);
  } else {
    turn.handback = { head: hb.head, proofExit: hb.proof.exit, left: hb.left, blocked: hb.blocked, at: hb.at };
    // 5. gate
    const gate = runGate(projectDir, card.id, { handbackId: hb.head });
    turn.gate = { verdict: gate.verdict, findings: gate.findings, proof: { cmd: gate.proof.cmd, exit: gate.proof.exit } };
    if (gate.verdict === 'fail') turn.findings.push(...gate.findings, ...(turn.note ? [turn.note] : []));
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
  upsertTurn(record, turn);
  saveOrch(projectDir, record);
  // 7. report
  appendActivity(projectDir, card.id, { kind: 'orch', stage: turn.stage, n: turn.n, outcome: turn.outcome, text: turn.findings.length ? turn.findings.join('; ') : `merged ${turn.merge?.sha.slice(0, 8) ?? ''}` });
  return turn;
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

/** One turn: the story's current stage through the builder, the gate, and the merge. */
export async function orchTurn(projectDir: string, cardRef: string, opts: OrchOptions = {}): Promise<OrchTurn> {
  const first = findCard(readCards(projectDir).cards, cardRef);
  if (first.stage === DONE) throw new RefusalError(`card ${first.id} is done`);
  if (first.gate) throw new RefusalError(`card ${first.id} is waiting at gate "${first.gate}" (${first.awaiting} approves)`);
  const lane = loadLane(projectDir, first.lane);
  const spec = parseBuilder(opts.builder, opts.agent);
  const now = clock();
  let agent: AgentConfig | undefined;
  let session: SessionCard | undefined;
  if (spec.kind === 'agent') {
    agent = resolveAgent(projectDir, spec.name, lane.agent);
    const limit = agentStartsToday(projectDir, agent, now);
    if (limit >= agent.maxRunsPerDay) throw new RefusalError(`agent ${agent.name} has started ${limit} times in the last 24 hours (max_runs_per_day is ${agent.maxRunsPerDay})`);
  } else if (spec.kind === 'session') session = findSession(projectDir, spec.ref);
  const builderName = agent?.name ?? (session ? (session.label ?? session.session) : 'person');

  // 1. worktree
  const wt = ensureStoryWorktree(projectDir, first.id);
  const record = readOrch(projectDir, first.id);
  const card = findCard(readCards(projectDir).cards, first.id);
  const n = record.turns.length + 1;
  const turn: OrchTurn = { n, stage: card.stage, startedAt: new Date().toISOString(), agent: builderName, builderKind: spec.kind, worktree: wt.path, branch: wt.branch, outcome: 'failed', findings: [] };
  const lastFailed = record.turns.at(-1);
  const carried = lastFailed && lastFailed.outcome !== 'merged' && lastFailed.outcome !== 'briefed' && lastFailed.stage === card.stage ? lastFailed.findings : [];

  // A briefed turn nobody answered is closed by the next one, without costing a retry.
  for (const t of record.turns) if (t.outcome === 'briefed' && !t.endedAt) Object.assign(t, { outcome: 'failed', endedAt: turn.startedAt, findings: [`superseded by turn ${n}`] });
  // 2. brief
  const brief = join(projectDir, briefPath(card));
  mkdirSync(dirname(brief), { recursive: true });
  const briefText = orchBrief(projectDir, card, wt.path, wt.branch, carried);
  writeFileSync(brief, briefText);

  // 3. builder
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
    console.log(`  hand-back line: codeloop card handback ${card.id} --branch ${wt.branch} --head "$(git rev-parse HEAD)" --proof "<proof command>" --left "<what is left>" --blocked "<what blocked you, or empty>" --worktree "${wt.path}"`);
    if (opts.wait === false) return turn;
    const got = await awaitHandback(projectDir, card.id, turn, waitMinutes(projectDir, opts.wait));
    return settle(projectDir, record, turn, got ? 'no hand-back' : 'no hand-back within the wait');
  }

  let log = '';
  recordEvent(projectDir, card.id, (_cards, current) => {
    const k = current.events.filter(e => e.action === 'agent-start' && e.stage === card.stage).length + 1;
    log = `${AGENT_RUNS_DIR}/${card.id}-${safeName(card.stage, 'stage id')}-${k}.log`;
    return { action: 'agent-start', agent: agent!.name, log };
  });
  turn.log = log;
  const ran = await runAgent(projectDir, agent, brief, join(projectDir, log), { cwd: wt.path, env: { CODELOOP_CARD: card.id, CODELOOP_PROJECT_DIR: projectDir, CODELOOP_WORK_DIR: wt.path } });
  recordEvent(projectDir, card.id, () => ({ action: 'agent-run', agent: agent!.name, exit: ran.exit, durationMs: ran.durationMs, log, ...(ran.timedOut ? { note: `timed out after ${agent!.timeoutMinutes} minutes` } : {}) }));
  return settle(projectDir, record, turn, ran.timedOut ? `no hand-back (the agent timed out after ${agent.timeoutMinutes} minutes)` : `no hand-back (the agent exited ${ran.exit})`);
}

/** Picks up a briefed turn once its hand-back exists: gate, merge, advance. */
export function orchResume(projectDir: string, cardRef: string): OrchTurn {
  const card = findCard(readCards(projectDir).cards, cardRef);
  const record = readOrch(projectDir, card.id);
  const turn = [...record.turns].reverse().find(t => t.outcome === 'briefed' && !t.endedAt);
  if (!turn) throw new RefusalError(`card ${card.id} has no briefed turn to resume`);
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
    if (turn.outcome === 'briefed') return { card: id, turns, stopped: 'briefed' };
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
    const idle = builderIdle(projectDir, card.id);
    rows.push({ card: card.id, title: card.title, stage: card.stage, ...(card.gate ? { gate: card.gate } : {}), turns: rec.turns.length, lastOutcome: last?.outcome, builder: last?.agent, ...(last ? { builderLabel: builderLabel(last) } : {}), idleMinutes: idle.idleMinutes, stalled: idle.stalled });
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
