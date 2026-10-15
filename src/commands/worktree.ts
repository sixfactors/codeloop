import { Command } from 'commander';
import { createLocalClient } from '../sdk/local.js';
import { guard } from './guard.js';

export const worktreeCommand = new Command('worktree').description("Story worktrees (orch.isolation worktree or auto); the default is one main tree");

worktreeCommand
  .command('prune')
  .description('Remove each story worktree whose branch is merged into the trunk and whose tree is clean; anything else is listed and left')
  .option('--dry-run', 'List what would be removed, remove nothing')
  .action(guard(async (opts: { dryRun?: boolean }) => {
    const rows = await createLocalClient().worktrees.prune({ dryRun: opts.dryRun });
    if (!rows.length) return console.log('  no story worktrees');
    for (const r of rows) console.log(`  ${r.removed ? 'removed' : opts.dryRun && r.why.includes('merged into') ? 'would remove' : 'kept   '}  ${r.path}  (${r.why})`);
  }));
