/**
 * How stories moved in a window, measured from the board, its events, the activity streams and
 * the orchestrator's turn files. No model is called: the numbers are for a person or a small
 * model to read. A stage's wait is the wall time a story sat in it minus the time someone worked
 * it (activity.phaseTime), clipped to the window.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { readAllActivity, phaseTime } from './activity.js';
import { DONE, DROPPED, PROPOSED, QUEUED, readCards, type Card } from './cards.js';
import { readQuestions } from './interview.js';
import { storyState } from './states.js';

/** Where the orchestrator writes a card's turns (orch.ts ORCH_DIR; not imported, it pulls the whole orchestrator). */
const ORCH_DIR = '.codeloop/state/orch';
const HOUR = 3_600_000;
const ANSI = /\u001b\[[0-9;]*m/g;
/** Actions that release a card from a gate it was parked at. */
const RELEASES = new Set(['approve', 'auto-approve', 'reject', 'advance', 'unpark', 'drop', 'close', 'returned', 'rollback']);

export interface StageMove {
  from?: string;
  to: string;
  at: string;
}

export interface StageStats {
  stage: string;
  enteredAt: string;
  leftAt?: string;
  wallHours: number;
  activeMinutes: number;
  checks: number;
  fails: number;
}

export interface GateWait {
  card: string;
  title: string;
  stage: string;
  gate: string;
  since: string;
  hours: number;
  /** Who is asked while it waits, or who released it when it ended. */
  by: string;
  waiting: boolean;
}

export interface StoryProgress {
  card: string;
  title: string;
  state: string;
  health?: string;
  stage: string;
  moves: StageMove[];
  currentStageHours: number;
  wallHours: number;
  activeMinutes: number;
  stages: StageStats[];
  questions: { opened: number; answered: number; answeredInWindow: number };
  gates: GateWait[];
  builderTurns: number;
  lastCheckLine?: string;
}

export interface FailureGroup {
  line: string;
  count: number;
  cards: string[];
}

export interface ProgressReport {
  since: string;
  until: string;
  stories: StoryProgress[];
  moved: number;
  unmoved: number;
  medianHoursPerStage: { stage: string; hours: number; stories: number }[];
  topWaitStages: { stage: string; waitHours: number }[];
  stuckLongest: { card: string; title: string; stage: string; hours: number; lastCheckLine?: string }[];
  gatesWaitingLongest: GateWait[];
  failingChecks: FailureGroup[];
}

/** "24h", "7d", "90m" as milliseconds. */
export function parseWindow(text: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*(m|h|d|w)$/i.exec(text.trim());
  if (!m) throw new Error(`"${text}" is not a window: use 90m, 24h, 7d or 2w`);
  return Number(m[1]) * { m: 60_000, h: HOUR, d: 24 * HOUR, w: 7 * 24 * HOUR }[m[2].toLowerCase() as 'm' | 'h' | 'd' | 'w'];
}

const firstLine = (output: unknown): string => {
  const line = String(output ?? '').replace(ANSI, '').split('\n').map(l => l.trim()).find(Boolean) ?? '';
  return line.length > 160 ? `${line.slice(0, 160)}...` : line;
};

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

interface Segment {
  stage: string;
  from: number;
  to?: number;
}

/** The moves a card's events record, and the stretches it spent in each stage. */
function timeline(card: Card): { moves: StageMove[]; segments: Segment[] } {
  const moves: StageMove[] = [];
  let current: string | undefined;
  const go = (to: string, at: string, from?: string) => {
    if (to === current) return;
    moves.push({ from: from ?? current, to, at });
    current = to;
  };
  for (const e of card.events) {
    if (e.action === 'create' && e.stage) go(e.stage, e.at);
    else if ((e.action === 'advance' || e.action === 'rollback') && e.note) {
      const to = /^to (\S+)/.exec(e.note)?.[1];
      if (to) go(to, e.at, e.stage);
    } else if (e.action === 'returned' && e.stage) go(e.stage, e.at, /^from (\S+)/.exec(e.note ?? '')?.[1]);
    else if ((e.action === 'promote' || e.action === 'place' || e.action === 'unpark') && e.stage && e.stage !== PROPOSED) go(e.stage, e.at);
    else if (e.action === 'close') go(DONE, e.at, e.stage);
    else if (e.action === 'drop') go(DROPPED, e.at, e.stage);
  }
  const segments: Segment[] = moves.map((m, i) => ({ stage: m.to, from: Date.parse(m.at), ...(moves[i + 1] ? { to: Date.parse(moves[i + 1].at) } : {}) }));
  return { moves, segments };
}

function gatesOf(card: Card, now: number): GateWait[] {
  const out: GateWait[] = [];
  let open: { stage: string; gate: string; at: string } | undefined;
  for (const e of card.events) {
    if (e.action === 'park' && /^gate /.test(e.note ?? '')) open = { stage: e.stage ?? card.stage, gate: (e.note ?? '').slice(5).replace(/\s*\(.*$/, '').trim(), at: e.at };
    else if (open && RELEASES.has(e.action)) {
      out.push({ card: card.id, title: card.title, stage: open.stage, gate: open.gate, since: open.at, hours: round1((Date.parse(e.at) - Date.parse(open.at)) / HOUR), by: e.actor, waiting: false });
      open = undefined;
    }
  }
  if (open && card.gate) out.push({ card: card.id, title: card.title, stage: open.stage, gate: open.gate, since: open.at, hours: round1((now - Date.parse(open.at)) / HOUR), by: card.awaiting ?? 'owner', waiting: true });
  return out;
}

function builderTurns(projectDir: string, card: Card, from: number, to: number): number {
  const file = join(projectDir, ORCH_DIR, `${card.id}.json`);
  if (!existsSync(file)) return 0;
  try {
    const turns = (JSON.parse(readFileSync(file, 'utf-8')) as { turns?: { startedAt: string }[] }).turns ?? [];
    return turns.filter(t => Date.parse(t.startedAt) >= from && Date.parse(t.startedAt) <= to).length;
  } catch {
    return 0;
  }
}

export function computeProgress(projectDir: string, opts: { windowMs?: number; now?: number } = {}): ProgressReport {
  const now = opts.now ?? Date.now();
  const from = now - (opts.windowMs ?? 7 * 24 * HOUR);
  const inWindow = (at: string) => Date.parse(at) >= from && Date.parse(at) <= now;
  const stories: StoryProgress[] = [];
  const failures = new Map<string, Set<string>>();
  const failCounts = new Map<string, number>();
  const segmentHours = new Map<string, number[]>();
  const waitByStage = new Map<string, number>();

  for (const card of readCards(projectDir).cards) {
    if (card.stage === DROPPED || card.stage === PROPOSED || card.stage === QUEUED) continue;
    const touched = card.events.some(e => inWindow(e.at));
    if (card.stage === DONE && !touched) continue;
    if (!touched && !card.gate && card.stage === DONE) continue;

    const lines = readAllActivity(projectDir, card.id);
    const { moves, segments } = timeline(card);
    const checks = lines.filter(l => l.kind === 'check' && inWindow(l.at));
    const noActivityChecks = checks.length === 0;
    const stageStats: StageStats[] = [];
    for (const s of segments) {
      const end = s.to ?? now;
      if (s.stage === DONE || end < from) continue;
      const lo = Math.max(s.from, from);
      const time = phaseTime(lines, new Date(lo).toISOString(), end);
      const here = checks.filter(c => c.stage === s.stage && Date.parse(c.at) >= s.from && Date.parse(c.at) <= end);
      const fails = noActivityChecks
        ? card.events.filter(e => e.action === 'fail' && e.stage === s.stage && Date.parse(e.at) >= lo && Date.parse(e.at) <= end).length
        : here.filter(c => c.pass === false).length;
      stageStats.push({ stage: s.stage, enteredAt: new Date(s.from).toISOString(), ...(s.to ? { leftAt: new Date(s.to).toISOString() } : {}), wallHours: round1(time.wallMinutes / 60), activeMinutes: time.activeMinutes, checks: noActivityChecks ? fails : here.length, fails });
      waitByStage.set(s.stage, (waitByStage.get(s.stage) ?? 0) + time.idleMinutes / 60);
      if (s.to && s.to >= from && s.to <= now) segmentHours.set(s.stage, [...(segmentHours.get(s.stage) ?? []), (s.to - s.from) / HOUR]);
    }

    // The same failure across cards counts once: group by the first line the check printed.
    const failed = noActivityChecks
      ? card.events.filter(e => e.action === 'fail' && inWindow(e.at)).map(e => firstLine(e.note))
      : checks.filter(c => c.pass === false).map(c => firstLine(c.output));
    for (const line of failed.filter(Boolean)) {
      failures.set(line, (failures.get(line) ?? new Set()).add(card.id));
      failCounts.set(line, (failCounts.get(line) ?? 0) + 1);
    }

    const questions = readQuestions(projectDir, card);
    const last = segments[segments.length - 1];
    const state = storyState(card as Card & { release?: string }, questions.filter(q => !q.answer).length, { now, lastActivityAt: lines.length ? Date.parse(lines[lines.length - 1].at) : undefined });
    const lastFail = [...lines].reverse().find(l => l.kind === 'check' && l.pass === false);
    const total = phaseTime(lines, new Date(Math.max(from, Date.parse(card.createdAt))).toISOString(), now);
    stories.push({
      card: card.id,
      title: card.title,
      state: state?.state ?? card.stage,
      ...(state?.health ? { health: state.health } : {}),
      stage: card.stage,
      moves: moves.filter(m => inWindow(m.at)),
      currentStageHours: last ? round1((now - last.from) / HOUR) : 0,
      wallHours: round1(total.wallMinutes / 60),
      activeMinutes: total.activeMinutes,
      stages: stageStats,
      questions: { opened: questions.length, answered: questions.filter(q => q.answer).length, answeredInWindow: card.events.filter(e => e.action === 'answer' && inWindow(e.at)).length },
      gates: gatesOf(card, now).filter(g => g.waiting || inWindow(new Date(Date.parse(g.since) + g.hours * HOUR).toISOString())),
      builderTurns: builderTurns(projectDir, card, from, now),
      ...(lastFail ? { lastCheckLine: firstLine(lastFail.output) } : {}),
    });
  }

  const gatesWaitingLongest = stories.flatMap(s => s.gates).filter(g => g.waiting).sort((a, b) => b.hours - a.hours).slice(0, 5);
  const stuck = stories.filter(s => s.state !== 'done' && s.state !== 'shipped' && (s.health === 'stuck' || s.health === 'failing' || s.health === 'stale'));
  return {
    since: new Date(from).toISOString(),
    until: new Date(now).toISOString(),
    stories,
    moved: stories.filter(s => s.moves.length).length,
    unmoved: stories.filter(s => !s.moves.length && s.stage !== DONE).length,
    medianHoursPerStage: [...segmentHours].map(([stage, h]) => ({ stage, hours: round1(median(h)), stories: h.length })).sort((a, b) => b.hours - a.hours),
    topWaitStages: [...waitByStage].map(([stage, h]) => ({ stage, waitHours: round1(h) })).filter(s => s.waitHours > 0).sort((a, b) => b.waitHours - a.waitHours).slice(0, 5),
    stuckLongest: stuck.sort((a, b) => b.currentStageHours - a.currentStageHours).slice(0, 5).map(s => ({ card: s.card, title: s.title, stage: s.stage, hours: s.currentStageHours, ...(s.lastCheckLine ? { lastCheckLine: s.lastCheckLine } : {}) })),
    gatesWaitingLongest,
    failingChecks: [...failures].map(([line, cards]) => ({ line, count: failCounts.get(line) ?? 0, cards: [...cards].sort() })).sort((a, b) => b.cards.length - a.cards.length || b.count - a.count).slice(0, 10),
  };
}

const row = (cells: (string | number)[]) => `  ${cells.join('  |  ')}`;

/** A short report in sentences and three tables. */
export function renderProgress(r: ProgressReport): string {
  const out: string[] = [];
  const days = round1((Date.parse(r.until) - Date.parse(r.since)) / (24 * HOUR));
  out.push(`In the last ${days} days ${r.moved} ${r.moved === 1 ? 'story' : 'stories'} moved a stage and ${r.unmoved} did not.`);
  const turns = r.stories.reduce((n, s) => n + s.builderTurns, 0);
  const answered = r.stories.reduce((n, s) => n + s.questions.answeredInWindow, 0);
  out.push(`Builders took ${turns} ${turns === 1 ? 'turn' : 'turns'}; ${answered} ${answered === 1 ? 'question was' : 'questions were'} answered.`);
  if (r.topWaitStages.length) out.push(`Most waiting: ${r.topWaitStages.map(s => `${s.stage} (${s.waitHours}h)`).join(', ')}.`);
  out.push('');
  out.push('Hours per stage, for stories that passed it');
  out.push(row(['stage', 'median h', 'stories']));
  for (const s of r.medianHoursPerStage) out.push(row([s.stage, s.hours, s.stories]));
  if (!r.medianHoursPerStage.length) out.push('  none passed a stage in the window');
  out.push('');
  out.push('Stuck longest, and gates waiting longest');
  out.push(row(['card', 'where', 'hours', 'last check line or who']));
  for (const s of r.stuckLongest) out.push(row([s.card, s.stage, s.hours, s.lastCheckLine ?? '-']));
  for (const g of r.gatesWaitingLongest) out.push(row([g.card, `gate ${g.gate}`, g.hours, `waiting on ${g.by}`]));
  if (!r.stuckLongest.length && !r.gatesWaitingLongest.length) out.push('  nothing stuck, no gate waiting');
  out.push('');
  out.push('Failing checks, grouped by first output line');
  out.push(row(['times', 'cards', 'first line']));
  for (const f of r.failingChecks) out.push(row([f.count, f.cards.join(' '), f.line]));
  if (!r.failingChecks.length) out.push('  no failing checks in the window');
  return out.join('\n');
}
