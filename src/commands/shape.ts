import { Command } from 'commander';
import chalk from 'chalk';
import { createLocalClient } from '../sdk/local.js';
import { guard } from './guard.js';

const client = () => createLocalClient(process.cwd());

export const shapeCommand = new Command('shape')
  .description('Turn a problem into an epic of shippable stories: brief → interview → breakdown → rank, then queued into the build lane')
  .argument('<problem>', 'The problem as the person stated it')
  .option('--as <role>', 'owner | reviewer | agent (default: owner at a terminal, agent otherwise)')
  .action(guard(async (problem: string, opts: { as?: string }) => {
    const { card, hint } = await client().cards.shape(problem, { as: opts.as });
    console.log(`created ${card.id} in ${card.lane} at stage ${card.stage}${card.spec ? ` (${card.spec}/)` : ''}`);
    console.log(chalk.cyan(hint));
  }));
