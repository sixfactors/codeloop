import { Command } from 'commander';
import { loadAgents, resolveAgent } from '../lib/agent.js';
import { RefusalError } from '../lib/cards.js';
import { clock } from '../lib/clock.js';
import { planRun, runDue, runDueWithAgent } from '../lib/run.js';
import { guard } from './guard.js';

interface RunOptions {
  due?: boolean;
  now?: string;
  json?: boolean;
  agent?: string | boolean;
  dryRun?: boolean;
}

export const runCommand = new Command('run')
  .description('Start cards for due cron lanes, then advance every card that is not waiting for you one step')
  .option('--due', 'Run what is due (the default; kept so older scripts still work)')
  .option('--agent [name]', 'First start a headless agent on each stage whose check does not pass yet (an entry under agents: in config.yaml)')
  .option('--no-agent', 'Only check and advance, even when config.yaml has run.agent: true')
  .option('--dry-run', 'Print what would run; start nothing and change nothing')
  .option('--now <iso>', 'Treat this as the current time')
  .option('--json', 'JSON output')
  .action(guard(async (opts: RunOptions) => {
    const projectDir = process.cwd();
    const now = opts.now ? new Date(opts.now) : clock();
    if (Number.isNaN(now.getTime())) throw new RefusalError(`--now "${opts.now}" is not a date`);
    const wanted = opts.agent ?? loadAgents(projectDir).runByDefault;
    const agent = wanted ? resolveAgent(projectDir, wanted === true ? undefined : wanted) : null;
    if (opts.dryRun) {
      const plan = planRun(projectDir, agent, now);
      plan.forEach(l => console.log(`  ${l}`));
      console.log(`  dry run: nothing was started (${plan.length} ${plan.length === 1 ? 'card' : 'cards'} not waiting for you)`);
      return;
    }
    const result = agent ? await runDueWithAgent(projectDir, agent, now) : runDue(projectDir, now);
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    result.created.forEach(c => console.log(`  created ${c.id} in ${c.lane} (trigger: ${c.trigger})`));
    result.skipped.forEach(s => console.log(`  skipped ${s.lane}: ${s.reason}`));
    result.agents?.forEach(a => console.log(a.started
      ? `  ${a.id}: agent ${a.agent} ran ${a.stage} (${a.exit === 0 ? 'exit 0' : a.exit === null ? 'killed' : `exit ${a.exit}`}, ${Math.round(a.durationMs! / 1000)}s, ${a.log})`
      : `  ${a.id}: agent ${a.agent} not started: ${a.reason}`));
    result.advanced.forEach(a => {
      console.log(`  ${a.id}: ${a.outcome === 'unchanged' ? 'unchanged, waiting for work' : a.outcome === 'parked' ? 'waiting for you' : a.outcome}${a.note ? ` (${a.note})` : ''}`);
      if (a.next) console.log(`    ${a.next}`);
    });
    console.log(`  ${result.created.length} created, ${result.advanced.length} advanced${result.agents ? `, ${result.agents.filter(a => a.started).length} agent runs` : ''}`);
  }));
