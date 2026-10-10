import { Command } from 'commander';
import { loadAgents, resolveAgent } from '../lib/agent.js';
import { RefusalError } from '../lib/cards.js';
import { everyToCron, installSchedule, removeSchedule, RUN_LOG, scheduleLine, scheduleStatus } from '../lib/schedule.js';
import { guard } from './guard.js';

// CODELOOP_CRONTAB names a stand-in for crontab(1), so tests never touch the real table.
const crontab = () => process.env.CODELOOP_CRONTAB || 'crontab';

export const scheduleCommand = new Command('schedule').description('Run `codeloop run --agent` in this repo on a schedule, from your crontab');

scheduleCommand
  .command('install')
  .description('Add (or replace) this repo\'s crontab entry')
  .option('--every <interval>', '5m, 10m, 15m, 20m, 30m, 1h, 2h, 3h, 4h, 6h, 12h or 24h', '30m')
  .option('--cron <expr>', 'A five-field cron expression, in place of --every')
  .option('--agent <name>', 'Agent to run (default: agents.default)')
  .option('--print', 'Print the crontab line and change nothing')
  .action(guard((opts: { every: string; cron?: string; agent?: string; print?: boolean }) => {
    const projectDir = process.cwd();
    const configured = Object.keys(loadAgents(projectDir).agents).length > 0;
    if (opts.agent || configured) resolveAgent(projectDir, opts.agent);
    const line = scheduleLine(projectDir, { cron: opts.cron ?? everyToCron(opts.every), agent: opts.agent ?? (configured || undefined) });
    if (opts.print) {
      console.log(line);
      return;
    }
    installSchedule(projectDir, line, crontab());
    console.log(`  installed: ${line}`);
    if (!configured) console.log('  no agent is configured, so the schedule only checks and advances cards; add `agents:` to .codeloop/config.yaml and install again');
    console.log(`  output goes to ${RUN_LOG}; \`codeloop schedule status\` shows the last run`);
  }));

scheduleCommand
  .command('remove')
  .description('Remove this repo\'s crontab entry')
  .action(guard(() => {
    if (!removeSchedule(process.cwd(), crontab())) throw new RefusalError('no schedule is installed for this repo');
    console.log('  removed');
  }));

scheduleCommand
  .command('status')
  .description('Show the installed entry and the end of the last run\'s output')
  .action(guard(() => {
    const status = scheduleStatus(process.cwd(), crontab());
    console.log(status.line ? `  installed: ${status.line}` : '  not installed (`codeloop schedule install`)');
    if (status.lastRun) console.log(`  last output ${status.lastRun.toISOString()} in ${RUN_LOG}:\n${status.lastOutput!.split('\n').map(l => `    ${l}`).join('\n')}`);
    else console.log(`  no run has written ${RUN_LOG} yet`);
  }));
