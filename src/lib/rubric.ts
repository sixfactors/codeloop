import { evidenceOf, usecasesOf } from './paths.js';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { specPath } from './project-root.js';
import { dirname, isAbsolute, join } from 'path';
import { fileURLToPath } from 'url';
import { cardKey, findCard, readCards, type Card } from './cards.js';
import { readQuestions } from './interview.js';
import { checkLiveWalk, liveWalkRequired } from './live-walk.js';
import { loadLane, loadSkillsIndex, skipReason, stageApplies, substitute, type Stage } from './lane.js';
import { checkMock, specScreenRefs, specScreens } from './mock.js';
import { checkResearch } from './research.js';
import { checkScope } from './scope-creep.js';
import { checkSpec, readAcceptance, readTasks } from './spec.js';
import { checkStory, knownPersonas } from './story.js';

/**
 * A stage's rubric (templates/skills/<stage>/rubric.md): one `Rn | <criterion> | check|attest|review`
 * row per criterion. `check` rows run here, `attest` rows need a `- Rn pass: <evidence>` line under
 * `## Rubric` at the end of the stage's output, `review` rows are judged by the stage's reviewer
 * agent when the lane names one (`review: { agent }`), otherwise by the person at the gate.
 */
export type Judged = 'check' | 'attest' | 'review';

export interface RubricRow {
  id: string;
  criterion: string;
  judged: Judged;
}

export interface RubricResult extends RubricRow {
  /**
   * pending: a review row with no stage reviewer, left to the person at the gate.
   * na: the row judges something the card does not have (a frame, for a card with no new screen); `finding` says why.
   */
  status: 'pass' | 'fail' | 'pending' | 'na';
  /** What failed, or the attested evidence. */
  finding?: string;
  evidence?: string;
  /** A check row with no mechanical check yet, judged as attest. */
  attestedCheck?: boolean;
}

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROW = /^([A-Z]\d+)\s*\|\s*(.+?)\s*\|\s*(check|attest|review)\s*$/;

export function parseRubric(text: string): RubricRow[] {
  return text.split('\n').map(l => ROW.exec(l.trim())).filter((m): m is RegExpExecArray => m !== null).map(m => ({ id: m[1], criterion: m[2], judged: m[3] as Judged }));
}

/**
 * The stage's rubric file: the project's installed skill folder named after the stage, then the one
 * named after its skill, then the same two in the package. A project overrides a rubric by editing
 * the copy in its own skill folder.
 */
export function rubricPath(projectDir: string, stage: Stage): string | null {
  const names = [...new Set([stage.id, ...(stage.skill ? [stage.skill] : [])])];
  const index = loadSkillsIndex(projectDir) ?? [];
  for (const name of names) {
    const source = index.find(s => s.name === name)?.source;
    if (!source) continue;
    const file = join(dirname(isAbsolute(source) ? source : specPath(projectDir, source)), 'rubric.md');
    if (existsSync(file)) return file;
  }
  for (const name of names) {
    const file = join(PACKAGE_ROOT, 'templates/skills', name, 'rubric.md');
    if (existsSync(file)) return file;
  }
  return null;
}

export function stageRubric(projectDir: string, stage: Stage): RubricRow[] {
  const path = rubricPath(projectDir, stage);
  return path ? parseRubric(readFileSync(path, 'utf-8')) : [];
}

/** Where a stage's attest lines live: its output, or `{spec}/rubric-<stage>.md` for a stage without a text output. */
export function attestPath(card: Card, stage: Stage, projectDir?: string): string | null {
  if (stage.output && !/\.html?$/i.test(stage.output)) return substitute(stage.output, card, { projectDir });
  return card.spec ? `${card.spec}/rubric-${stage.id}.md` : null;
}

export const reviewFile = (card: Card, stage: Stage) => (card.spec ? `${card.spec}/review-${stage.id}.md` : null);

interface Ctx {
  projectDir: string;
  card: Card;
  stage: Stage;
}

const read = (projectDir: string, path: string | null) => (path && existsSync(specPath(projectDir, path)) ? readFileSync(specPath(projectDir, path), 'utf-8') : '');
const specText = (c: Ctx) => read(c.projectDir, c.card.spec ? `${c.card.spec}/spec.md` : null);
const researchText = (c: Ctx) => read(c.projectDir, c.card.spec ? `${c.card.spec}/research.md` : null);
const evidence = (c: Ctx, file: string) => read(c.projectDir, `${evidenceOf(c.projectDir, cardKey(c.card))}/${file}`);
const PATH_OR_URL = /https?:\/\/\S+|(?:[\w.-]+\/)+[\w.-]+|\b[\w-]+\.[a-z]{1,5}\b/i;

/**
 * The rows that run mechanically, by id. A `check` row missing here is judged as attest until a
 * check exists, and `check rubric` says so.
 */
const CHECKS: Record<string, (c: Ctx) => string[]> = {
  R1: c => {
    const m = /^exists:[ \t]*(have|unlock|port|build)\b(.*)$/im.exec(researchText(c));
    if (!m) return ['`exists:` is not one of have, unlock, port, build'];
    return m[1].toLowerCase() !== 'build' && !PATH_OR_URL.test(m[2]) ? [`\`exists: ${m[1]}\` names no path or URL`] : [];
  },
  R3: c => {
    const pain = /^pain:[ \t]*(.*)$/im.exec(researchText(c))?.[1]?.trim();
    if (!pain) return ['`pain:` is empty'];
    return /assumption:/i.test(pain) || PATH_OR_URL.test(pain) || /\bsource\b/i.test(pain) ? [] : ['`pain:` names no source, and is not marked `assumption:`'];
  },
  R4: c => checkResearch(c.projectDir, c.card.id, 3).errors,
  I1: c => {
    const qs = readQuestions(c.projectDir, c.card);
    const problems = qs.length < 3 || qs.length > 5 ? [`${qs.length} question(s); ask three to five`] : [];
    return [...problems, ...qs.filter(q => !q.recommended).map(q => `Q${q.n} has no recommended answer`)];
  },
  M1: c => checkMock(c.projectDir, c.card.id),
  // The story standard as written in spec.md, where the spec stage puts it; the card's own fields are
  // used when spec.md has none (a card started with --persona, --can and --so).
  S1: c => {
    const spec = specText(c);
    const story = /^Story:[ \t]*As an? ([^,]+), I can .+, so that .+$/im.exec(spec);
    const problems: string[] = [];
    if (!story && checkStory(c.projectDir, c.card).length) problems.push('spec.md has no `Story: As a <persona>, I can <what>, so that <why>` line');
    else if (story && !knownPersonas(c.projectDir).includes(story[1].trim().toLowerCase())) problems.push(`persona "${story[1].trim()}" is not a known persona`);
    if (!/^size:[ \t]*(trivial|[SML])\b/m.test(spec) && !c.card.size) problems.push('no `size:` of trivial, S, M or L');
    if (!/^metric:[ \t]*\S/m.test(spec)) problems.push('no `metric:`');
    if (!/^done_when:[ \t]*\S/m.test(spec)) problems.push('no `done_when:`');
    return problems;
  },
  S2: c => {
    const lines = specText(c).split('\n').filter(l => /^-\s*US\d+\b/.test(l));
    if (lines.length < 1 || lines.length > 5) return [`${lines.length} acceptance line(s); write one to five`];
    return lines.filter(l => !/\bgiven\b/i.test(l) || !/\bwhen\b/i.test(l) || !/\bthen\b/i.test(l)).map(l => `acceptance line is not Given, when, then: ${l.slice(0, 80)}`);
  },
  S4: c => (c.card.spec ? checkSpec(c.projectDir, c.card.spec) : ['the card has no spec folder']),
  S5: c => {
    const order = ['data', 'api', 'sdk', 'ui'];
    const layers = (c.card.spec ? readTasks(c.projectDir, c.card.spec).tasks : []).map(t => order.indexOf(t.layer)).filter(i => i >= 0);
    const at = layers.findIndex((l, i) => i > 0 && l < layers[i - 1]);
    return at > 0 ? [`task ${at + 1} runs ${order[layers[at]]} after ${order[layers[at - 1]]}; order the tasks service, API, SDK, UI`] : [];
  },
  S7: c => (c.card.size === 'L' ? ['the story is size L; split it before the gate'] : []),
  B1: c => (c.card.spec ? readTasks(c.projectDir, c.card.spec).tasks.filter(t => !t.done).map(t => `${t.id} is not ticked`) : ['the card has no spec folder']),
  B4: c => checkScope(c.projectDir, c.card.id),
  V1: c => (/^result:\s*pass\b/im.test(evidence(c, 'verify.md')) ? [] : [`${evidenceOf(c.projectDir, cardKey(c.card))}/verify.md does not say \`result: pass\``]),
  V2: c => {
    const lines = c.card.spec ? readAcceptance(c.projectDir, c.card.spec) : [];
    const dir = specPath(c.projectDir, usecasesOf(c.projectDir, cardKey(c.card)));
    const named = new Set(existsSync(dir) ? readdirSync(dir).flatMap(f => [...readFileSync(join(dir, f), 'utf-8').matchAll(/^accept:\s*(US\d+)/gm)].map(m => m[1])) : []);
    return lines.map((_, i) => `US${i + 1}`).filter(us => !named.has(us)).map(us => `${us} has no use case naming it`);
  },
  V5: c => (liveWalkRequired(c.projectDir) ? checkLiveWalk(c.projectDir, c.card.id) : []),
  W1: c => (/^result:\s*pass\b/im.test(evidence(c, 'verify.md')) ? [] : ['verify.md does not say `result: pass`']),
  W6: c => (/^verdict:\s*(approve|accept)\b/im.test(evidence(c, 'review.md')) ? [] : ['review.md has no `verdict: approve` line']),
};

// The rows whose check reads the spec stage's output, and what they read.
const SPEC_ROWS: Record<string, string> = { B1: 'tasks.md', B4: 'plan.md file list' };

/** The `- Rn pass: <evidence>` lines under the last `## Rubric` heading of a stage's output. */
export function attestLines(text: string): Map<string, string> {
  const at = text.lastIndexOf('\n## Rubric');
  const block = at >= 0 ? text.slice(at) : text.startsWith('## Rubric') ? text : '';
  const lines = new Map<string, string>();
  for (const m of block.matchAll(/^\s*-\s*([A-Z]\d+)\s+pass:\s*(.*)$/gm)) lines.set(m[1], m[2].trim());
  return lines;
}

/** The `- Rn pending:` lines `rubric scaffold` wrote and nobody has attested yet. */
export function pendingLines(text: string): Set<string> {
  const at = text.lastIndexOf('\n## Rubric');
  const block = at >= 0 ? text.slice(at) : text.startsWith('## Rubric') ? text : '';
  return new Set([...block.matchAll(/^\s*-\s*([A-Z]\d+)\s+pending:/gm)].map(m => m[1]));
}

/** Evidence names something a second person can open or run: a path, a path:line, a URL or a command in backticks. */
export function concreteEvidence(text: string): boolean {
  return /https?:\/\/\S+/.test(text) || /`[^`]+`/.test(text) || /(?:[\w.-]+\/)+[\w.-]+(?::\d+)?/.test(text) || /\b[\w-]+\.[a-z]{1,5}:\d+\b/.test(text);
}

export interface RubricReport {
  stage: string;
  path: string | null;
  attestFile: string | null;
  review: { agent: string; file: string | null; verdict?: string } | null;
  rows: RubricResult[];
  problems: string[];
}

/** Judges the card's stage (or the named one) against its rubric. `problems` names every missing row. */
export function evaluateRubric(projectDir: string, ref: string, stageId?: string): RubricReport {
  const card = findCard(readCards(projectDir).cards, ref);
  const lane = loadLane(projectDir, card.lane);
  const stage = lane.stages.find(s => s.id === (stageId ?? card.stage));
  const empty: RubricReport = { stage: stageId ?? card.stage, path: null, attestFile: null, review: null, rows: [], problems: [] };
  if (!stage) return empty;
  const path = rubricPath(projectDir, stage);
  if (!path) return { ...empty, stage: stage.id };
  const ctx: Ctx = { projectDir, card, stage };
  const attestFile = attestPath(card, stage, projectDir);
  const attestText = read(projectDir, attestFile);
  const attested = attestLines(attestText);
  const pending = pendingLines(attestText);
  const review = stage.review ? { agent: stage.review.agent, file: reviewFile(card, stage) } : null;
  const reviewText = review ? read(projectDir, review.file) : '';
  const verdict = /^verdict:\s*(\S+)/im.exec(reviewText)?.[1]?.toLowerCase();

  // The mock stage's frame rows (M2, M4) judge a drawing; a card whose spec draws nothing has none to judge.
  const screens = stage.id === 'mock' ? specScreens(specText(ctx)) : [];
  const noNewScreen = stage.id === 'mock' && (screens === 'none' || (screens.length === 0 && specScreenRefs(specText(ctx)).length > 0));
  const naReason = `not applicable: no new screen (${screens === 'none' ? '`screens: none`' : 'every screen references an existing mock'} in the spec)`;

  // Rows that read what the spec stage writes do not apply to a card that skipped it (size trivial).
  const specStage = lane.stages.find(s => s.id === 'spec');
  const skippedSpec = specStage && !stageApplies(specStage, card) ? skipReason(specStage, card) : undefined;

  const rows: RubricResult[] = parseRubric(readFileSync(path, 'utf-8')).map(row => {
    if (noNewScreen && (row.judged === 'attest' || (row.judged === 'check' && !CHECKS[row.id]))) return { ...row, status: 'na', finding: naReason };
    if (skippedSpec && SPEC_ROWS[row.id]) return { ...row, status: 'na', finding: `not applicable: no ${SPEC_ROWS[row.id]}; the card skipped the spec stage (${skippedSpec})` };
    const check = row.judged === 'check' ? CHECKS[row.id] : undefined;
    if (check) {
      let found: string[];
      try {
        found = check(ctx);
      } catch (e) {
        // A missing file the check reads is this row failing, not the whole rubric.
        found = [e instanceof Error ? e.message : String(e)];
      }
      return found.length ? { ...row, status: 'fail', finding: found.join('; ') } : { ...row, status: 'pass' };
    }
    if (row.judged === 'review') {
      if (!review) return { ...row, status: 'pending', finding: 'judged by the person at the gate' };
      if (verdict === 'accept') return { ...row, status: 'pass' };
      const finding = new RegExp(`^\\s*-?\\s*${row.id}\\b[:\\s]+(.+)$`, 'm').exec(reviewText)?.[1]?.trim();
      return { ...row, status: 'fail', finding: finding ?? (reviewText ? `the reviewer's verdict is ${verdict ?? 'missing'}` : `${review.file} is missing`) };
    }
    const line = attested.get(row.id);
    const attestedCheck = row.judged === 'check';
    if (line === undefined && pending.has(row.id)) return { ...row, status: 'fail', finding: `pending: scaffolded in ${attestFile}, not yet attested; replace \`- ${row.id} pending:\` with \`- ${row.id} pass: <evidence>\``, ...(attestedCheck ? { attestedCheck } : {}) };
    if (line === undefined) return { ...row, status: 'fail', finding: `missing: no \`- ${row.id} pass: <evidence>\` line under ## Rubric in ${attestFile}`, ...(attestedCheck ? { attestedCheck } : {}) };
    if (!line || !concreteEvidence(line)) return { ...row, status: 'fail', finding: `${row.id}'s evidence names no path, line, URL or command`, evidence: line, ...(attestedCheck ? { attestedCheck } : {}) };
    return { ...row, status: 'pass', evidence: line, ...(attestedCheck ? { attestedCheck } : {}) };
  });

  const problems = rows.filter(r => r.status === 'fail').map(r => `${r.id} ${r.criterion}: ${r.finding}`);
  if (review && verdict !== 'accept') problems.push(`${review.file} needs \`verdict: accept\` from the ${review.agent} agent (${reviewText ? `it says ${verdict ?? 'nothing'}` : 'it is missing'})`);
  return { stage: stage.id, path, attestFile, review: review ? { ...review, ...(verdict ? { verdict } : {}) } : null, rows, problems };
}

/** The rubric section of a stage brief: every row, and how to attest. */
export function rubricBrief(projectDir: string, card: Card, stage: Stage): string[] {
  const rows = stageRubric(projectDir, stage);
  if (!rows.length) return [];
  const attest = rows.filter(r => r.judged === 'attest' || (r.judged === 'check' && !CHECKS[r.id]));
  return [
    `## Rubric: ${stage.id}`,
    '',
    'The stage counts as done only when every row holds. `check` rows are run by `codeloop check rubric`; `review` rows are judged by a reviewer.',
    '',
    ...rows.map(r => `${r.id} | ${r.criterion} | ${CHECKS[r.id] || r.judged !== 'check' ? r.judged : 'attest (no mechanical check yet)'}`),
    '',
    `End ${attestPath(card, stage, projectDir) ?? 'the output'} with a \`## Rubric\` heading and one \`- Rn pass: <evidence>\` line for each of ${attest.map(r => r.id).join(', ') || 'no rows'}; the evidence names a path, a line, a URL or a command a second person can check.`,
    '',
  ];
}

/** The brief a stage's reviewer agent gets: the rubric's review rows and the output to judge. */
export function reviewBrief(projectDir: string, card: Card, stage: Stage): string {
  const rows = stageRubric(projectDir, stage).filter(r => r.judged === 'review' || r.judged === 'attest');
  const output = attestPath(card, stage, projectDir);
  return [
    `# Review: ${card.id} ${stage.id}`,
    '',
    `Card: ${card.id} ${card.title}`,
    '',
    `Judge ${output ?? 'the stage output'} against these rows. Read the files it cites before accepting a claim about them.`,
    '',
    ...rows.map(r => `${r.id} | ${r.criterion} | ${r.judged}`),
    '',
    `Write ${reviewFile(card, stage)}: one line per row, \`- <id> accept\` or \`- <id> <finding with the evidence>\`, then a last line \`verdict: accept\` when every row holds, otherwise \`verdict: findings\`.`,
    '',
    `## ${output}`,
    '',
    read(projectDir, output),
  ].join('\n');
}

/** The rows a person or agent attests by hand at this stage: attest rows, and check rows with no check yet. */
export function attestRows(projectDir: string, stage: Stage): RubricRow[] {
  return stageRubric(projectDir, stage).filter(r => r.judged === 'attest' || (r.judged === 'check' && !CHECKS[r.id]));
}

/**
 * Appends a `## Rubric` block with a `- Rn pending:` line for each attest row of the card's stage
 * that has no line yet, so a card already in flight when a rubric arrives shows what it owes instead
 * of failing as if it ignored the rubric. Writes nothing when every row has a line.
 */
export function scaffoldRubric(projectDir: string, ref: string): { path: string | null; added: string[] } {
  const card = findCard(readCards(projectDir).cards, ref);
  const stage = loadLane(projectDir, card.lane).stages.find(s => s.id === card.stage);
  const path = stage ? attestPath(card, stage, projectDir) : null;
  if (!stage || !path) return { path: null, added: [] };
  const text = read(projectDir, path);
  const have = new Set([...attestLines(text).keys(), ...pendingLines(text)]);
  const missing = attestRows(projectDir, stage).filter(r => !have.has(r.id));
  if (!missing.length) return { path, added: [] };
  const lines = missing.map(r => `- ${r.id} pending: ${r.criterion}`).join('\n');
  const hasBlock = /(^|\n)## Rubric\s*\n/.test(text);
  const next = hasBlock ? `${text.replace(/\s*$/, '')}\n${lines}\n` : `${text.replace(/\s*$/, '')}${text.trim() ? '\n\n' : ''}## Rubric\n\n${lines}\n`;
  mkdirSync(dirname(specPath(projectDir, path)), { recursive: true });
  writeFileSync(specPath(projectDir, path), next);
  return { path, added: missing.map(r => r.id) };
}

/** Cards in a lane whose current stage has attest rows with no line at all: what `rubric scaffold` would fill. */
export function cardsNeedingRubric(projectDir: string, laneId?: string): { id: string; stage: string; rows: string[] }[] {
  const out: { id: string; stage: string; rows: string[] }[] = [];
  for (const card of readCards(projectDir).cards) {
    if (laneId && card.lane !== laneId) continue;
    if (['proposed', 'queued', 'done', 'dropped'].includes(card.stage)) continue;
    try {
      const report = evaluateRubric(projectDir, card.id);
      const rows = report.rows.filter(r => r.finding?.startsWith('missing:')).map(r => r.id);
      if (rows.length) out.push({ id: card.id, stage: report.stage, rows });
    } catch {
      // A card whose lane no longer loads is reported by lane lint, not here.
    }
  }
  return out;
}
