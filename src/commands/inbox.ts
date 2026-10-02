import { Command } from 'commander';
import chalk from 'chalk';
import { buildInbox, markInboxSeen } from '../lib/inbox.js';
import { guard } from './guard.js';

export const inboxCommand = new Command('inbox')
  .description('What needs you, what shipped, and the numbers per lane')
  .option('--json', 'JSON output')
  .option('--seen', 'Mark everything shipped so far as seen')
  .action(guard((opts: { json?: boolean; seen?: boolean }) => {
    const projectDir = process.cwd();
    const inbox = buildInbox(projectDir);
    if (opts.json) {
      console.log(JSON.stringify(inbox, null, 2));
    } else {
      console.log(inbox.summary);
      console.log();
      console.log(chalk.bold(`Waiting for you (${inbox.needs_you.length + inbox.needs_merge.length})`));
      for (const c of inbox.needs_you) {
        console.log(`  ${c.id}  ${c.title}: ${c.lane}/${c.stage}, gate ${chalk.yellow(c.gate)}`);
        if (c.gate === 'proposal') {
          console.log(chalk.dim(`        proposed${c.source ? ` from ${c.source}` : ''}; \`codeloop card show ${c.id}\` has the detail`));
          console.log(chalk.dim(`        codeloop approve ${c.id}   puts it in the ${c.lane} lane   or   codeloop reject ${c.id} "<why not>"   drops it`));
          continue;
        }
        console.log(chalk.dim(`        read: ${c.read ?? 'nothing written for this stage'}   last check: ${c.last_check}`));
        if (c.mock) console.log(chalk.dim(`        mock: ${c.mock}`));
        console.log(chalk.dim(`        codeloop approve ${c.id}   or   codeloop reject ${c.id} "<what to change>"`));
      }
      for (const m of inbox.needs_merge) {
        console.log(`  wiki  ${m.path}: changed here and in the cloud`);
        console.log(chalk.dim(`        merge ${m.cloud} into it, then delete that file; the next command pushes your merge`));
      }
      console.log(chalk.bold(`Shipped (${inbox.shipped.length})`));
      for (const c of inbox.shipped) console.log(`  ${c.id}  ${c.lane}  ${chalk.dim(c.title)}`);
      console.log(chalk.bold('Numbers'));
      const pct = (n: number | null) => (n === null ? '-' : `${Math.round(n * 100)}%`);
      for (const n of inbox.numbers) {
        const turns = n.human_turns_per_card === null ? '-' : n.human_turns_per_card.toFixed(1);
        console.log(`  ${n.lane.padEnd(10)} active ${n.active}  waiting ${n.parked}  done ${n.done}  human turns/card ${turns}  first pass ${pct(n.first_pass_rate)}`);
      }
    }
    if (opts.seen) markInboxSeen(projectDir);
  }));
