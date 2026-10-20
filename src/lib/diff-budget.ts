import { spawnSync } from 'child_process';
import { readAllActivity } from './activity.js';
import { commitGraph, reachableFrom, type CommitGraph } from './commit-graph.js';
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
  trivial: { files: 3, lines: 50 },
  S: { files: 8, lines: 300 },
  M: { files: 20, lines: 1200 },
  L: { files: 40, lines: 3000 },
};

// Evidence, specs, tool state and the changelog grow with every story; counting them would make a
// well-documented small story look large.
const EXCLUDED = [/^evidence\//, /^specs\//, /^\.codeloop\//, /^CHANGELOG\.md$/];

// A Markdown page under docs/ is read, not reviewed line by line, and one page runs to hundreds of
// lines, so it counts as a file and at one tenth of its lines: a one-page story stays trivial, and a
// 10,000-line page still breaks the trivial budget. An .html or .mdx page can carry scripts or JSX
// that are reviewed like code, so it counts in full.
const PROSE = /^docs\/.+\.md$/;
const PROSE_SHARE = 10;
const PROSE_NOTE = ' (Markdown pages under docs/ count at one tenth of their lines)';

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

function readLog(projectDir: string, ref: string | undefined, all: boolean): { rec: Scanned; body: string }[] {
  const log = git(projectDir, ['log', ...(ref ? [ref] : all ? ['--all'] : []), '--format=%H%x00%s%x00%b%x00%D%x00%ct%x01']);
  const out: { rec: Scanned; body: string }[] = [];
  for (const rec of log.split('\u0001')) {
    const [sha, subject, body, decorations, ct] = rec.replace(/^\n/, '').split('\u0000');
    if (sha && body) out.push({ rec: { sha, subject, decorations: decorations ?? '', at: Number(ct) * 1000 }, body });
  }
  return out;
}

/** Kept for callers that bracket a batch of reads; the commit graph now caches across requests on its own. */
export function withCommitIndex<T>(projectDir: string, fn: () => T): T {
  commitGraph(projectDir);
  return fn();
}

function scan(projectDir: string, cardId: string, all: boolean, ref?: string): Scanned[] {
  if (!ref) {
    const graph = commitGraph(projectDir);
    if (graph) {
      const onHead = all ? undefined : reachableFrom(graph, 'head', graph.head);
      return (graph.byCard.get(cardId) ?? []).filter(c => !onHead || onHead[graph.index.get(c.sha)!] === 1).map(c => ({ sha: c.sha, subject: c.subject, at: c.at, decorations: '' }));
    }
  }
  return readLog(projectDir, ref, all).filter(({ body }) => body.split('\n').some(trailerOf(cardId))).map(x => x.rec);
}

/** When each commit carrying the card's trailer landed, without the branch and trunk lookups storyCommits adds. */
export const storyCommitTimes = (projectDir: string, cardId: string): number[] => scan(projectDir, cardId, true).map(c => c.at);

const configuredTrunk = (projectDir: string) => (loadConfig(projectDir).git as { trunk?: string } | undefined)?.trunk ?? 'main';

/** The trunk's remote-tracking branch: its configured upstream, else `origin/<trunk>`. */
function remoteTrunk(projectDir: string, trunk: string): string {
  const get = (key: string) => spawnSync('git', ['config', '--get', key], { cwd: projectDir, encoding: 'utf-8' }).stdout?.trim() ?? '';
  const remote = get(`branch.${trunk}.remote`);
  const merge = get(`branch.${trunk}.merge`).replace(/^refs\/heads\//, '');
  return remote && remote !== '.' && merge ? `${remote}/${merge}` : `origin/${trunk}`;
}

/**
 * What the trunk reaches: the local branch and its remote-tracking branch together. A PR merged on
 * the remote moves only the remote-tracking branch, and a checkout that never switches to the
 * trunk keeps a local one far behind it; reading the local branch alone counts that work unmerged.
 * Undefined when neither exists.
 */
function trunkReach(projectDir: string, graph: CommitGraph, trunk: string): Uint8Array | undefined {
  const key = `trunk:${trunk}`;
  const hit = graph.reach.get(key);
  if (hit) return hit;
  const remote = remoteTrunk(projectDir, trunk);
  const tips = [graph.tips.get(trunk), graph.remoteTips.get(remote)].filter((t): t is number => t !== undefined);
  if (!tips.length) return undefined;
  const reach = new Uint8Array(graph.commits.length);
  tips.forEach((tip, n) => reachableFrom(graph, `${key}:${n}`, tip).forEach((v, i) => { if (v) reach[i] = 1; }));
  graph.reach.set(key, reach);
  return reach;
}

/**
 * The configured trunk against the checkout: `missing` when neither a local branch nor its
 * remote-tracking branch has its name, and `behind` the commits HEAD has that the trunk does not.
 * Undefined outside a git repo.
 */
export function trunkState(projectDir: string): { trunk: string; missing: boolean; behind: number } | undefined {
  const graph = commitGraph(projectDir);
  if (!graph) return undefined;
  const trunk = configuredTrunk(projectDir);
  const onTrunk = trunkReach(projectDir, graph, trunk);
  if (!onTrunk) return { trunk, missing: true, behind: 0 };
  const onHead = reachableFrom(graph, 'head', graph.head);
  let behind = 0;
  for (let i = 0; i < onHead.length; i++) if (onHead[i] === 1 && onTrunk[i] !== 1) behind++;
  return { trunk, missing: false, behind };
}

/**
 * The commits the post-commit hook recorded on the story's activity that carry no `Card:` or
 * `Feature:` trailer. A commit made outside the loop has no trailer; the story active in the session
 * that made it is the only link to it. A trailer, when present, names the story instead.
 */
function activityCommits(projectDir: string, graph: CommitGraph, cardId: string): CommitGraph['commits'] {
  const shas = readAllActivity(projectDir, cardId).flatMap(e => {
    const sha = (e as { sha?: unknown }).sha;
    return e.kind === 'commit' && typeof sha === 'string' && sha.length >= 7 ? [sha] : [];
  });
  if (!shas.length) return [];
  const out: CommitGraph['commits'] = [];
  for (const short of new Set(shas)) {
    const c = graph.commits.find(x => x.sha.startsWith(short));
    if (c && !c.cards.length) out.push(c);
  }
  return out;
}

export function storyCommits(projectDir: string, cardId: string): StoryCommit[] {
  const graph = commitGraph(projectDir);
  if (!graph) return [];
  const trunk = configuredTrunk(projectDir);
  // A trunk with no branch merges nothing: reading HEAD in its place would count whatever is checked out as merged.
  const onTrunk = trunkReach(projectDir, graph, trunk) ?? new Uint8Array(graph.index.size);
  const branches = [...graph.tips].filter(([name]) => name !== trunk).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const byTrailer = graph.byCard.get(cardId) ?? [];
  const byActivity = activityCommits(projectDir, graph, cardId);
  const linked = byActivity.length ? [...byTrailer, ...byActivity].sort((a, b) => b.at - a.at) : byTrailer;
  return linked.map(c => {
    const i = graph.index.get(c.sha)!;
    return { sha: c.sha, subject: c.subject, at: c.at, merged: onTrunk[i] === 1, branches: branches.filter(([name, tip]) => reachableFrom(graph, `branch:${name}`, tip)[i] === 1).map(([name]) => name) };
  });
}

// A commit's numstat never changes, so it is kept for the life of the process. Missing ones are
// read together in one git call: one spawn per commit cost 45 ms each, 2.3 s for a long story.
const numstats = new Map<string, [string, number][]>();

function numstatOf(projectDir: string, wanted: string[], sha: string): [string, number][] {
  const key = (s: string) => `${projectDir}\0${s}`;
  if (!numstats.has(key(sha))) {
    const missing = wanted.filter(s => !numstats.has(key(s)));
    for (let i = 0; i < missing.length; i += 200) {
      const chunk = missing.slice(i, i + 200);
      const out = git(projectDir, ['show', '--numstat', '--format=%x01%H', '--no-renames', ...chunk]);
      for (const part of out.split('\u0001')) {
        const [id, ...rows] = part.split('\n');
        if (!id) continue;
        const list: [string, number][] = [];
        for (const row of rows) {
          const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(row);
          if (m) list.push([m[3], (m[1] === '-' ? 0 : Number(m[1])) + (m[2] === '-' ? 0 : Number(m[2]))]);
        }
        numstats.set(key(id.trim()), list);
      }
      for (const s of chunk) if (!numstats.has(key(s))) numstats.set(key(s), []);
    }
  }
  return numstats.get(key(sha)) ?? [];
}

/** The paths each commit touched, with no exclusions, read in one batched git call. */
export function commitFiles(projectDir: string, shas: string[]): Map<string, string[]> {
  return new Map(shas.map(sha => [sha, numstatOf(projectDir, shas, sha).map(([path]) => path)]));
}

/** Each file the card's commits touched (budget exclusions applied) with its added+deleted lines, and how many commits carried the card's trailer. */
export function storyFiles(projectDir: string, cardId: string, opts: { branches?: boolean; ref?: string } = {}): { files: Map<string, number>; commits: number } {
  const shas = scan(projectDir, cardId, Boolean(opts.branches), opts.ref).map(c => c.sha);
  const files = new Map<string, number>();
  for (const sha of shas) {
    for (const [path, lines] of numstatOf(projectDir, shas, sha)) {
      if (EXCLUDED.some(re => re.test(path))) continue;
      files.set(path, (files.get(path) ?? 0) + lines);
    }
  }
  return { files, commits: shas.length };
}

/** Files and added+deleted lines across the commits reachable from HEAD (or, with `branches`, from any branch) that carry a `Card:` or `Feature:` trailer for this card. */
export function storyDiff(projectDir: string, cardId: string, opts: { branches?: boolean; ref?: string } = {}): StoryDiff {
  const { files, lines, commits } = measure(projectDir, cardId, opts);
  return { files, lines, commits };
}

function measure(projectDir: string, cardId: string, opts: { branches?: boolean; ref?: string }): StoryDiff & { prose: boolean } {
  const { files, commits } = storyFiles(projectDir, cardId, opts);
  const counted = [...files].map(([path, n]) => (PROSE.test(path) ? Math.ceil(n / PROSE_SHARE) : n));
  return { files: files.size, lines: counted.reduce((a, n) => a + n, 0), commits, prose: [...files.keys()].some(path => PROSE.test(path)) };
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
  const { prose, ...diff } = measure(projectDir, cardId, opts);
  const limit = budgetFor(projectDir, used);
  if (!limit) return { ...diff, size: used, limit: 'off', pass: true, message: 'budget off' };
  const pass = diff.files <= limit.files && diff.lines <= limit.lines;
  const note = prose ? PROSE_NOTE : '';
  const message = pass
    ? `diff ${n(diff.files)} files / ${n(diff.lines)} lines${note} is within the ${used} budget (${limit.files} files / ${n(limit.lines)} lines)`
    : `diff ${n(diff.files)} files / ${n(diff.lines)} lines${note} exceeds the ${used} budget (${limit.files} files / ${n(limit.lines)} lines); split the story`;
  return { ...diff, size: used, limit, pass, message };
}

export function budgetLine(v: BudgetVerdict): string {
  const limit = v.limit === 'off' ? 'off' : `${v.limit.files} files / ${v.limit.lines} lines`;
  return `budget: ${v.files} files, ${v.lines} lines, limit ${limit} (${v.size}), ${v.limit === 'off' ? 'off' : v.pass ? 'pass' : 'fail'}`;
}
