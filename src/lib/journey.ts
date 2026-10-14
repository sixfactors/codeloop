/**
 * A story as a journey: its lane's phases in order, each done, current, waiting at a gate, skipped
 * or ahead, plus who holds the story now and what its last check said in plain words. Built here
 * from the card's events, its lane, the live sessions and its activity, so a screen draws it and
 * derives nothing.
 */
import { closeSync, existsSync, openSync, readSync, statSync } from 'fs';
import { join } from 'path';
import { ACTIVITY_DIR, readActivity, type ActivityLine } from './activity.js';
import { activeSessions } from './active-card.js';
import { DONE, DROPPED, PROPOSED, QUEUED, type Card, type CardEvent } from './cards.js';
import { readQuestions } from './interview.js';
import { loadLane, substitute, type Lane } from './lane.js';
import { findRunningRun } from './runs.js';

export type StepState = 'done' | 'current' | 'gate' | 'skipped' | 'ahead';

export interface JourneyStep {
  id: string;
  /** Set on a phase that waits for a person once its check passes. */
  gate?: { name: string; approver: string };
  state: StepState;
  enteredAt?: string;
  leftAt?: string;
  durationMs?: number;
  /** Who finished it (done) or who it waits on (gate). */
  who?: string;
  /** Why a skipped phase was skipped, in a sentence. */
  reason?: string;
}

export interface CheckSummary {
  pass: boolean;
  at: string;
  /** The check's output as a person reads it. */
  sentence: string;
  output: string;
  /** True when the stage's output or the card's activity changed after this check ran. */
  stale?: boolean;
}

export type HolderKind = 'agent' | 'you' | 'nobody';

export interface StoryHolder {
  kind: HolderKind;
  /** The session label ("claude on dean-mbp, since 19:01") when an agent holds it. */
  agent?: string;
  session?: string;
  /** A headless run working it, when one is. */
  runId?: string;
  since?: string;
  /** For `you`: the gate's name, or how many questions are open. */
  gate?: string;
  awaiting?: string;
  openQuestions: number;
  /** The last thing that happened on it, from the activity stream. */
  last?: Pick<ActivityLine, 'at' | 'kind'> & { text: string };
}

export interface Journey {
  steps: JourneyStep[];
  holder: StoryHolder;
  check?: CheckSummary;
  tasks?: { done: number; total: number };
}

const to = (e: CardEvent) => /^to (\S+)/.exec(e.note ?? '')?.[1];

/** The time the card came into `stage`: an advance into it, a placement or promotion to it, or its creation. */
export function enteredAt(events: CardEvent[], stage: string, firstStage: string): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.action === 'advance' && to(e) === stage) return e.at;
    if ((e.action === 'place' || e.action === 'promote' || e.action === 'unpark' || e.action === 'returned') && e.stage === stage) return e.at;
  }
  return stage === firstStage ? events[0]?.at : undefined;
}

/** "no tasks" and its relatives, as the sentence a person needs. */
export function checkSentence(output: string, skipped: string[] = []): string {
  const text = output.trim();
  const last = text.split('\n').map(l => l.trim()).filter(Boolean).pop() ?? '';
  if (/\bno tasks\b/i.test(text)) {
    const why = skipped.length ? `This story skipped ${listOf(skipped)}, so it has no task list yet` : 'No task list yet';
    return `${why}; the spec phase writes tasks.md.`;
  }
  if (/no `?## Files`?/i.test(text)) return 'The plan has no files list yet; the spec phase writes it into plan.md.';
  const missing = /(?:missing|not found|no such file)[^\n]*?([\w./-]+\.(?:md|json|ya?ml|html))/i.exec(text);
  if (missing) return `${missing[1]} is not written yet; this phase writes it.`;
  if (!text) return 'The check failed without saying why.';
  return `The check failed: ${last.length > 160 ? `${last.slice(0, 160)}…` : last}`;
}

const listOf = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/**
 * The one line a board card shows under its title: what the agent did last, what the failing check
 * said, or since when it has waited on a person. `at` lets the screen say "40s ago".
 */
export function storyLiveLine(projectDir: string, card: Card, health: string | undefined): { text: string; at?: string } | undefined {
  const events = card.events ?? [];
  if (card.gate) {
    const parked = [...events].reverse().find(e => e.action === 'park' || e.action === 'stuck');
    return { text: card.gate === 'stuck' ? 'stuck: the check failed three times' : `waiting for you at ${card.gate}`, ...(parked ? { at: parked.at } : {}) };
  }
  if (health === 'failing') {
    const fail = [...events].reverse().find(e => e.action === 'fail' && e.stage === card.stage);
    if (fail) return { text: `check failing: ${checkSentence(fail.note ?? '').replace(/^The check failed: /, '').replace(/\.$/, '')}`, at: fail.at };
  }
  const last = lastActivity(projectDir, card.id);
  return last ? { text: activityText(last), at: last.at } : undefined;
}

/** The last line of a card's activity, read from the file's tail. */
export function lastActivity(projectDir: string, card: string): ActivityLine | undefined {
  const file = join(projectDir, ACTIVITY_DIR, `${card.replace(/[^A-Za-z0-9._-]/g, '_')}.jsonl`);
  if (!existsSync(file)) return undefined;
  const size = statSync(file).size;
  const length = Math.min(size, 16_384);
  const fd = openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, size - length);
    const lines = buffer.toString('utf-8').split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try { return JSON.parse(lines[i]) as ActivityLine; } catch { /* a torn first line */ }
    }
  } finally {
    closeSync(fd);
  }
  return undefined;
}

/** One activity line as a short sentence: "edited src/settings.py", "ran pnpm test". */
export function activityText(l: ActivityLine): string {
  switch (l.kind) {
    case 'edit': return `edited ${l.file}`;
    case 'cmd': return `ran ${l.text}`;
    case 'prompt': return l.text ? `was asked: ${l.text}` : 'was asked something';
    case 'check': return l.pass ? `check passed (${l.stage})` : `check failing: ${checkSentence(String(l.output ?? ''))}`;
    case 'commit': return `committed ${l.sha} ${l.subject}`;
    case 'log': return String(l.text ?? '');
    case 'start': return 'session started';
    case 'stop': return 'finished a turn';
    case 'end': return 'session ended';
    case 'park': return `waiting at a gate${l.text ? `: ${l.text}` : ''}`;
    case 'approve': return `${l.actor ?? 'someone'} approved${l.stage ? ` ${l.stage}` : ''}`;
    case 'reject': return `${l.actor ?? 'someone'} rejected${l.stage ? ` ${l.stage}` : ''}`;
    case 'advance': return `moved on${l.text ? ` ${l.text}` : ''}`;
    case 'answer': return `answered ${l.text ?? 'a question'}`;
    default: return `${l.kind}${l.text ? `: ${l.text}` : ''}`;
  }
}

/** Whether the stage's output file or the card's own activity moved after the check at `at`. */
function changedSince(projectDir: string, card: Card, lane: Lane, at: string): boolean {
  const checked = Date.parse(at);
  if (Number.isNaN(checked)) return false;
  const stage = lane.stages.find(s => s.id === card.stage);
  if (stage?.output) {
    try {
      if (statSync(join(projectDir, substitute(stage.output, card))).mtimeMs > checked) return true;
    } catch { /* no output file yet */ }
  }
  return readActivity(projectDir, card.id, { limit: 1000 }).items.some(i => i.kind !== 'check' && Date.parse(i.at) > checked);
}

export function journeyOf(projectDir: string, card: Card, opts: { lane?: Lane; tasks?: { done: boolean }[]; health?: string } = {}): Journey {
  const lane = opts.lane ?? loadLane(projectDir, card.lane);
  const events = card.events ?? [];
  const stages = lane.stages;
  const finished = card.stage === DONE;
  const outside = card.stage === QUEUED || card.stage === PROPOSED || card.stage === DROPPED;
  const at = finished ? stages.length : stages.findIndex(s => s.id === card.stage);
  const placed = [...events].reverse().find(e => e.action === 'place');
  const placedAt = placed ? stages.findIndex(s => s.id === placed.stage) : -1;

  const steps: JourneyStep[] = stages.map((s, i) => {
    const step: JourneyStep = { id: s.id, ...(s.gate ? { gate: { name: s.gate.name, approver: s.gate.approver } } : {}), state: 'ahead' };
    if (outside || i > at) return step;
    const entered = enteredAt(events, s.id, stages[0].id);
    if (i === at) {
      step.state = card.gate ? 'gate' : 'current';
      if (entered) step.enteredAt = entered;
      if (card.gate) {
        step.who = card.awaiting;
        const parkedAt = [...events].reverse().find(e => e.action === 'park')?.at;
        if (parkedAt) step.leftAt = parkedAt;
      }
      return step;
    }
    const left = [...events].reverse().find(e => e.action === 'advance' && e.stage === s.id);
    if (!left) {
      step.state = 'skipped';
      step.reason = placed && placedAt > i ? `placed at ${placed.stage} by ${placed.actor}${/: (.+)$/.exec(placed.note ?? '')?.[1] ? `: ${/: (.+)$/.exec(placed.note ?? '')![1]}` : ''}` : 'no record of this phase';
      return step;
    }
    step.state = 'done';
    step.leftAt = left.at;
    if (entered) {
      step.enteredAt = entered;
      step.durationMs = Math.max(0, Date.parse(left.at) - Date.parse(entered));
    }
    const approval = [...events].reverse().find(e => e.action === 'approve' && e.stage === s.id);
    const worker = [...events].reverse().find(e => e.stage === s.id && e.actor !== 'engine');
    step.who = approval ? `approved by ${approval.actor}` : worker?.actor;
    return step;
  });

  // The last check: the activity stream's when there is one, else the engine's last fail event.
  const skipped = steps.filter(s => s.state === 'skipped').map(s => s.id);
  const last = lastActivity(projectDir, card.id);
  let check: CheckSummary | undefined;
  const lastFail = [...events].reverse().find(e => e.action === 'fail' && e.stage === card.stage);
  const lastAdvance = [...events].reverse().find(e => e.action === 'advance' || e.action === 'park');
  if (lastFail && (!lastAdvance || lastFail.at >= lastAdvance.at)) check = { pass: false, at: lastFail.at, output: lastFail.note ?? '', sentence: checkSentence(lastFail.note ?? '', skipped) };
  else if (card.gate && lastAdvance?.action === 'park') {
    const sha = [...events].reverse().map(e => (e.stage === card.stage ? /result: pass at (\S+)/.exec(e.note ?? '')?.[1] : undefined)).find(Boolean);
    check = { pass: true, at: lastAdvance.at, output: '', sentence: `The ${card.stage} check passed${sha ? ` at ${sha}` : ''}.` };
  }

  if (check && !check.pass) {
    const changed = changedSince(projectDir, card, lane, check.at);
    if (changed) {
      const t = opts.tasks;
      const now = t?.length ? `${t.filter(x => x.done).length} of ${t.length} tasks done` : 'the work has changed';
      const hm = new Date(check.at);
      const clock = `${String(hm.getHours()).padStart(2, '0')}:${String(hm.getMinutes()).padStart(2, '0')}`;
      const was = (check.output.trim().split('\n').map(l => l.trim()).filter(Boolean).pop() ?? 'it failed without saying why').replace(/\.$/, '');
      check = { ...check, stale: true, sentence: `The check failed at ${clock}: ${was}. Changed since: ${now}; run Check now.` };
    }
  }

  const session = activeSessions(projectDir).find(s => s.card === card.id);
  const run = findRunningRun(projectDir);
  const ownRun = run?.cardId === card.id ? run : undefined;
  const openQuestions = readQuestions(projectDir, card).filter(q => !q.answer).length;
  // The card's health decides when it has one: needs-you and stuck are the person's; otherwise an
  // agent holds it when a session or a run is on it, and nobody does when neither is.
  // A session or run on the card holds it, even parked stuck: the agent is the one who can act on it.
  const yours = opts.health ? opts.health === 'needs-you' || opts.health === 'stuck' : Boolean(card.gate || openQuestions);
  const kind: HolderKind = session || ownRun ? 'agent' : yours ? 'you' : 'nobody';
  const holder: StoryHolder = {
    kind,
    openQuestions,
    ...(session ? { agent: session.label ?? session.session, session: session.session, since: session.startedAt } : {}),
    ...(ownRun ? { runId: ownRun.runId, since: session?.startedAt ?? ownRun.startedAt, agent: session?.label ?? `headless run ${ownRun.runId}` } : {}),
    ...(card.gate ? { gate: card.gate, awaiting: card.awaiting } : {}),
    ...(last ? { last: { at: last.at, kind: last.kind, text: activityText(last) } } : {}),
  };
  const tasks = opts.tasks ? { done: opts.tasks.filter(t => t.done).length, total: opts.tasks.length } : undefined;
  return { steps, holder, ...(check ? { check } : {}), ...(tasks ? { tasks } : {}) };
}
