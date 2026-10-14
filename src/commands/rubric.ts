import { Command } from 'commander';
import { createLocalClient, projectRoot } from '../sdk/local.js';
import { guard } from './guard.js';

export const rubricCommand = new Command('rubric').description("A stage's rubric: the criteria `codeloop check rubric` judges it by");

rubricCommand
  .command('scaffold <card>')
  .description("Append a `## Rubric` block to the card's stage output with a `- Rn pending:` line for each attest row it has no line for; `check rubric` then reports those rows as pending, not missing")
  .action(guard(async (card: string) => {
    const { path, added } = await createLocalClient(projectRoot()).rubric.scaffold(card);
    if (!path) return console.log(`  ${card}: its stage has no rubric output to scaffold`);
    console.log(added.length ? `  ${path}: added ${added.join(', ')} as pending` : `  ${path}: every rubric row already has a line`);
  }));
