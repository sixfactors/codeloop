/**
 * Every commit of the repository, read by one `git log --all` and kept between requests. Cards ask
 * "which commits carry my trailer, which branches hold them, are they on the trunk"; answered per
 * card that was a git log plus two git calls per commit (6 s for a board page). Here the log is
 * parsed once into a parent graph and each question is answered from it.
 *
 * The cache is keyed on a stamp read from the filesystem (HEAD, packed-refs and the newest mtime
 * under refs/ with the ref count), so a commit, branch or ref update anywhere, including another
 * worktree, makes the next read rebuild it.
 */
import { spawnSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { isAbsolute, join, resolve } from 'path';

export interface GraphCommit {
  sha: string;
  subject: string;
  /** Commit time, epoch ms. */
  at: number;
  /** Card ids named by `Card:` or `Feature:` trailers. */
  cards: string[];
}

export interface CommitGraph {
  stamp: string;
  commits: GraphCommit[];
  byCard: Map<string, GraphCommit[]>;
  /** Local branch name -> index of its tip in `commits`. */
  tips: Map<string, number>;
  /** Index of the commit HEAD points at. */
  head?: number;
  parents: number[][];
  index: Map<string, number>;
  reach: Map<string, Uint8Array>;
}

function gitDirs(projectDir: string): { gitDir: string; common: string } | undefined {
  const dot = join(projectDir, '.git');
  try {
    if (statSync(dot).isDirectory()) return { gitDir: dot, common: dot };
    const gitDir = /^gitdir:\s*(.+)$/m.exec(readFileSync(dot, 'utf-8'))?.[1]?.trim();
    if (!gitDir) return undefined;
    const abs = isAbsolute(gitDir) ? gitDir : resolve(projectDir, gitDir);
    const commondir = existsSync(join(abs, 'commondir')) ? readFileSync(join(abs, 'commondir'), 'utf-8').trim() : '.';
    return { gitDir: abs, common: isAbsolute(commondir) ? commondir : resolve(abs, commondir) };
  } catch {
    return undefined;
  }
}

function newestUnder(dir: string, acc: { newest: number; count: number }): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const p = join(dir, name);
    const st = statSync(p, { throwIfNoEntry: false });
    if (!st) continue;
    if (st.isDirectory()) newestUnder(p, acc);
    else {
      acc.count++;
      if (st.mtimeMs > acc.newest) acc.newest = st.mtimeMs;
    }
  }
}

/** HEAD's content, and the newest ref mtime with the ref count; undefined outside a git checkout. */
export function refsStamp(projectDir: string): string | undefined {
  const dirs = gitDirs(projectDir);
  if (!dirs) return undefined;
  const acc = { newest: 0, count: 0 };
  newestUnder(join(dirs.common, 'refs'), acc);
  const packed = statSync(join(dirs.common, 'packed-refs'), { throwIfNoEntry: false });
  let head = '';
  try {
    head = readFileSync(join(dirs.gitDir, 'HEAD'), 'utf-8').trim();
  } catch {
    // no HEAD file: not a usable checkout
  }
  // A symbolic HEAD names a branch; its tip's content is part of the stamp so two commits in the same millisecond still differ.
  let tip = '';
  const sym = /^ref:\s*(.+)$/.exec(head)?.[1];
  if (sym) {
    try {
      tip = readFileSync(join(dirs.common, sym), 'utf-8').trim();
    } catch {
      // packed: the packed-refs mtime in the stamp covers it
    }
  }
  return `${head}|${tip}|${acc.newest}|${acc.count}|${packed?.mtimeMs ?? 0}`;
}

const cache = new Map<string, CommitGraph>();

const trailerIds = (body: string): string[] =>
  body.split('\n').flatMap(l => {
    const m = /^(?:Card|Feature):\s*(\S+)\s*$/.exec(l);
    return m ? [m[1]] : [];
  });

/** The repository's commit graph, rebuilt only when the refs stamp changed. Undefined when git has nothing to read. */
export function commitGraph(projectDir: string): CommitGraph | undefined {
  const stamp = refsStamp(projectDir);
  if (stamp === undefined) return undefined;
  const hit = cache.get(projectDir);
  if (hit?.stamp === stamp) return hit;
  const run = spawnSync('git', ['log', '--all', '--decorate=full', '--format=%H%x00%P%x00%s%x00%b%x00%D%x00%ct%x01'], { cwd: projectDir, encoding: 'utf-8', maxBuffer: 512 * 1024 * 1024 });
  if (run.status !== 0) return undefined;
  const commits: GraphCommit[] = [];
  const index = new Map<string, number>();
  const parentShas: string[][] = [];
  const tips = new Map<string, number>();
  let head: number | undefined;
  const byCard = new Map<string, GraphCommit[]>();
  for (const rec of run.stdout.split('\u0001')) {
    const [sha, parents, subject, body, decorations, ct] = rec.replace(/^\n/, '').split('\u0000');
    if (!sha) continue;
    const i = commits.length;
    const cards = [...new Set(trailerIds(body ?? ''))];
    const c: GraphCommit = { sha, subject: subject ?? '', at: Number(ct) * 1000, cards };
    commits.push(c);
    index.set(sha, i);
    parentShas.push(parents ? parents.split(' ') : []);
    for (const id of cards) (byCard.get(id) ?? byCard.set(id, []).get(id)!).push(c);
    for (const d of (decorations ?? '').split(', ')) {
      const m = /^(?:HEAD -> )?refs\/heads\/(.+)$/.exec(d.trim());
      if (m) tips.set(m[1], i);
      if (d.trim() === 'HEAD' || d.trim().startsWith('HEAD -> ')) head = i;
    }
  }
  const parents = parentShas.map(ps => ps.flatMap(p => (index.has(p) ? [index.get(p)!] : [])));
  const graph: CommitGraph = { stamp, commits, byCard, tips, head, parents, index, reach: new Map() };
  cache.set(projectDir, graph);
  return graph;
}

/** What is reachable from a commit index, as a flag per commit; memoised on the graph under `key`. */
export function reachableFrom(graph: CommitGraph, key: string, tip: number | undefined): Uint8Array {
  const hit = graph.reach.get(key);
  if (hit) return hit;
  const seen = new Uint8Array(graph.commits.length);
  if (tip !== undefined) {
    const stack = [tip];
    while (stack.length) {
      const i = stack.pop()!;
      if (seen[i]) continue;
      seen[i] = 1;
      for (const p of graph.parents[i]) if (!seen[p]) stack.push(p);
    }
  }
  graph.reach.set(key, seen);
  return seen;
}
