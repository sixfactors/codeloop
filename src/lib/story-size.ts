import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import type { Card } from './cards.js';
import { loadConfig } from './config.js';
import { specPath } from './project-root.js';

export const DEFAULT_MAX_TASKS = 8;
/** The stage a story is split before: past it the builders are already ticking one shared task list. */
export const SPLIT_BEFORE_STAGE = 'build';

/** `lanes: { max_tasks: <n> }` in config.yaml; the story standard's eight otherwise. */
export function maxTasks(projectDir: string): number {
  const value = (loadConfig(projectDir).lanes as { max_tasks?: unknown } | undefined)?.max_tasks;
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : DEFAULT_MAX_TASKS;
}

/** Task lines in tasks.md, from whichever of the main tree and the story's worktree holds the newer file. */
export function countTaskLines(projectDir: string, card: Card): number {
  if (!card.spec) return 0;
  let best: { file: string; mtime: number } | undefined;
  for (const root of [projectDir, ...(card.worktree && existsSync(card.worktree) ? [card.worktree] : [])]) {
    const file = root === projectDir ? specPath(projectDir, card.spec, 'tasks.md') : join(root, card.spec, 'tasks.md');
    try {
      const mtime = statSync(file).mtimeMs;
      if (!best || mtime > best.mtime) best = { file, mtime };
    } catch { /* no tasks.md in this tree */ }
  }
  return best ? readFileSync(best.file, 'utf-8').split('\n').filter(l => /^- \[[ x]\]/.test(l)).length : 0;
}

/**
 * The sentence naming why a story is too big to build as one, or undefined. A story already split
 * (`split_from`) with no more tasks than the limit passes even when it still says size L.
 */
export function storySizeProblem(projectDir: string, card: Card): string | undefined {
  const limit = maxTasks(projectDir);
  const count = countTaskLines(projectDir, card);
  const advice = `split it into stories of ${limit === DEFAULT_MAX_TASKS ? 'eight' : limit} or fewer (\`codeloop card split ${card.id} ...\`)`;
  if (count > limit) return `${card.id} has ${count} tasks; ${advice}`;
  if (card.size === 'L' && !card.split_from) return `${card.id} is size L; ${advice}`;
  return undefined;
}
