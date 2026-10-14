import { specPath } from './project-root.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { cardKey, findCard, findCardOrNone, readCards } from './cards.js';
import { storyFiles, storyRef } from './diff-budget.js';
import { isSharedPath, outsidePlanScope, pathInPlan, planFiles } from './plan-scope.js';

export interface CreepFile { path: string; lines: number }

/**
 * Files the story's commits changed that its plan.md `## Files` list does not allow. A plan that
 * lists no files allows everything, the same as the edit guard, so nothing is reported for it.
 * Shared paths and the story's own working papers are never creep.
 */
export function scopeCreep(projectDir: string, cardId: string, opts: { ref?: string } = {}): CreepFile[] {
  const card = findCard(readCards(projectDir).cards, cardId);
  const allowed = planFiles(projectDir, card);
  if (!allowed) return [];
  const { files } = storyFiles(projectDir, card.id, { ref: storyRef(opts.ref) });
  return [...files]
    .filter(([path]) => !pathInPlan(projectDir, allowed, path) && !isSharedPath(projectDir, path) && !outsidePlanScope(projectDir, card, path))
    .map(([path, lines]) => ({ path, lines }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Rows of the `## Scope` table in review.md: file, verdict, reason. */
function scopeRows(text: string): { path: string; verdict: string; reason: string }[] {
  const section = /^## Scope[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text)?.[1] ?? '';
  return section.split('\n').filter(l => l.trim().startsWith('|')).map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim().replace(/^`|`$/g, '')))
    .filter(c => c.length >= 3 && c[0] !== '' && c[0].toLowerCase() !== 'file' && !/^-+$/.test(c[0]))
    .map(([path, verdict, ...reason]) => ({ path, verdict, reason: reason.join('|').trim() }));
}

/** One line per out-of-plan file that has no acceptable verdict in review.md; empty when the review answers for all of them. */
export function checkScope(projectDir: string, cardId: string, opts: { ref?: string } = {}): string[] {
  const card = findCard(readCards(projectDir).cards, cardId);
  const creep = scopeCreep(projectDir, card.id, opts);
  if (!creep.length) return [];
  const review = `evidence/${cardKey(card)}/review.md`;
  const file = specPath(projectDir, review);
  const rows = existsSync(file) ? scopeRows(readFileSync(file, 'utf-8')) : [];
  const problems: string[] = [];
  for (const { path, lines } of creep) {
    const where = `${path} (${lines} lines) is outside the plan`;
    const row = rows.find(r => r.path === path);
    if (!row) { problems.push(`${where} and ${review} has no \`## Scope\` row for it: add \`| ${path} | keep | revert | move to <card-id> | <reason> |\``); continue; }
    const verdict = row.verdict.toLowerCase();
    const move = /^move to\s+(\S+)$/.exec(verdict);
    if (verdict === 'keep') {
      const words = row.reason.split(/\s+/).filter(Boolean).length;
      if (words < 10) problems.push(`${where}: verdict keep needs a reason of at least 10 words, has ${words}`);
    } else if (verdict === 'revert') {
      if (!row.reason) problems.push(`${where}: verdict revert needs a reason`);
    } else if (move) {
      if (!findCardOrNone(readCards(projectDir).cards, move[1])) problems.push(`${where}: move to ${move[1]} names no existing card`);
      else if (!row.reason) problems.push(`${where}: verdict move to ${move[1]} needs a reason`);
    } else problems.push(`${where}: verdict "${row.verdict}" is not keep, revert or move to <card-id>`);
  }
  return problems;
}
