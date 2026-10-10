import { Command } from 'commander';
import chalk from 'chalk';
import { createLocalClient } from '../sdk/local.js';
import { guard } from './guard.js';

const client = () => createLocalClient(process.cwd());

export const epicCommand = new Command('epic').description('Epics: outcomes that take several features');

epicCommand
  .command('new <slug>')
  .description('Create .codeloop/wiki/epics/<slug>.md')
  .requiredOption('--title <title>', 'The outcome, phrased as what becomes true')
  .requiredOption('--initiative <slug>', 'The initiative it serves')
  .option('--status <status>', 'planned, active, done', 'planned')
  .option('--goal <goal>', 'The target and when')
  .option('--body <text>', 'A line or two on the outcome')
  .action(guard(async (slug: string, opts: { title: string; initiative: string; status?: string; goal?: string; body?: string }) => {
    const epic = await client().epics.new({ id: slug, title: opts.title, initiative: opts.initiative, status: opts.status, goal: opts.goal, body: opts.body });
    console.log(`created epic ${epic.id} under ${epic.initiative}`);
  }));

epicCommand
  .command('list')
  .description('Every epic with its score: the sum of its features')
  .option('--json', 'JSON output')
  .option('--initiative <slug>')
  .action(guard(async (opts: { json?: boolean; initiative?: string }) => {
    const epics = (await client().epics.list()).filter(e => !opts.initiative || e.initiative === opts.initiative).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    if (opts.json) console.log(JSON.stringify(epics, null, 2));
    else if (!epics.length) console.log('  no epics');
    else epics.forEach(e => console.log(`  ${String(e.score).padStart(7)}  ${e.id.padEnd(24)} ${e.title}  ${chalk.dim(`${e.initiative}${e.goal ? `  goal ${e.goal}` : ''}`)}`));
  }));
