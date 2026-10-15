#!/usr/bin/env node

import { lazyProgram } from './lazy.js';

// Bare `codeloop`: what it is and the one command to run, instead of the full command list.
if (process.argv.length <= 2) {
  console.log('codeloop turns a problem into stories and works them through checked stages, with you approving at gates.');
  console.log('');
  console.log('  In a project, first run:   codeloop init');
  console.log('  Then open the board:       codeloop serve');
  console.log('');
  console.log('Every command: codeloop --help');
  process.exit(0);
}

// `skill` is added here because program.ts is edited by other work in parallel; the lazy path
// loads it by name, the full program gets it below.
const lazy = await lazyProgram(process.argv);
if (lazy) {
  await lazy.parseAsync();
} else {
  const { buildProgram } = await import('./program.js');
  const { skillCommand } = await import('./commands/skill.js');
  const program = buildProgram();
  program.addCommand(skillCommand);
  await program.parseAsync();
}
