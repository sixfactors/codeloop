/**
 * The directory that holds the board, state and activity. A builder runs inside its story's
 * worktree (`../<repo>-wt-<card>`), whose own checkout holds no live board. CODELOOP_PROJECT_DIR,
 * when set, names the project; otherwise a linked worktree resolves to its repository's main tree
 * through `git rev-parse --git-common-dir`, so a worktree finds the repo's one board with no env.
 */
import { spawnSync } from 'child_process';
import { existsSync, realpathSync } from 'fs';
import { tmpdir } from 'os';
import { basename, dirname, join, resolve } from 'path';
import { storeHome } from './store-home.js';

const trees = new Map<string, { main?: string; top?: string }>();

/** The main tree and this checkout's top level, for a cwd inside a git worktree; cached per cwd. */
function treeOf(cwd: string): { main?: string; top?: string } {
  const hit = trees.get(cwd);
  if (hit) return hit;
  const r = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir', '--show-toplevel'], { cwd, encoding: 'utf-8' });
  let found: { main?: string; top?: string } = {};
  if (r.status === 0) {
    const [common, top] = r.stdout.trim().split('\n');
    if (common && top) {
      const real = (p: string) => (existsSync(p) ? realpathSync(p) : p);
      found = { main: basename(common) === '.git' ? real(dirname(common)) : undefined, top: real(top) };
    }
  }
  trees.set(cwd, found);
  return found;
}

const underTemp = (p: string): boolean => {
  let probe = resolve(p);
  while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe);
  const root = realpathSync(tmpdir());
  const real = realpathSync(probe);
  return real === root || real.startsWith(root + '/');
};

const underTest = (): boolean => !!process.env.VITEST || process.env.NODE_ENV === 'test';

/**
 * The main tree of the repository `cwd` is a linked worktree of, when that main tree has a codeloop project; else undefined.
 * Under a test run the link is followed only into the temp folder: a suite that runs services from
 * this repo's own worktree would otherwise resolve to the real board and write fixture cards on it.
 */
export function mainTreeOf(cwd: string): string | undefined {
  const { main, top } = treeOf(cwd);
  if (!main || !top || main === top) return undefined;
  if (underTest() && !underTemp(main)) return undefined;
  return existsSync(join(main, '.codeloop')) ? main : undefined;
}

export function projectRoot(): string {
  const dir = process.env.CODELOOP_PROJECT_DIR?.trim();
  const root = dir || (mainTreeOf(process.cwd()) ?? process.cwd());
  // CODELOOP_TEST_SANDBOX=1 is set by the vitest setup file and inherited by spawned CLIs: a test
  // that resolves outside the temp folder would read or write a real board.
  if (process.env.CODELOOP_TEST_SANDBOX === '1' && !underTemp(root)) {
    throw new Error(`test sandbox: refusing project root ${root}, which is outside ${tmpdir()}; point the test at a temp directory`);
  }
  return root;
}

/**
 * Where a story's own files live (spec folder, evidence, shape, mock, stage output) while its work is
 * on a branch. With `store.home: repo` they travel on the story's branch: CODELOOP_WORK_DIR (set by
 * the orchestrator), else the linked worktree the command runs in, else the project root. With
 * `store.home: user` they live in the one shared store whatever the checkout, so this is the
 * project root and the work-dir split does nothing.
 */
export function workDir(projectDir: string): string {
  if (storeHome(projectDir) === 'user') return projectDir;
  const dir = process.env.CODELOOP_WORK_DIR?.trim();
  // A lane check (`card selfcheck`, the gate) sets CODELOOP_WORK_DIR for `npm test`; a test that
  // inherits a real tree's path would write its fixture's evidence and specs into that tree.
  if (dir && process.env.CODELOOP_TEST_SANDBOX === '1' && !underTemp(dir)) {
    throw new Error(`test sandbox: refusing work dir ${dir}, which is outside ${tmpdir()}; point the test at a temp directory`);
  }
  if (dir) return dir;
  const main = mainTreeOf(process.cwd());
  return main && resolve(main) === resolve(projectDir) ? (treeOf(process.cwd()).top ?? projectDir) : projectDir;
}

/**
 * Runs `fn` with story files resolved against the project root. The interview (questions and
 * their answers) is board state: a person answers it in the main tree while the builder's branch
 * is not merged yet, so a builder asking from its worktree must still write there.
 */
export function onBoardTree<T>(fn: () => T): T {
  const saved = process.env.CODELOOP_WORK_DIR;
  delete process.env.CODELOOP_WORK_DIR;
  try {
    return fn();
  } finally {
    if (saved !== undefined) process.env.CODELOOP_WORK_DIR = saved;
  }
}

/** `join(workDir(projectDir), ...parts)`: the path of a story file, wherever the story's work is. */
export function specPath(projectDir: string, ...parts: string[]): string {
  return join(workDir(projectDir), ...parts);
}
