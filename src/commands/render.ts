import { existsSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';
import { Command } from 'commander';
import chalk from 'chalk';
import { readBoardAuth, writeBoardAuth } from '../lib/auth.js';
import { loadConfig } from '../lib/config.js';
import { RefusalError } from '../lib/engine.js';
import { gateApproval } from '../lib/flow.js';
import { installHostHooks } from '../lib/host-hooks.js';
import { serveMcp } from '../lib/mcp.js';
import { HOSTS, render, type Host } from '../lib/render.js';
import { guard } from './guard.js';
import { projectRoot } from '../sdk/local.js';

export const renderCommand = new Command('render')
  .description('Write each lane stage as an agent, rule or skill for Claude, Cursor and Codex, plus the standing protocol block and, with --hooks, the hooks that enforce it')
  .option('--host <host>', 'claude | cursor | codex | all; by default the hosts init set up (.claude, .cursor, .agents present), or all when none is', 'auto')
  .option('--hooks', 'Also install the Claude Code and Cursor hooks and the pre-commit/pre-push git guards (same as `codeloop init --hooks`)', false)
  .option('--force', 'Replace role, rule and skill files edited by hand since the last render', false)
  .action(guard((opts: { host: string; hooks?: boolean; force?: boolean }) => {
    if (opts.host !== 'all' && opts.host !== 'auto' && !HOSTS.includes(opts.host as Host)) throw new RefusalError(`unknown host "${opts.host}" (claude, cursor, codex or all)`);
    const markers: Record<Host, string> = { claude: '.claude', cursor: '.cursor', codex: '.agents' };
    const present = HOSTS.filter(h => existsSync(join(projectRoot(), markers[h])));
    const hosts = opts.host === 'all' ? HOSTS : opts.host === 'auto' ? (present.length ? present : HOSTS) : [opts.host as Host];
    const result = render(projectRoot(), hosts, { force: opts.force });
    result.written.forEach(f => console.log(chalk.green(`  + ${f}`)));
    result.kept.forEach(f => console.log(chalk.yellow(`  ~ ${f}: edited by hand since the last render, kept (--force replaces it)`)));
    console.log(`  ${result.written.length} written, ${result.unchanged.length} unchanged${result.kept.length ? `, ${result.kept.length} kept` : ''}`);
    if (opts.hooks) {
      for (const h of installHostHooks(projectRoot())) {
        console.log(h.installed ? chalk.green(`  + ${h.name}${h.reason === 'unchanged' ? ' (unchanged)' : ''}`) : chalk.yellow(`  ~ ${h.name}: ${h.reason}`));
      }
    }
  }));

export const mcpCommand = new Command('mcp')
  .description('Serve the card engine over MCP on stdio (tools: inbox, next_up, get_card, advance, approve, reject, task_done, wiki_inject, wiki_capture)')
  .action(async () => {
    await serveMcp(projectRoot());
  });

export const gateCommand = new Command('gate').description('Gate checks for CI');

gateCommand
  .command('check <id>')
  .description('Exit 2 unless the card has an approval for the named gate')
  .requiredOption('--require <gate>', 'Gate name, e.g. local')
  .action(guard((id: string, opts: { require: string }) => {
    const approval = gateApproval(projectRoot(), id, opts.require);
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
    let value: unknown = loadConfig(projectRoot());
    for (const key of path.split('.')) value = (value as Record<string, unknown> | undefined)?.[key];
    if (value !== undefined && value !== null) console.log(typeof value === 'string' ? value : JSON.stringify(value));
  }));

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer); }));
}

configCommand
  .command('board-password')
  .description('Set the board sign-in user and password (.codeloop/local.yaml); refuses a non-loopback `codeloop serve` while the default is still in use')
  .option('--user <name>', 'Sign-in username; unchanged if not given')
  .action(guard(async (opts: { user?: string }) => {
    const projectDir = projectRoot();
    const current = readBoardAuth(projectDir);
    console.log(chalk.dim(`  current user: ${current.user}${current.isDefault ? ' (default password still in use)' : ''}`));
    const password = await prompt('New board password: ');
    if (!password.trim()) throw new RefusalError('a password is required');
    const confirm = await prompt('Confirm: ');
    if (confirm !== password) throw new RefusalError('passwords did not match');
    const written = writeBoardAuth(projectDir, { user: opts.user, password });
    console.log(chalk.green(`  board sign-in set: user ${written.user}, password changed`));
  }));
