#!/usr/bin/env node

import { skillCommand } from './commands/skill.js';
import { buildProgram } from './program.js';

// Registered here rather than in program.ts: `codeloop skill eval` is new and program.ts is
// being edited by other work in parallel. addCommand before parse puts it in the same tree
// `--help` and the subcommand dispatch walk.
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

const program = buildProgram();
program.addCommand(skillCommand);
program.parse();
