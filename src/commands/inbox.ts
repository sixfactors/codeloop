import { Command } from 'commander';
import chalk from 'chalk';
import { createLocalClient, projectRoot } from '../sdk/local.js';
import { guard, refuse } from './guard.js';

export const inboxCommand = new Command('inbox')
  .description('What needs you, what shipped, and the numbers per lane')
  .option('--json', 'JSON output')
  .option('--seen', 'Mark everything shipped so far as seen')
  .option('--by <order>', 'score (highest RICE first, then oldest) or age (oldest first)', 'score')
  .action(guard(async (opts: { json?: boolean; seen?: boolean; by: string }) => {
    if (opts.by !== 'score' && opts.by !== 'age') throw refuse(`--by "${opts.by}" is not score or age`);
    const client = createLocalClient(projectRoot());
    const inbox = await client.inbox.report({ sort: opts.by });
    if (opts.json) {
      console.log(JSON.stringify(inbox, null, 2));
    } else {
      console.log(inbox.summary);
      console.log();
      console.log(chalk.bold(`Waiting for you (${inbox.needs_you.length + inbox.needs_merge.length})`));
      for (const c of inbox.needs_you) {
        // The band rides along only when the card has a score: an unscored board reads as it always did.
        console.log(`  ${c.id}  ${c.title}: ${c.lane}/${c.stage}, gate ${chalk.yellow(c.gate)}${c.score === undefined ? '' : `  ${chalk.dim(`${c.band} ${c.score}`)}`}`);
        console.log(chalk.dim(`        read: ${c.read ?? 'nothing written for this stage'}   last check: ${c.last_check}`));
        if (c.mock) console.log(chalk.dim(`        mock: ${c.mock}`));
        console.log(chalk.dim(`        codeloop approve ${c.id}   or   codeloop reject ${c.id} "<what to change>"`));
      }
      for (const m of inbox.needs_merge) {
        console.log(`  wiki  ${m.path}: changed here and in the cloud`);
        console.log(chalk.dim(`        merge ${m.cloud} into it, then delete that file; the next command pushes your merge`));
      }
      if (inbox.failing.length) {
        console.log(chalk.bold(`Failing checks (${inbox.failing.length})`));
        for (const c of inbox.failing) {
          console.log(`  ${c.id}  ${c.title}: ${c.lane}/${c.stage}, ${c.retries} fail${c.retries === 1 ? '' : 's'}`);
          console.log(chalk.dim(`        last check: ${c.last_check}`));
          console.log(chalk.dim(`        fix the work, then \`codeloop next ${c.id}\``));
        }
      }
      if (inbox.backlog.count) {
        console.log(chalk.bold(`Backlog (${inbox.backlog.count})`));
        const oldest = inbox.backlog.oldest;
        if (oldest) {
          console.log(chalk.dim(`        oldest ${oldest.id}  ${oldest.title}`));
          console.log(chalk.dim(`        \`codeloop approve ${oldest.id}\` promotes it, or review on the board backlog`));
        }
      }
      if (inbox.questions.length) {
        console.log(chalk.bold(`Questions for you (${inbox.questions.length})`));
        for (const q of inbox.questions) {
          console.log(`  ${q.id}  ${q.title}: ${q.open} open, first: ${q.first}`);
          console.log(chalk.dim(`        codeloop answer ${q.id} <n> "<text>"   or   codeloop answer ${q.id} <n> --accept`));
        }
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
    if (opts.seen) await client.inbox.markSeen();
  }));
