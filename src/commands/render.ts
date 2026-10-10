import { existsSync } from 'fs';
import { join } from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from '../lib/config.js';
import { RefusalError } from '../lib/engine.js';
import { gateApproval } from '../lib/flow.js';
import { installHostHooks } from '../lib/host-hooks.js';
import { serveMcp } from '../lib/mcp.js';
import { HOSTS, render, type Host } from '../lib/render.js';
import { guard } from './guard.js';

export const renderCommand = new Command('render')
  .description('Write each lane stage as an agent, rule or skill for Claude, Cursor and Codex, plus the standing protocol block and, with --hooks, the hooks that enforce it')
  .option('--host <host>', 'claude | cursor | codex | all; by default the hosts init set up (.claude, .cursor, .agents present), or all when none is', 'auto')
  .option('--hooks', 'Also install the Claude Code and Cursor hooks and the pre-commit/pre-push git guards (same as `codeloop init --hooks`)', false)
  .action(guard((opts: { host: string; hooks?: boolean }) => {
    if (opts.host !== 'all' && opts.host !== 'auto' && !HOSTS.includes(opts.host as Host)) throw new RefusalError(`unknown host "${opts.host}" (claude, cursor, codex or all)`);
    const markers: Record<Host, string> = { claude: '.claude', cursor: '.cursor', codex: '.agents' };
    const present = HOSTS.filter(h => existsSync(join(process.cwd(), markers[h])));
    const hosts = opts.host === 'all' ? HOSTS : opts.host === 'auto' ? (present.length ? present : HOSTS) : [opts.host as Host];
    const result = render(process.cwd(), hosts);
    result.written.forEach(f => console.log(chalk.green(`  + ${f}`)));
    console.log(`  ${result.written.length} written, ${result.unchanged.length} unchanged`);
    if (opts.hooks) {
      for (const h of installHostHooks(process.cwd())) {
        console.log(h.installed ? chalk.green(`  + ${h.name}${h.reason === 'unchanged' ? ' (unchanged)' : ''}`) : chalk.yellow(`  ~ ${h.name}: ${h.reason}`));
      }
    }
  }));

export const mcpCommand = new Command('mcp')
  .description('Serve the card engine over MCP on stdio (tools: inbox, next_up, get_card, advance, approve, reject, task_done, wiki_inject, wiki_capture)')
  .action(async () => {
    await serveMcp(process.cwd());
  });

export const gateCommand = new Command('gate').description('Gate checks for CI');

gateCommand
  .command('check <id>')
  .description('Exit 2 unless the card has an approval for the named gate')
  .requiredOption('--require <gate>', 'Gate name, e.g. local')
  .action(guard((id: string, opts: { require: string }) => {
    const approval = gateApproval(process.cwd(), id, opts.require);
    console.log(`  gate ${opts.require} approved by ${approval.actor} at ${approval.at}`);
    if (!approval.authenticated) {
      console.log(chalk.yellow('  warning: this approval is a local event. Local roles are not authenticated, so it shows that someone ran the approve command, not who.'));
    }
  }));

export const configCommand = new Command('config').description('Read .codeloop/config.yaml, with .codeloop/local.yaml laid over it');

configCommand
  .command('get <path>')
  .description('Print one value by dotted path (empty when unset), for use in CI scripts')
  .action(guard((path: string) => {
    let value: unknown = loadConfig(process.cwd());
    for (const key of path.split('.')) value = (value as Record<string, unknown> | undefined)?.[key];
    if (value !== undefined && value !== null) console.log(typeof value === 'string' ? value : JSON.stringify(value));
  }));
