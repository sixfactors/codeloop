import { Command } from 'commander';
import { computeProgress, parseWindow, renderProgress } from '../lib/story-progress.js';
import { projectRoot } from '../lib/project-root.js';
import { guard, refuse } from './guard.js';

export const progressCommand = new Command('progress')
  .description('How stories moved: stage moves, time per stage, waits, stuck stories, gates and repeated failures. Measured from the board, no model calls')
  .option('--since <window>', 'Window to measure: 90m, 24h, 7d, 2w', '7d')
  .option('--json', 'JSON output')
  .action(guard((opts: { since: string; json?: boolean }) => {
    let windowMs: number;
    try {
      windowMs = parseWindow(opts.since);
    } catch (e) {
      throw refuse((e as Error).message);
    }
    const report = computeProgress(projectRoot(), { windowMs });
    console.log(opts.json ? JSON.stringify(report, null, 2) : renderProgress(report));
  }));
