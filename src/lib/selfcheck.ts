/**
 * What a builder runs before handing back: the checks the gate would otherwise fail it on, run in
 * its own work dir, so findings are fixed in the builder's turn instead of a review round later.
 * The result is written as a `selfcheck` activity line carrying the head it ran at; the hand-back
 * copies it and the gate skips the stage check when it passed at the same head.
 */
import { spawnSync } from 'child_process';
import { appendActivity } from './activity.js';
import { currentSession } from './active-card.js';
import { findCard, readCards } from './cards.js';
import { checkBudget } from './diff-budget.js';
import { currentStage, runCheck } from './engine.js';
import { loadLane } from './lane.js';
import { evaluateRubric } from './rubric.js';
import { checkScope } from './scope-creep.js';
import { workDir } from './project-root.js';

export interface SelfcheckStep { name: 'stage' | 'scope' | 'rubric' | 'budget'; pass: boolean; detail: string }
export interface SelfcheckResult { card: string; stage: string; head: string; pass: boolean; failing: string[]; steps: SelfcheckStep[] }

const lastLine = (text: string) => text.trim().split('\n').map(l => l.trim()).filter(Boolean).pop() ?? '';
const firstProblem = (problems: string[]) => (problems.length > 1 ? `${problems[0]} (+${problems.length - 1} more)` : problems[0] ?? '');

export function runSelfcheck(projectDir: string, cardRef: string, work: string = workDir(projectDir)): SelfcheckResult {
  const card = findCard(readCards(projectDir).cards, cardRef);
  const stage = currentStage(loadLane(projectDir, card.lane), card);
  const steps: SelfcheckStep[] = [];
  // The story is measured up to the work tree's head, the same ref the gate uses, so a pass here means the same thing there.
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: work, encoding: 'utf8' }).stdout.trim();

  const checked = runCheck(projectDir, card, stage, work, head || undefined);
  steps.push({ name: 'stage', pass: checked ? checked.passed : true, detail: checked ? (checked.passed ? `${stage.id} check passed` : `${stage.id} check failed: ${lastLine(checked.output)}`) : `${stage.id} has no check` });

  const scope = checkScope(projectDir, card.id, { ref: head || undefined });
  steps.push({ name: 'scope', pass: scope.length === 0, detail: scope.length ? firstProblem(scope) : 'every changed file is in the plan or has a Scope row' });

  const rubric = evaluateRubric(projectDir, card.id).problems;
  steps.push({ name: 'rubric', pass: rubric.length === 0, detail: rubric.length ? firstProblem(rubric) : 'rubric met' });

  const budget = checkBudget(projectDir, card.id, card.size);
  steps.push({ name: 'budget', pass: budget.pass, detail: budget.message });

  const failing = steps.filter(s => !s.pass).map(s => s.name);
  const result: SelfcheckResult = { card: card.id, stage: card.stage, head, pass: failing.length === 0, failing, steps };
  appendActivity(projectDir, card.id, { session: currentSession(), kind: 'selfcheck', stage: card.stage, head, pass: result.pass, failing });
  return result;
}

/** The newest selfcheck line the card's activity holds for this head; undefined when none ran there. */
export function selfcheckAt(lines: { kind: string; head?: unknown; pass?: unknown; failing?: unknown }[], head: string): { head: string; pass: boolean; failing: string[] } | undefined {
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (l.kind === 'selfcheck' && l.head === head) return { head, pass: l.pass === true, failing: Array.isArray(l.failing) ? (l.failing as string[]) : [] };
  }
  return undefined;
}
