import { spawnSync } from 'child_process';
import { loadConfig } from './config.js';
import type { Size } from './cards.js';

export interface Budget { files: number; lines: number }
export interface StoryDiff { files: number; lines: number; commits: number }
export interface BudgetVerdict extends StoryDiff {
  size: Size;
  /** `off` when the budget is disabled in config. */
  limit: Budget | 'off';
  pass: boolean;
  message: string;
}

export const DEFAULT_BUDGET: Record<Size, Budget> = {
  S: { files: 8, lines: 300 },
  M: { files: 20, lines: 1200 },
  L: { files: 40, lines: 3000 },
};

// Evidence, specs, tool state and the changelog grow with every story; counting them would make a
// well-documented small story look large.
const EXCLUDED = [/^evidence\//, /^specs\//, /^\.codeloop\//, /^CHANGELOG\.md$/];

function git(cwd: string, args: string[]): string {
  const run = spawnSync('git', args, { cwd, encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024 });
  return run.status === 0 ? run.stdout : '';
}

/** Each file the card's commits touched (budget exclusions applied) with its added+deleted lines, and how many commits carried the card's trailer. */
export function storyFiles(projectDir: string, cardId: string): { files: Map<string, number>; commits: number } {
  const sep = '\u0001';
  const log = git(projectDir, ['log', `--format=${sep}%H%n%b`]);
  const shas = log.split(sep).slice(1).filter(chunk => {
    const [, ...body] = chunk.split('\n');
    return body.some(l => {
      const m = /^(?:Card|Feature):\s*(\S+)\s*$/.exec(l);
      return m?.[1] === cardId;
    });
  }).map(chunk => chunk.split('\n')[0]);

  const files = new Map<string, number>();
  for (const sha of shas) {
    for (const row of git(projectDir, ['show', '--numstat', '--format=', '--no-renames', sha]).split('\n')) {
      const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(row);
      if (!m || EXCLUDED.some(re => re.test(m[3]))) continue;
      files.set(m[3], (files.get(m[3]) ?? 0) + (m[1] === '-' ? 0 : Number(m[1])) + (m[2] === '-' ? 0 : Number(m[2])));
    }
  }
  return { files, commits: shas.length };
}

/** Files and added+deleted lines across the commits reachable from HEAD that carry a `Card:` or `Feature:` trailer for this card. */
export function storyDiff(projectDir: string, cardId: string): StoryDiff {
  const { files, commits } = storyFiles(projectDir, cardId);
  return { files: files.size, lines: [...files.values()].reduce((a, b) => a + b, 0), commits };
}

/** The budget for a size: defaults, overridden per size by `diff_budget:` in config. `budget: off` returns undefined. */
export function budgetFor(projectDir: string, size: Size): Budget | undefined {
  const config = loadConfig(projectDir) as { budget?: unknown; diff_budget?: Record<string, Partial<Budget>> };
  // YAML reads a bare `off` as false.
  if (config.budget === false || config.budget === 'off') return undefined;
  const over = config.diff_budget?.[size] ?? {};
  return {
    files: typeof over.files === 'number' ? over.files : DEFAULT_BUDGET[size].files,
    lines: typeof over.lines === 'number' ? over.lines : DEFAULT_BUDGET[size].lines,
  };
}

const n = (v: number) => v.toLocaleString('en-US');

export function checkBudget(projectDir: string, cardId: string, size: Size | undefined): BudgetVerdict {
  const used = size ?? 'M';
  const diff = storyDiff(projectDir, cardId);
  const limit = budgetFor(projectDir, used);
  if (!limit) return { ...diff, size: used, limit: 'off', pass: true, message: 'budget off' };
  const pass = diff.files <= limit.files && diff.lines <= limit.lines;
  const message = pass
    ? `diff ${n(diff.files)} files / ${n(diff.lines)} lines is within the ${used} budget (${limit.files} files / ${n(limit.lines)} lines)`
    : `diff ${n(diff.files)} files / ${n(diff.lines)} lines exceeds the ${used} budget (${limit.files} files / ${n(limit.lines)} lines); split the story`;
  return { ...diff, size: used, limit, pass, message };
}

export function budgetLine(v: BudgetVerdict): string {
  const limit = v.limit === 'off' ? 'off' : `${v.limit.files} files / ${v.limit.lines} lines`;
  return `budget: ${v.files} files, ${v.lines} lines, limit ${limit} (${v.size}), ${v.limit === 'off' ? 'off' : v.pass ? 'pass' : 'fail'}`;
}
