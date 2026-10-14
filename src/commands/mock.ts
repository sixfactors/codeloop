import { Command } from 'commander';
import { cleanupMock, newMock, writeMocksIndex } from '../lib/mock.js';
import { guard } from './guard.js';
import { projectRoot } from '../sdk/local.js';

export const mockCommand = new Command('mock').description("A card's mock, built from the shared template so every mock looks like the same product");

mockCommand
  .command('new <card>')
  .description('Create the card\'s mock beside its spec (<spec>/mock.html) from templates/mock/template.html')
  .requiredOption('--topic <topic>', 'Folder the mock is filed under, e.g. exports')
  .option('--from <card-id|latest|none>', 'The mock to build on: a card id, the newest in this topic, or none for the bare template', 'latest')
  .action(guard((card: string, opts: { topic: string; from: string }) => {
    const { path, created, from } = newMock(projectRoot(), card, opts.topic, opts.from);
    console.log(created ? `  created ${path}${from ? ` from ${from}` : ''}` : `  ${path} already exists; left as it is`);
    console.log(path.endsWith('/page.tsx') ? `Next: compose one <section data-screen="..."> per screen from the app's shared components, then \`codeloop check mock ${card}\`.` : `Next: draw one <section data-screen="..."> per screen named in the spec, then \`codeloop check mock ${card}\`.`);
  }));

mockCommand
  .command('cleanup <card>')
  .description("Delete the card's app mock page unless its spec says `mock: keep` (default drop)")
  .action(guard((card: string) => {
    const { path, action } = cleanupMock(projectRoot(), card);
    console.log(action === 'none' ? '  no app mock to clean up' : `  ${action === 'dropped' ? 'deleted' : 'kept'} ${path}`);
  }));

export const mocksCommand = new Command('mocks').description('The mock gallery');

mocksCommand
  .command('index')
  .description('Write .codeloop/mocks/index.html: projects, then topics, then cards, newest first')
  .action(guard(() => {
    const { path, mocks } = writeMocksIndex(projectRoot());
    console.log(`  ${path}: ${mocks} ${mocks === 1 ? 'mock' : 'mocks'}. \`codeloop serve\` shows it at /mocks/.`);
  }));
