import { loadBoard, saveBoard, updateTask, addTask, type Board } from '../lib/board.js';
import type { WatchSignal } from './signals.js';

export interface TriggerResult {
  action: string;
  details: string;
}

/**
 * Process a signal and determine what actions to take.
 * Returns a list of actions taken (for logging/reporting).
 */
export function processSignal(projectDir: string, signal: WatchSignal): TriggerResult[] {
  const results: TriggerResult[] = [];

  switch (signal.type) {
    case 'file_change':
      // File changes are primarily used to reset the idle timer.
      // No board action needed for individual file saves.
      results.push({
        action: 'file_tracked',
        details: `${signal.data.file}`,
      });
      break;

    case 'git_commit': {
      // Append commit SHA to the active board task
      try {
        let board = loadBoard(projectDir);
        const activeTask = board.tasks.find(
          t => t.status === 'in_progress' || t.status === 'planned',
        );

        if (activeTask) {
          const commits = [...activeTask.commits, signal.data.sha as string];
          board = updateTask(board, activeTask.id, { commits });
          saveBoard(projectDir, board);

          results.push({
            action: 'commit_tracked',
            details: `${signal.data.sha} → task ${activeTask.id} (${signal.data.message})`,
          });
        } else {
          results.push({
            action: 'commit_untracked',
            details: `${signal.data.sha} — no active task on board`,
          });
        }
      } catch {
        results.push({
          action: 'commit_error',
          details: `Failed to update board with commit ${signal.data.sha}`,
        });
      }
      break;
    }

    case 'idle':
      results.push({
        action: 'idle_timeout',
        details: `No activity for ${signal.data.idleSeconds}s`,
      });
      break;

    case 'test_result':
      results.push({
        action: 'test_tracked',
        details: `Tests: ${signal.data.passed}/${signal.data.total} passed`,
      });
      break;

    case 'build_status':
      results.push({
        action: 'build_tracked',
        details: `Build: ${signal.data.status}`,
      });
      break;
  }

  return results;
}
