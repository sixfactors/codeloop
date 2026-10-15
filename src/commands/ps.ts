import chalk from 'chalk';
import { Command } from 'commander';
import { codeloopProcesses, memoryCeilingMb, totalMb } from '../lib/memory.js';
import { projectRoot } from '../lib/project-root.js';

export const psCommand = new Command('ps')
  .description('Running codeloop processes and what each holds in memory; --total prints the sum against limits.max_memory_mb')
  .option('--total', 'Print only the total, as "<used> MB of <ceiling> MB", and exit 1 when over the ceiling')
  .option('--json', 'Machine-readable output')
  .action((opts: { total?: boolean; json?: boolean }) => {
    const rows = codeloopProcesses();
    const total = totalMb(rows);
    const ceiling = memoryCeilingMb(projectRoot());
    if (opts.json) {
      console.log(JSON.stringify({ totalMb: total, ceilingMb: ceiling, over: total > ceiling, processes: rows }));
    } else if (opts.total) {
      console.log(`${total} MB of ${ceiling} MB`);
    } else {
      for (const r of rows) console.log(`${String(r.pid).padStart(7)}  ${String(r.mb).padStart(7)} MB  ${r.kind.padEnd(5)}  ${r.command.slice(0, 100)}`);
      console.log(`${rows.length} process(es), ${total} MB of ${ceiling} MB`);
    }
    if (total > ceiling) {
      if (!opts.json) console.error(chalk.red(`over limits.max_memory_mb (${ceiling})`));
      process.exitCode = 1;
    }
  });
