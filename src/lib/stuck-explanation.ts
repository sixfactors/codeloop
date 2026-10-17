/**
 * Why a stuck story is stuck and which action moves it, in plain words (c-308). One function the
 * story page, the inbox and `codeloop card show` all read, so the three never disagree. It answers
 * three things: whether any work was tried at this step, what already shipped under the story's id,
 * and which one action changes the outcome. Buttons come from a fixed list of two; anything else is
 * said in words.
 */
import { CHECK_CRASHED, findCard, readCards, RefusalError, stageEntryIndex, stuckReason, type Card, type CardEvent } from './cards.js';
import { commitFiles, storyCommits, type StoryCommit } from './diff-budget.js';
import { approveCard, placeCard, workFingerprint, type Role } from './engine.js';
import { checkSentence } from './journey.js';
import { loadLane, type Lane } from './lane.js';
import { progressSince } from './progress.js';

export interface StuckExplanation {
  kind: 'broken' | 'shipped' | 'changed' | 'unchanged';
  step: string;
  at?: string;
  /** Whether any work was tried at this step. */
  tried: string;
  /** What already shipped under the story's id. */
  shipped: string;
  /** The one action that changes the outcome; the summary's "what you must do" line. */
  action: string;
  /** `move`: to the step its shipped work shows, stopping before any gate. `retry`: one more try. */
  buttons: ('move' | 'retry')[];
  moveTo?: string;
  /** The raw check output, kept apart from the sentences. */
  error?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dayTime = (ms: number) => { const d = new Date(ms); return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const times = (n: number) => `${n} ${n === 1 ? 'time' : 'times'}`;

/** A commit path that is not shipped work: docs, the board's own files, the spec folder, evidence and mocks. */
export function isPaperwork(path: string, card: Pick<Card, 'spec'>): boolean {
  return /^(docs|\.codeloop|specs|evidence)\//.test(path) || /(^|\/)mocks\//.test(path) || Boolean(card.spec && path.startsWith(`${card.spec.replace(/\/$/, '')}/`));
}

/** Merged commits under the story that change something besides docs, specs, evidence and mocks. */
export function shippedCommits(projectDir: string, card: Card, commits: StoryCommit[] = storyCommits(projectDir, card.id)): StoryCommit[] {
  const merged = commits.filter(c => c.merged);
  if (!merged.length) return [];
  const files = commitFiles(projectDir, merged.map(c => c.sha));
  return merged.filter(c => (files.get(c.sha) ?? []).some(p => !isPaperwork(p, card)));
}

/**
 * The step a story's shipped code points to: the one after the lane's build step (the stage whose
 * check reads the task list). Never past a gate: the first gated stage from here on is as far as a
 * move goes, and when the story's own stage is gated there is no move.
 */
export function moveTarget(lane: Lane, card: Pick<Card, 'stage'>): string | undefined {
  const here = lane.stages.findIndex(s => s.id === card.stage);
  const build = lane.stages.findIndex(s => s.id === 'build' || /\btask check\b/.test(s.done?.cmd ?? ''));
  if (here < 0 || build < 0) return undefined;
  let target = Math.min(build + 1, lane.stages.length - 1);
  const gate = lane.stages.findIndex((s, i) => i >= here && s.gate);
  if (gate >= 0) target = Math.min(target, gate);
  return target > here ? lane.stages[target].id : undefined;
}

const atStage = (events: CardEvent[], stage: string, from: number) => events.slice(from + 1).filter(e => e.stage === stage);

/** The check's complaint as a sentence, with the tool's own notices taken out. */
function complaint(output: string): string {
  const text = output.split('\n').filter(l => !/^codeloop: /.test(l.trim())).join('\n');
  return checkSentence(text);
}

export function stuckExplanation(projectDir: string, card: Card, opts: { lane?: Lane; commits?: StoryCommit[] } = {}): StuckExplanation | undefined {
  if (card.gate !== 'stuck') return undefined;
  const lane = opts.lane ?? loadLane(projectDir, card.lane);
  const stage = lane.stages.find(s => s.id === card.stage);
  const step = card.stage;
  const events = card.events ?? [];
  const entry = stageEntryIndex(events, step);
  const here = atStage(events, step, entry);
  const runs = here.filter(e => e.action === 'agent-run' && !(e.exit === null && e.durationMs === 0)).length;
  const fails = here.filter(e => e.action === 'fail');
  const lastFail = fails.at(-1);
  const lastError = here.filter(e => e.action === 'check-error').at(-1);
  const stuck = here.filter(e => e.action === 'stuck').at(-1);

  const code = shippedCommits(projectDir, card, opts.commits);
  const all = (opts.commits ?? storyCommits(projectDir, card.id)).filter(c => c.merged);
  const shipped = code.length
    ? `${code.length} ${code.length === 1 ? 'commit' : 'commits'} under this story ${code.length === 1 ? 'is' : 'are'} merged, the last on ${dayTime(Math.max(...code.map(c => c.at)))}. They change code, not only docs.`
    : all.length
    ? `${all.length} merged ${all.length === 1 ? 'commit' : 'commits'} under this story change only docs, specs or mocks, so nothing has shipped yet.`
    : 'Nothing has shipped under this story yet.';

  // The check broke rather than judged the work: a crash after the last real failure, or the crash reason.
  const broken = (lastError && (!lastFail || lastError.at >= lastFail.at)) || stuckReason(card) === CHECK_CRASHED;
  if (broken) {
    const at = lastError?.at ?? stuck?.at ?? card.updatedAt;
    return {
      kind: 'broken', step, at, shipped, buttons: ['retry'],
      tried: `The check itself broke at ${hhmm(at)} on the ${step} step, before it looked at the work. Your work is not the problem.`,
      action: 'Fix the check, then try again.',
      ...(lastError?.note || stuck?.note ? { error: (lastError?.note ?? stuck!.note!.split('\n').slice(1).join('\n')).trim() } : {}),
    };
  }

  // Changed since the last try: work landed after the last failure, or the stage file differs from the one it judged.
  const judged = lastFail?.fingerprint;
  const changed = progressSince(projectDir, card) !== undefined || Boolean(stage?.output && judged && workFingerprint(projectDir, card, stage) !== judged);
  const tried = runs === 0
    ? `No agent has worked the ${step} step. The check ran ${times(fails.length)}${changed ? ', and the work has changed since the last run' : ' on the same work'}.`
    : `An agent tried ${times(runs)}${changed ? '; the work has changed since the last try.' : ' and nothing has changed since its last try.'}`;
  const at = stuck?.at ?? lastFail?.at;
  const error = lastFail?.note?.trim() || undefined;
  const base = { step, ...(at ? { at } : {}), tried, shipped, ...(error ? { error } : {}) };

  const moveTo = code.length ? moveTarget(lane, card) : undefined;
  if (moveTo) {
    const gated = Boolean(lane.stages.find(s => s.id === moveTo)?.gate);
    return { ...base, kind: 'shipped', moveTo, buttons: changed ? ['move', 'retry'] : ['move'], action: `Move it to ${moveTo}, where its shipped work points.${gated ? ` It will stop there for your approval.` : ''}` };
  }
  if (changed) return { ...base, kind: 'changed', buttons: ['retry'], action: 'Let an agent try once more. The work changed since the last try, so the check may pass this time.' };
  const said = lastFail ? complaint(lastFail.note ?? '') : `It is stuck: ${stuckReason(card)}.`;
  return { ...base, kind: 'unchanged', buttons: [], action: `Trying again would fail the same way. ${said} Change that, or send the story back with what to change.` };
}

/** The explanation as one paragraph, the way the inbox and the command line print it. */
export const explanationText = (e: StuckExplanation) => `${e.action} ${e.tried} ${e.shipped}`;

/**
 * The move button: clears the stuck gate and places the story at the step its shipped work shows.
 * Refused unless the explanation offers it, so it can never carry a story past a gate.
 */
export function moveStuck(projectDir: string, ref: string, role: Role): { card: Card; explanation: StuckExplanation } {
  if (role !== 'owner') throw new RefusalError('moving a stuck story is the owner\'s decision');
  const card = findCard(readCards(projectDir).cards, ref);
  const explanation = stuckExplanation(projectDir, card);
  if (!explanation?.moveTo || !explanation.buttons.includes('move')) throw new RefusalError(`${card.id} has no step to move to: ${explanation?.action ?? 'it is not stuck'}`);
  approveCard(projectDir, card.id, role, { note: `to move it to ${explanation.moveTo}` });
  const placed = placeCard(projectDir, card.id, explanation.moveTo, role, { note: `moved from stuck at ${card.stage} to ${explanation.moveTo}: ${explanation.shipped}` });
  return { card: placed, explanation };
}
