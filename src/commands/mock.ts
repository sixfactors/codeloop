import { Command } from 'commander';
import { newMock, writeMocksIndex } from '../lib/mock.js';
import { guard } from './guard.js';

export const mockCommand = new Command('mock').description("A card's mock, built from the shared template so every mock looks like the same product");

mockCommand
  .command('new <card>')
  .description('Create docs/mocks/<project>/<topic>/<card-id>.html from templates/mock/template.html')
  .requiredOption('--topic <topic>', 'Folder the mock is filed under, e.g. exports')
  .option('--from <card-id|latest|none>', 'The mock to build on: a card id, the newest in this topic, or none for the bare template', 'latest')
  .action(guard((card: string, opts: { topic: string; from: string }) => {
    const { path, created, from } = newMock(process.cwd(), card, opts.topic, opts.from);
    console.log(created ? `  created ${path}${from ? ` from ${from}` : ''}` : `  ${path} already exists; left as it is`);
    console.log(`Next: draw one <section data-screen="..."> per screen named in the spec, then \`codeloop check mock ${card}\`.`);
  }));

export const mocksCommand = new Command('mocks').description('The mock gallery');

mocksCommand
  .command('index')
  .description('Write docs/mocks/index.html: projects, then topics, then cards, newest first')
  .action(guard(() => {
    const { path, mocks } = writeMocksIndex(process.cwd());
    console.log(`  ${path}: ${mocks} ${mocks === 1 ? 'mock' : 'mocks'}. \`codeloop serve\` shows it at /mocks/.`);
  }));
