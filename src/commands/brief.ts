import { Command } from 'commander';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { buildBrief } from '../lib/agent.js';
import { findCard, readCards } from '../lib/cards.js';
import { guard } from './guard.js';

export const briefCommand = new Command('brief')
  .description("Print what an agent is given to do a card's current stage: skill, output, check, feedback, wiki pages, rules")
  .argument('<card>')
  .option('--out <file>', 'Write the brief to a file')
  .action(guard((id: string, opts: { out?: string }) => {
    const projectDir = process.cwd();
    const brief = buildBrief(projectDir, findCard(readCards(projectDir).cards, id));
    if (!opts.out) {
      process.stdout.write(brief);
      return;
    }
    mkdirSync(dirname(resolve(opts.out)), { recursive: true });
    writeFileSync(opts.out, brief);
    console.log(`  wrote ${opts.out}`);
  }));
