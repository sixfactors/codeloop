/**
 * The directory that holds the board, state and activity. A builder runs inside its story's
 * worktree (`../<repo>-wt-<card>`), whose cwd has no live `.codeloop/state`; the orchestrator sets
 * CODELOOP_PROJECT_DIR to the main tree so a builder's hand-back and hooks write to the real board.
 */
export function projectRoot(): string {
  const dir = process.env.CODELOOP_PROJECT_DIR?.trim();
  return dir || process.cwd();
}
