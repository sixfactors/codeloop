import { Command } from 'commander';
import chalk from 'chalk';
import { scanCompetitors } from '../lib/scan.js';
import { guard } from './guard.js';

export const scanCommand = new Command('scan').description('Look outside the repo for what to build next');

scanCommand
  .command('competitors')
  .description("Compare each competitor page's changelog with the last scan and propose one plan card per competitor that shipped something new")
  .option('--from-file <path>', 'Use this file as the changelog text instead of fetching the URL')
  .option('--only <name>', 'Scan one competitor')
  .action(guard(async (opts: { fromFile?: string; only?: string }) => {
    const results = await scanCompetitors(process.cwd(), opts);
    if (results.length === 0) console.log('  no competitor page has a changelog link; `codeloop wiki competitor add <name> --changelog <url>`');
    for (const r of results) {
      const said = r.outcome === 'proposed' ? chalk.green(`proposed ${r.card}; \`codeloop approve ${r.card}\` puts it in the plan lane`)
        : r.outcome === 'already-proposed' ? `already proposed as ${r.card}`
        : r.outcome === 'baseline' ? 'first scan; stored as the baseline'
        : r.outcome === 'skipped' ? chalk.yellow(`skipped: ${r.reason}`)
        : 'nothing new';
      console.log(`  ${r.name}: ${said}`);
    }
    const proposed = results.filter(r => r.outcome === 'proposed').length;
    console.log(`  ${results.length} scanned, ${proposed} proposed, ${results.filter(r => r.outcome === 'skipped').length} skipped`);
  }));
