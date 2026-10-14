/**
 * The directory that holds the board, state and activity. A builder runs inside its story's
 * worktree (`../<repo>-wt-<card>`), whose cwd has no live `.codeloop/state`; the orchestrator sets
 * CODELOOP_PROJECT_DIR to the main tree so a builder's hand-back and hooks write to the real board.
 */
import { join } from 'path';

export function projectRoot(): string {
  const dir = process.env.CODELOOP_PROJECT_DIR?.trim();
  return dir || process.cwd();
}

/**
 * Where a story's own files live (spec folder, evidence, shape, mock, stage output). A builder's
 * work sits on its branch in the story worktree until the merge, so the orchestrator sets
 * CODELOOP_WORK_DIR to that worktree and the gate reads the work where it is. Board state
 * (cards.json, .codeloop/state, activity, wiki) stays under the project root. After the merge the
 * variable is unset and this is the project root again.
 */
export function workDir(projectDir: string): string {
  const dir = process.env.CODELOOP_WORK_DIR?.trim();
  return dir || projectDir;
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
