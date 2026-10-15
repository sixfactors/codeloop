import { Command } from 'commander';
import { createLocalClient } from '../sdk/local.js';
import { guard } from './guard.js';

export const psCommand = new Command('ps')
  .description('The agent and builder processes codeloop started in this project, their purpose and whether their parent is gone')
  .option('--kill-orphans', 'Kill each process group whose parent codeloop process has exited; a live parent is never touched')
  .option('--json', 'JSON output')
  .action(guard(async (opts: { killOrphans?: boolean; json?: boolean }) => {
    const client = createLocalClient();
    if (opts.killOrphans) {
      const killed = await client.procs.killOrphans();
      console.log(killed.length ? `  killed ${killed.length} orphaned process group(s): ${killed.join(', ')}` : '  no orphaned processes');
      return;
    }
    const rows = (await client.procs.list()).filter(p => p.alive);
    if (opts.json) return console.log(JSON.stringify(rows, null, 2));
    if (!rows.length) return console.log('  no codeloop child processes running');
    for (const p of rows) console.log(`  ${String(p.pid).padEnd(7)} ${p.orphan ? 'orphan ' : `parent ${p.parent}`}  ${p.purpose}  since ${p.at}`);
  }));

export const agentCommand = new Command('agent').description('The agents codeloop starts');

agentCommand
  .command('clear <name>')
  .description('Say an agent marked unavailable can run again (after it exited at once twice with nothing handed back)')
  .action(guard(async (name: string) => {
    const was = await createLocalClient().agents.clear(name);
    console.log(was ? `  ${name} is available again` : `  ${name} was not marked unavailable`);
  }));
