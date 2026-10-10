import { Command } from 'commander';
import chalk from 'chalk';
import { DONE, type FeatureNode, type StoryRow } from '../sdk/index.js';
import { createLocalClient } from '../sdk/local.js';
import { guard, refuse } from './guard.js';

const client = () => createLocalClient(process.cwd());

const story = (s: StoryRow) => {
  const state = s.gate ? chalk.yellow(`waiting: ${s.gate}`) : s.stage === DONE ? chalk.green('done') : s.stage;
  return `      ${s.id}  ${s.title}  ${chalk.dim(state)}`;
};

function feature(f: FeatureNode, indent: string): string[] {
  const score = f.score === undefined ? 'unscored' : String(f.score);
  return [`${indent}${chalk.bold(f.band)} ${score.padStart(6)}  ${f.id}  ${f.title}  ${chalk.dim(`${f.done}/${f.total} done`)}`, ...f.stories.map(story)];
}

export const initiativeCommand = new Command('initiative').description('Initiatives: the goals the roadmap rolls up to');

initiativeCommand
  .command('list')
  .description('Every initiative with its score: the sum of its features')
  .option('--json', 'JSON output')
  .action(guard(async (opts: { json?: boolean }) => {
    const initiatives = (await client().initiatives()).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    if (opts.json) console.log(JSON.stringify(initiatives, null, 2));
    else initiatives.forEach(i => console.log(`  ${String(i.score).padStart(7)}  ${i.id.padEnd(40)} ${i.title}`));
  }));

initiativeCommand
  .command('tree <slug>')
  .description('initiative › epics › features › stories, with scores and bands')
  .option('--json', 'JSON output')
  .action(guard(async (slug: string, opts: { json?: boolean }) => {
    const tree = await client().initiativeTree(slug);
    if (!tree) throw refuse(`initiative "${slug}" not found`);
    if (opts.json) {
      console.log(JSON.stringify({ initiative: tree }, null, 2));
      return;
    }
    console.log(`${chalk.bold(tree.title)}  ${chalk.dim(`${tree.id}  score ${tree.score}`)}`);
    for (const epic of tree.epics) {
      console.log(`  ${chalk.bold(epic.title)}  ${chalk.dim(`epic ${epic.id}  score ${epic.score}`)}`);
      for (const f of epic.features) feature(f, '    ').forEach(l => console.log(l));
    }
    for (const f of tree.features) feature(f, '  ').forEach(l => console.log(l));
  }));
