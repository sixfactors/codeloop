import chalk from 'chalk';
import { Command } from 'commander';
import { codeloopProcesses, memoryCeilingMb, totalMb } from '../lib/memory.js';
import { projectRoot } from '../lib/project-root.js';
import { createLocalClient } from '../sdk/local.js';
import { guard } from './guard.js';

export const psCommand = new Command('ps')
  .description('Every running codeloop process and its memory, and the agent process groups codeloop started here (with their purpose and whether the parent is gone); --total sums memory against limits.max_memory_mb')
  .option('--total', 'Print only the memory total, as "<used> MB of <ceiling> MB", and exit 1 when over the ceiling')
  .option('--kill-orphans', 'Kill each agent process group whose parent codeloop process has exited; a live parent is never touched')
  .option('--json', 'JSON output')
  .action(guard(async (opts: { total?: boolean; killOrphans?: boolean; json?: boolean }) => {
    if (opts.killOrphans) {
      const killed = await createLocalClient().procs.killOrphans();
      console.log(killed.length ? `  killed ${killed.length} orphaned process group(s): ${killed.join(', ')}` : '  no orphaned processes');
      return;
    }
    const rows = codeloopProcesses();
    const total = totalMb(rows);
    const ceiling = memoryCeilingMb(projectRoot());
    const over = total > ceiling;
    const groups = opts.total ? [] : (await createLocalClient().procs.list()).filter(p => p.alive);
    if (opts.json) {
      console.log(JSON.stringify({ totalMb: total, ceilingMb: ceiling, over, processes: rows, agentGroups: groups }, null, 2));
    } else if (opts.total) {
      console.log(`${total} MB of ${ceiling} MB`);
    } else {
      for (const r of rows) console.log(`${String(r.pid).padStart(7)}  ${String(r.mb).padStart(7)} MB  ${r.kind.padEnd(5)}  ${r.command.slice(0, 100)}`);
      console.log(`${rows.length} process(es), ${total} MB of ${ceiling} MB`);
      if (groups.length) console.log('  agent process groups:');
      else console.log('  no codeloop agent processes running');
      for (const p of groups) console.log(`  ${String(p.pid).padEnd(7)} ${p.orphan ? 'orphan ' : `parent ${p.parent}`}  ${p.purpose}  since ${p.at}`);
    }
    if (over) {
      if (!opts.json) console.error(chalk.red(`over limits.max_memory_mb (${ceiling})`));
      process.exitCode = 1;
    }
  }));

export const agentCommand = new Command('agent').description('The agents codeloop starts');

agentCommand
  .command('clear <name>')
  .description('Say an agent marked unavailable can run again (after it exited at once twice with nothing handed back)')
  .action(guard(async (name: string) => {
    const was = await createLocalClient().agents.clear(name);
    console.log(was ? `  ${name} is available again` : `  ${name} was not marked unavailable`);
  }));
