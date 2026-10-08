import { Command } from 'commander';
import chalk from 'chalk';
import { addCompetitor, listCompetitors } from '../lib/competitors.js';
import { capture, learn, type Kind } from '../lib/wiki.js';
import { type WikiEntry } from '../sdk/index.js';
import { createLocalClient } from '../sdk/local.js';
import { guard } from './guard.js';

const client = () => createLocalClient(process.cwd());

const row = (p: WikiEntry) => `  ${p.severity === 'critical' ? chalk.red('critical') : 'warning '} freq ${String(p.freq).padEnd(3)} ${p.title}  ${chalk.dim(p.path)}`;

export const wikiCommand = new Command('wiki').description('Gotchas, decisions and concepts that agents read before a stage and write after it');

wikiCommand
  .command('capture')
  .description('Write a page; capturing an existing title raises its frequency')
  .requiredOption('--title <title>', 'Page title')
  .option('--scope <glob...>', 'File globs the page applies to', [])
  .option('--body <text>', 'Page body', '')
  .option('--kind <kind>', 'gotcha | decision | concept', 'gotcha')
  .option('--card <id>', 'Card this came from')
  .action(guard((opts: { title: string; scope: string[]; body: string; kind: Kind; card?: string }) => {
    console.log(row(capture(process.cwd(), opts)));
  }));

wikiCommand
  .command('inject')
  .description('Print the pages whose scope matches the given files')
  .requiredOption('--files <path...>', 'Changed or soon-to-change files')
  .option('--json', 'JSON output')
  .action(guard(async (opts: { files: string[]; json?: boolean }) => {
    const pages = await client().wiki.inject(opts.files);
    if (opts.json) {
      console.log(JSON.stringify(pages, null, 2));
      return;
    }
    for (const p of pages) console.log(`## ${p.title} (${p.kind}, freq ${p.freq}, ${p.severity})\n\n${p.body}\n`);
    if (pages.length === 0) console.log('  no wiki pages apply to these files');
  }));

wikiCommand
  .command('list')
  .description('List pages')
  .action(guard(async () => {
    const pages = await client().wiki.entries();
    if (pages.length === 0) console.log('  no wiki pages');
    pages.forEach(p => console.log(row(p)));
  }));

wikiCommand
  .command('lint')
  .description('Report broken links (exit 1), stale pages and duplicate titles')
  .action(guard(async () => {
    const { broken, stale, duplicates } = await client().wiki.lint();
    broken.forEach(b => console.error(chalk.red(`  broken: ${b}`)));
    stale.forEach(s => console.log(chalk.yellow(`  stale: ${s}`)));
    duplicates.forEach(d => console.log(chalk.yellow(`  duplicate: ${d}`)));
    if (broken.length) process.exit(1);
    console.log(`  wiki ok${stale.length + duplicates.length ? ` (${stale.length} stale, ${duplicates.length} duplicate)` : ''}`);
  }));

const competitorCommand = wikiCommand.command('competitor').description('One wiki page per competitor: links at the top, findings from each research stage below');

competitorCommand
  .command('add <name>')
  .description('Create .codeloop/wiki/competitors/<name>.md, or update the links of an existing page')
  .option('--docs <url>', 'Where their product docs are')
  .option('--changelog <url>', 'Where they announce what shipped; `codeloop scan competitors` reads it')
  .option('--title <title>', 'Display name (default: the name)')
  .action(guard((name: string, opts: { docs?: string; changelog?: string; title?: string }) => {
    const page = addCompetitor(process.cwd(), { name, ...opts });
    console.log(`  ${page.path}  ${chalk.dim(`docs ${page.docs ?? '-'}  changelog ${page.changelog ?? '-'}`)}`);
  }));

competitorCommand
  .command('list')
  .description('List competitor pages')
  .action(guard(() => {
    const pages = listCompetitors(process.cwd());
    if (pages.length === 0) console.log('  no competitor pages; `codeloop wiki competitor add <name> --docs <url> --changelog <url>`');
    pages.forEach(c => console.log(`  ${c.title.padEnd(16)} ${chalk.dim(c.path)}  changelog ${c.changelog ?? '-'}`));
  }));

export const learnCommand = new Command('learn')
  .description('Apply frequency thresholds: critical at critical_frequency, promoted to rules.md at promote_frequency')
  .action(guard(() => {
    const { critical, promoted } = learn(process.cwd());
    critical.forEach(t => console.log(`  now critical: ${t}`));
    promoted.forEach(t => console.log(`  promoted to .codeloop/rules.md: ${t}`));
    if (critical.length + promoted.length === 0) console.log('  nothing crossed a threshold');
  }));
