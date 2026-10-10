import { Command } from 'commander';
import chalk from 'chalk';
import { importBmad, importSpecKit, type ImportResult } from '../lib/import.js';
import { guard } from './guard.js';

function report(result: ImportResult): void {
  result.cards.forEach(c => console.log(`  ${c.id} at ${c.stage}: ${c.title}  ${chalk.dim(c.spec ?? '')}`));
  if (result.flagged.length) {
    console.log(chalk.yellow(`  ${result.flagged.length} tasks have no layer; replace [?] with api, sdk, ui, test or docs:`));
    result.flagged.forEach(f => console.log(chalk.dim(`    ${f.file}: ${f.task}`)));
  }
  console.log(`  imported ${result.cards.length} cards`);
}

export const importCommand = new Command('import').description('Bring existing specs in as cards; source files are only read');

importCommand
  .command('speckit [dir]')
  .description('One card per specs/NNN* feature, tasks rewritten with layer tags')
  .option('--lane <id>', 'Lane to create cards in', 'build')
  .action(guard((dir: string | undefined, opts: { lane: string }) => report(importSpecKit(process.cwd(), dir ?? '.', opts.lane))));

importCommand
  .command('bmad [dir]')
  .description('One card per story in sprint-status.yaml, status mapped to a stage')
  .option('--lane <id>', 'Lane to create cards in', 'build')
  .action(guard((dir: string | undefined, opts: { lane: string }) => report(importBmad(process.cwd(), dir ?? '.', opts.lane))));
