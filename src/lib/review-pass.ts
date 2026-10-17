/**
 * The orchestrator's review pass (c-307): read each open story and the commits carrying its id,
 * plan one fix from a fixed list of verbs, and apply only the ones that skip no person's decision.
 *
 * - place: move forward toward the stage the merged work shows, stopping at the first gated stage.
 *   Every stage passed over that has an output file gets that file written from the merged work.
 * - close: done, only when every gate left on the lane already has an approval, the current stage's
 *   check passed since the story got there, and every later stage passed.
 * - write-stage: the story cannot move (its own stage is gated) and that stage's output was never
 *   written, so it is written from the merged work and the stage's own check decides.
 * - ask: a gate, a split or a drop becomes one inbox question with the recommended answer.
 *
 * A written stage is a draft: it never satisfies the stage's check by itself. Each part the merged
 * work could not honestly fill is a gap, and the gaps become one question. The pass never writes a
 * `skip` event.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { activeSessions, currentSession } from './active-card.js';
import { Budget } from './budget.js';
import { DONE, inLane, readCards, type Card } from './cards.js';
import { clock } from './clock.js';
import { commitFiles, storyCommits, storyCommitTimes, trunkState, type StoryCommit } from './diff-budget.js';
import { closeCard, placeCard, RefusalError, recordEvent, reviewCloseRefusal, reviewMoveRefusal } from './engine.js';
import { addQuestions, readQuestions } from './interview.js';
import { loadLane, stageApplies, substitute, type Lane, type Stage } from './lane.js';
import { withLock } from './lock.js';
import { codeStageIndex, mergedWorkTarget, notWork } from './merged-work.js';
import { readOff } from './off.js';
import { specPath } from './project-root.js';
import { untouchedOutput } from './stage-scaffold.js';
import { SPLIT_BEFORE_STAGE, storySizeProblem } from './story-size.js';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REVIEW_STATE = '.codeloop/state/review-pass.json';
/** Every question the pass asks starts with this, so a later pass can tell it already asked. */
export const REVIEW_PREFIX = 'Review:';

export type Verb = 'place' | 'close' | 'write-stage' | 'ask';

export interface Plan {
  id: string;
  verb: Verb | 'unclear';
  note: string;
  /** Short shas, or the reason when there are none. */
  evidence: string;
  commits: string[];
  /** place: the stage to move to. */
  to?: string;
  /** place and write-stage: the stages whose output is written. */
  write?: string[];
  /** ask: the question and the answer the pass would take. `key` is what makes it the same question twice. */
  ask?: { key: string; question: string; recommended: string };
}

export interface ReviewLine {
  id: string;
  verb: Verb | 'unclear';
  note: string;
  evidence: string;
}

export interface ReviewReport {
  fixed: ReviewLine[];
  asked: ReviewLine[];
  unclear: ReviewLine[];
  /** Stories read this pass. */
  read: number;
  /** The budget reason when the pass stopped before reading every story it meant to. */
  stopped?: string;
  /** Why what the pass read as merged may be wrong: a missing trunk, or one behind HEAD. */
  warning?: string;
}

interface ReviewState {
  /** Absent until a pass completes. */
  at?: string;
  all: boolean;
  stopped?: string;
  report: ReviewReport;
}

const short = (sha: string) => sha.slice(0, 8);
const shas = (commits: string[]) => commits.map(short).join(', ');

export interface MergedWork {
  /** Trunk commits carrying the story's id that change a file outside `notWork`. */
  merged: StoryCommit[];
  /** The same, still only on a branch. */
  unmerged: StoryCommit[];
  /** The work files the merged commits changed. */
  files: string[];
}

export function mergedWork(projectDir: string, card: Card): MergedWork {
  const commits = storyCommits(projectDir, card.id);
  if (!commits.length) return { merged: [], unmerged: [], files: [] };
  const skip = notWork(projectDir, card);
  const touched = commitFiles(projectDir, commits.map(c => c.sha));
  const work = commits.filter(c => (touched.get(c.sha) ?? []).some(p => !skip(p)));
  const merged = work.filter(c => c.merged);
  const files = [...new Set(merged.flatMap(c => (touched.get(c.sha) ?? []).filter(p => !skip(p))))].sort();
  return { merged, unmerged: work.filter(c => !c.merged), files };
}

const asked = (projectDir: string, card: Card, key: string) => readQuestions(projectDir, card).some(q => q.question.startsWith(`${REVIEW_PREFIX} ${key}.`));
const question = (key: string, detail: string) => `${REVIEW_PREFIX} ${key}. ${detail}`;

/** The one fix the pass would make on this story, or undefined when nothing is wrong that it can see. */
export function planFix(projectDir: string, card: Card, cards: Card[] = readCards(projectDir).cards): Plan | undefined {
  if (!inLane(card)) return undefined;
  const lane = loadLane(projectDir, card.lane);
  const cur = lane.stages.findIndex(s => s.id === card.stage);
  if (cur < 0) return undefined;
  const base = { id: card.id, commits: [] as string[] };

  // A story with the title of one already done is most likely the same work twice.
  const twin = cards.find(c => c.id !== card.id && c.stage === DONE && c.title.trim().toLowerCase() === card.title.trim().toLowerCase());
  if (twin) {
    const key = 'drop';
    return { ...base, verb: 'ask', note: `same title as ${twin.id}, which is done`, evidence: twin.id, ask: { key, question: question(key, `${card.id} has the same title as ${twin.id}, which is done. Drop ${card.id} as a duplicate?`), recommended: `yes: \`codeloop card drop ${card.id} "duplicate of ${twin.id}"\`` } };
  }

  const split = lane.stages.findIndex(s => s.id === SPLIT_BEFORE_STAGE);
  if (split >= 0 && cur < split) {
    const problem = storySizeProblem(projectDir, card);
    if (problem) {
      const key = 'split';
      return { ...base, verb: 'ask', note: problem, evidence: 'tasks.md', ask: { key, question: question(key, `${problem}.`), recommended: `yes: \`codeloop card split ${card.id} ...\`` } };
    }
  }

  const work = mergedWork(projectDir, card);
  const commits = work.merged.map(c => c.sha);
  const evidence = shas(commits);
  const code = codeStageIndex(lane);
  if (!commits.length) {
    if (work.unmerged.length && (card.gate === 'stuck' || (card.retries[card.stage] ?? 0) > 0)) {
      const branches = [...new Set(work.unmerged.flatMap(c => c.branches))];
      return { ...base, verb: 'unclear', note: `its work is on ${branches.length ? branches.join(', ') : 'a branch'} and not merged, so where it is cannot be told`, evidence: shas(work.unmerged.map(c => c.sha)) };
    }
    return undefined;
  }

  // Merged, every gate left approved and every stage left passed: done.
  if (code >= 0 && cur >= code && !work.unmerged.length && !reviewCloseRefusal(lane, card)) {
    return { ...base, commits, verb: 'close', note: `merged, ${card.stage} passed and every gate from ${card.stage} on is approved`, evidence };
  }
  if (code < 0 || cur >= code) return undefined;

  // As far toward the code stage as no gate stands in the way.
  const target = mergedWorkTarget(lane, card) ?? cur;
  const codeId = lane.stages[code].id;
  // Only a missing file or the untouched template is written; a file someone started is never replaced.
  const unwritten = (from: number, to: number) => lane.stages.slice(from, to).filter(s => stageApplies(s, card) && untouchedOutput(projectDir, card, s)).map(s => s.id);
  if (target > cur) {
    const to = lane.stages[target].id;
    const gate = target < code ? `; the ${lane.stages[target].gate?.name ?? to} gate at ${to} comes before ${codeId}` : '';
    return { ...base, commits, verb: 'place', to, write: unwritten(cur, target), note: `merged work shows ${codeId}; placed at ${to}${gate}`, evidence };
  }
  const here = lane.stages[cur];
  if (card.gate && card.gate !== 'stuck') {
    const key = `gate ${card.gate} at ${card.stage}`;
    return { ...base, commits, verb: 'ask', note: `waits at the ${card.gate} gate while its merged work is already at ${codeId}`, evidence, ask: { key, question: question(key, `${card.id} waits at the ${card.gate} gate at ${card.stage}, and its merged work (${evidence}) is already at ${codeId}. Approve the gate?`), recommended: `yes: \`codeloop approve ${card.id}\`, then the review pass places it at ${codeId}` } };
  }
  const write = unwritten(cur, cur + 1);
  if (write.length) return { ...base, commits, verb: 'write-stage', write, note: `${here.id} was never written and its merged work is already at ${codeId}`, evidence };
  if (card.gate === 'stuck') return { ...base, commits, verb: 'unclear', note: `stuck at ${here.id} with its output written; its merged work is at ${codeId}, past the ${here.gate?.name ?? here.id} gate`, evidence };
  return undefined;
}

// --- writing a stage from the merged work ------------------------------------------------------

const layerOf = (files: string[]) =>
  files.some(f => /(^|\/)__tests__\/|\.test\.[jt]sx?$/.test(f)) && files.every(f => /(^|\/)__tests__\/|\.test\.[jt]sx?$/.test(f)) ? 'test' : files.some(f => /\.tsx$|^workspace\//.test(f)) ? 'ui' : 'api';

function template(projectDir: string, card: Card, path: string): string {
  const file = join(PACKAGE_ROOT, 'templates/spec', basename(path));
  const text = existsSync(file) ? readFileSync(file, 'utf-8') : `# {{id}} ${basename(path, '.md')}: {{title}}\n`;
  return text.replaceAll('{{id}}', card.id).replaceAll('{{title}}', card.title);
}

/** The `## ` headings whose body holds nothing but comments, an empty table or bare `key:` lines. */
export function emptySections(text: string): string[] {
  const out: string[] = [];
  const parts = text.replace(/<!--[\s\S]*?-->/g, '').split(/^## /m).slice(1);
  for (const part of parts) {
    const [heading, ...body] = part.split('\n');
    if (/^rubric$/i.test(heading.trim())) continue;
    const lines = body.map(l => l.trim()).filter(Boolean);
    const rows = lines.filter(l => l.startsWith('|'));
    const rest = lines.filter(l => !l.startsWith('|') && !/^[\w ,-]+:$/.test(l));
    if (!rest.length && rows.length <= 2) out.push(heading.trim());
  }
  return out;
}

/**
 * The stage's output, drafted from the merged work: the commits and files on top, then per-stage
 * content. Nothing in it satisfies the stage's own check by itself: changed files are listed as
 * sources to confirm, not as sources, no verdict is written, and tasks from the merged commits are
 * left unticked. `gaps` names what a person or agent still has to complete, so the check fails
 * until someone does it honestly.
 */
export function stageText(projectDir: string, card: Card, stage: Stage, work: MergedWork): { path: string; text: string; gaps: string[] } {
  const path = substitute(stage.output!, card, { projectDir });
  const lines = template(projectDir, card, path).split('\n');
  const commitLines = work.merged.map(c => `- \`${short(c.sha)}\` ${c.subject}`);
  const top = ['', `<!-- review pass: drafted from the merged work and the code, not by the ${stage.skill ?? stage.id} skill; its gaps are open questions in the inbox -->`, 'Merged work on the trunk:', '', ...commitLines, '', `Files it changed: ${work.files.slice(0, 12).map(f => `\`${f}\``).join(', ')}${work.files.length > 12 ? `, and ${work.files.length - 12} more` : ''}`];
  let text = [lines[0], ...top, ...lines.slice(1)].join('\n');
  const gaps: string[] = [];
  const name = basename(path);
  if (name === 'research.md') {
    // Not `- source:` lines: a changed file is where to look, not evidence for the pain or the verdict.
    const candidates = work.files.filter(f => existsSync(join(projectDir, f))).slice(0, 5).map(f => `- gap: source to confirm: ${f} - changed by the merged work; say what it shows, then write it as a source line`);
    if (candidates.length) text = text.replace(/^## Sources\n/m, `## Sources\n\n${candidates.join('\n')}\n`);
    if (candidates.length) gaps.push(`${stage.id}: Sources (the changed files are listed to confirm; none is cited yet)`);
    if (!/^verdict:\s*\S/m.test(text)) gaps.push(`${stage.id}: verdict (build, buy or drop)`);
  } else if (name === 'tasks.md') {
    const files = commitFiles(projectDir, work.merged.map(c => c.sha));
    const skip = notWork(projectDir, card);
    const tasks = [...work.merged].reverse().map((c, i) => `- [ ] T${String(i + 1).padStart(3, '0')} [${layerOf((files.get(c.sha) ?? []).filter(p => !skip(p)))}] ${c.subject} (\`${short(c.sha)}\`)`);
    text = /^## Rubric/m.test(text) ? text.replace(/^## Rubric/m, `${tasks.join('\n')}\n\n## Rubric`) : `${text.trimEnd()}\n\n${tasks.join('\n')}\n`;
    if (tasks.length) gaps.push(`${stage.id}: tasks from the merged commits are unticked until each is checked against its commit`);
  }
  return { path, text, gaps };
}

// --- applying ----------------------------------------------------------------------------------

/** Writes each stage, records one event per file, then asks one question naming every gap. */
function writeStages(projectDir: string, card: Card, lane: Lane, ids: string[], plan: Plan, now: Date): { wrote: string[]; gaps: string[]; refused?: string } {
  const work = mergedWork(projectDir, card);
  const wrote: string[] = [];
  const gaps: string[] = [];
  for (const id of ids) {
    const stage = lane.stages.find(s => s.id === id)!;
    if (!stage.output) continue;
    // interview.md is the stage's questions; the gap question below is what it needs from the owner.
    if (basename(stage.output) === 'interview.md') {
      gaps.push(`${id}: the questions it would ask`);
      continue;
    }
    const { path, text, gaps: drafted } = stageText(projectDir, card, stage, work);
    const file = specPath(projectDir, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
    wrote.push(path);
    recordEvent(projectDir, card.id, () => ({ action: 'review-write', actor: 'orchestrator', stage: id, note: `review pass: wrote ${path} from the merged work (commits ${shas(plan.commits)})` }), now);
    gaps.push(...drafted);
    for (const section of emptySections(text)) gaps.push(`${id}: ${section}`);
  }
  let refused: string | undefined;
  const key = `gaps in ${ids.join(', ')}`;
  if (gaps.length && !asked(projectDir, card, key)) {
    // The files are written either way; a full interview only means the gaps are reported, not asked.
    try {
      addQuestions(projectDir, card.id, [{ question: question(key, `The review pass wrote ${wrote.length ? wrote.join(', ') : 'these stages'} from the merged work (${shas(plan.commits)}) and could not fill ${gaps.join('; ')}. What should they say?`), recommended: `Read the merged work (${shas(plan.commits)}) and complete each one; the stage's check fails until then`, kind: 'gap' }], 'agent');
    } catch (e) {
      if (!(e instanceof RefusalError)) throw e;
      refused = e.message;
    }
  }
  return { wrote, gaps, ...(refused ? { refused } : {}) };
}

/** Applies one plan. Returns the report line and where it belongs, or undefined when it was already asked. */
export function applyFix(projectDir: string, plan: Plan, now: Date = clock()): { section: 'fixed' | 'asked' | 'unclear'; line: ReviewLine } | undefined {
  const line = (note: string, verb: Plan['verb'] = plan.verb): ReviewLine => ({ id: plan.id, verb, note, evidence: plan.evidence });
  if (plan.verb === 'unclear') return { section: 'unclear', line: line(plan.note) };
  // A builder mid-turn (a live session or an orchestrator lease) owns the story's stage until it hands back.
  const holder = activeSessions(projectDir).find(s => s.card === plan.id && s.session !== currentSession());
  if (holder) return { section: 'unclear', line: line(`held by ${holder.label ?? holder.session}, working it now, so left alone (would ${plan.verb}: ${plan.note})`, 'unclear') };
  const card = readCards(projectDir).cards.find(c => c.id === plan.id)!;
  try {
    if (plan.verb === 'ask') {
      if (asked(projectDir, card, plan.ask!.key)) return undefined;
      addQuestions(projectDir, card.id, [{ question: plan.ask!.question, recommended: plan.ask!.recommended, kind: 'review' }], 'agent');
      return { section: 'asked', line: line(plan.note) };
    }
    if (plan.verb === 'close') {
      closeCard(projectDir, card.id, 'agent', 'done', plan.note, { review: { commits: plan.commits }, now });
      return { section: 'fixed', line: line(plan.note) };
    }
    const lane = loadLane(projectDir, card.lane);
    if (plan.verb === 'place') {
      // Checked before anything is written, so a refused move leaves no stray stage file.
      const why = reviewMoveRefusal(lane, card, lane.stages.findIndex(s => s.id === plan.to));
      if (why) return { section: 'unclear', line: line(`could not place: ${why}`, 'unclear') };
    }
    const { wrote, gaps, refused } = writeStages(projectDir, card, lane, plan.write ?? [], plan, now);
    if (plan.verb === 'place') placeCard(projectDir, card.id, plan.to!, 'agent', { review: { commits: plan.commits }, note: plan.note, now });
    const extra = [wrote.length ? `wrote ${wrote.join(', ')}` : '', gaps.length ? (refused ? `could not ask about ${gaps.length} gap${gaps.length === 1 ? '' : 's'}: ${refused}` : `asked about ${gaps.length} gap${gaps.length === 1 ? '' : 's'}`) : ''].filter(Boolean).join('; ');
    return { section: 'fixed', line: line(extra ? `${plan.note}; ${extra}` : plan.note) };
  } catch (e) {
    if (!(e instanceof RefusalError)) throw e;
    return { section: 'unclear', line: line(`could not ${plan.verb}: ${e.message}`, 'unclear') };
  }
}

// --- the pass ----------------------------------------------------------------------------------

export function readReviewState(projectDir: string): ReviewState | undefined {
  const file = join(projectDir, REVIEW_STATE);
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as ReviewState;
  } catch {
    return undefined;
  }
}

/** Changed since `at`: the card was written, or a commit carrying its id landed. */
function changedSince(projectDir: string, card: Card, at: number | undefined): boolean {
  if (at === undefined) return true;
  return Date.parse(card.updatedAt) > at || storyCommitTimes(projectDir, card.id).some(t => t > at);
}

/**
 * One review pass. By default it reads only stories changed since the last complete pass; `all`
 * reads every open story. Each applied fix or question counts as a turn against the run budget,
 * and the pass stops when the budget does; a stopped pass leaves the cursor where it was.
 */
export function reviewPass(projectDir: string, opts: { now?: Date; all?: boolean; budget?: Budget; dryRun?: boolean; skip?: Set<string> } = {}): ReviewReport {
  const report: ReviewReport = { fixed: [], asked: [], unclear: [], read: 0 };
  if (readOff(projectDir)) return report;
  const trunk = trunkState(projectDir);
  if (trunk?.missing) report.warning = `trunk ${trunk.trunk} (git.trunk) has no branch, so nothing reads as merged`;
  else if (trunk?.behind) report.warning = `trunk ${trunk.trunk} is ${trunk.behind} ${trunk.behind === 1 ? 'commit' : 'commits'} behind HEAD; merged work may read as unmerged`;
  const now = opts.now ?? clock();
  const budget = opts.budget ?? Budget.for(projectDir);
  const state = readReviewState(projectDir);
  const since = opts.all || !state?.at ? undefined : Date.parse(state.at);
  const cards = readCards(projectDir).cards;
  for (const card of cards) {
    if (!inLane(card) || opts.skip?.has(card.id) || !changedSince(projectDir, card, since)) continue;
    const spent = budget.stop();
    if (spent) {
      report.stopped = spent;
      break;
    }
    report.read++;
    const plan = planFix(projectDir, card, cards);
    if (!plan) continue;
    if (opts.dryRun) {
      const section = plan.verb === 'unclear' ? 'unclear' : plan.verb === 'ask' ? 'asked' : 'fixed';
      report[section].push({ id: plan.id, verb: plan.verb, note: `would ${plan.verb}: ${plan.note}`, evidence: plan.evidence });
      continue;
    }
    const done = applyFix(projectDir, plan, now);
    if (!done) continue;
    report[done.section].push(done.line);
    if (done.section !== 'unclear') budget.turn();
  }
  if (!opts.dryRun) {
    const file = join(projectDir, REVIEW_STATE);
    mkdirSync(dirname(file), { recursive: true });
    withLock(file, () => {
      // A pass the budget stopped keeps the last complete pass's cursor, or none, so its unread stories are read next time.
      const at = report.stopped ? state?.at : now.toISOString();
      const next: ReviewState = { ...(at ? { at } : {}), all: Boolean(opts.all), ...(report.stopped ? { stopped: report.stopped } : {}), report };
      writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
    });
  }
  return report;
}

/** The report as the command prints it: three sections, each line naming the story and its evidence. */
export function reportLines(report: ReviewReport): string[] {
  const section = (title: string, lines: ReviewLine[]) => [title, ...(lines.length ? lines.map(l => `  ${l.id} ${l.verb}: ${l.note} (evidence: ${l.evidence})`) : ['  none'])];
  return [
    `review pass: read ${report.read} ${report.read === 1 ? 'story' : 'stories'}${report.stopped ? `, stopped: ${report.stopped}` : ''}`,
    ...(report.warning ? [`warning: ${report.warning}`] : []),
    ...section('fixed', report.fixed),
    ...section('asked', report.asked),
    ...section('could not tell', report.unclear),
  ];
}
