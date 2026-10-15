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

export interface StoryCommit {
  sha: string;
  subject: string;
  /** Local branches that hold the commit, the trunk left out. */
  branches: string[];
  /** Reachable from the trunk. */
  merged: boolean;
  /** Commit time, epoch ms. */
  at: number;
}

const trailerOf = (cardId: string) => (l: string) => {
  const m = /^(?:Card|Feature):\s*(\S+)\s*$/.exec(l);
  return m?.[1] === cardId;
};

function trunkRef(projectDir: string): string {
  const configured = (loadConfig(projectDir).git as { trunk?: string } | undefined)?.trunk ?? 'main';
  return git(projectDir, ['rev-parse', '--verify', '--quiet', `refs/heads/${configured}`]).trim() ? configured : 'HEAD';
}

/** Commits carrying a `Card:` or `Feature:` trailer for the card, newest first, from HEAD only or (`branches`) from every local branch and worktree branch. */
/**
 * The commit a scope check ends at. The gate measures a builder's work on its branch before any
 * merge, so it sets `CODELOOP_STORY_REF` to the hand-back's head for the commands it runs; unset,
 * the story is whatever the current checkout reaches. Only `check scope` reads the variable: the
 * budget and health numbers are written into tracked evidence by `codeloop verify`, and measuring
 * them on the branch made that file differ between the gate's run and the main tree's, which
 * blocked the next story merge. Both still take an explicit `{ ref }`.
 */
export const storyRef = (ref?: string): string | undefined => ref || process.env.CODELOOP_STORY_REF?.trim() || undefined;

type Scanned = { sha: string; subject: string; at: number; decorations: string };

// While a caller holds withCommitIndex, every card's commits come from one `git log --all`, read
// once: the monitor asks about every card, and a log per card cost 2.7 s on a board of 171.
let index: { dir: string; byCard: Map<string, Scanned[]> } | undefined;

const cardsOf = (body: string): string[] => body.split('\n').flatMap(l => {
  const m = /^(?:Card|Feature):\s*(\S+)\s*$/.exec(l);
  return m ? [m[1]] : [];
});

function readLog(projectDir: string, ref: string | undefined, all: boolean): { rec: Scanned; body: string }[] {
  const log = git(projectDir, ['log', ...(ref ? [ref] : all ? ['--all'] : []), '--format=%H%x00%s%x00%b%x00%D%x00%ct%x01']);
  const out: { rec: Scanned; body: string }[] = [];
  for (const rec of log.split('\u0001')) {
    const [sha, subject, body, decorations, ct] = rec.replace(/^\n/, '').split('\u0000');
    if (sha && body) out.push({ rec: { sha, subject, decorations: decorations ?? '', at: Number(ct) * 1000 }, body });
  }
  return out;
}

/** Runs `fn` with all cards' story commits read from a single git log. Not reentrant across projects. */
export function withCommitIndex<T>(projectDir: string, fn: () => T): T {
  const byCard = new Map<string, Scanned[]>();
  for (const { rec, body } of readLog(projectDir, undefined, true)) for (const id of new Set(cardsOf(body))) (byCard.get(id) ?? byCard.set(id, []).get(id)!).push(rec);
  const saved = index;
  index = { dir: projectDir, byCard };
  try {
    return fn();
  } finally {
    index = saved;
  }
}

function scan(projectDir: string, cardId: string, all: boolean, ref?: string): Scanned[] {
  if (index && index.dir === projectDir && all && !ref) return index.byCard.get(cardId) ?? [];
  return readLog(projectDir, ref, all).filter(({ body }) => body.split('\n').some(trailerOf(cardId))).map(x => x.rec);
}

/** When each commit carrying the card's trailer landed, without the branch and trunk lookups storyCommits adds. */
export const storyCommitTimes = (projectDir: string, cardId: string): number[] => scan(projectDir, cardId, true).map(c => c.at);

export function storyCommits(projectDir: string, cardId: string): StoryCommit[] {
  const trunk = trunkRef(projectDir);
  return scan(projectDir, cardId, true).map(c => {
    const held = git(projectDir, ['branch', '--contains', c.sha, '--format=%(refname:short)']).split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('('));
    const merged = spawnSync('git', ['merge-base', '--is-ancestor', c.sha, trunk], { cwd: projectDir }).status === 0;
    return { sha: c.sha, subject: c.subject, at: c.at, merged, branches: held.filter(b => b !== trunk) };
  });
}

/** Each file the card's commits touched (budget exclusions applied) with its added+deleted lines, and how many commits carried the card's trailer. */
export function storyFiles(projectDir: string, cardId: string, opts: { branches?: boolean; ref?: string } = {}): { files: Map<string, number>; commits: number } {
  const shas = scan(projectDir, cardId, Boolean(opts.branches), opts.ref).map(c => c.sha);
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

/** Files and added+deleted lines across the commits reachable from HEAD (or, with `branches`, from any branch) that carry a `Card:` or `Feature:` trailer for this card. */
export function storyDiff(projectDir: string, cardId: string, opts: { branches?: boolean; ref?: string } = {}): StoryDiff {
  const { files, commits } = storyFiles(projectDir, cardId, opts);
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

export function checkBudget(projectDir: string, cardId: string, size: Size | undefined, opts: { ref?: string } = {}): BudgetVerdict {
  const used = size ?? 'M';
  const diff = storyDiff(projectDir, cardId, opts);
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
