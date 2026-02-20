#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { updateCommand } from './commands/update.js';
import { statusCommand } from './commands/status.js';

const program = new Command();

program
  .name('codeloop')
  .description('Self-improving development workflow for AI coding agents')
  .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(updateCommand);
program.addCommand(statusCommand);

program.parse();
