#!/usr/bin/env node

import { skillCommand } from './commands/skill.js';
import { buildProgram } from './program.js';

// Registered here rather than in program.ts: `codeloop skill eval` is new and program.ts is
// being edited by other work in parallel. addCommand before parse puts it in the same tree
// `--help` and the subcommand dispatch walk.
const program = buildProgram();
program.addCommand(skillCommand);
program.parse();
