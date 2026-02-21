#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { updateCommand } from './commands/update.js';
import { statusCommand } from './commands/status.js';
import { serveCommand } from './commands/serve.js';
import { watchCommand } from './commands/watch.js';
import { installCommand } from './commands/install.js';
import { searchCommand } from './commands/search.js';
import { listCommand } from './commands/list.js';
import { removeCommand } from './commands/remove.js';
import { publishCommand } from './commands/publish.js';
import { loginCommand } from './commands/login.js';

const program = new Command();

program
  .name('codeloop')
  .description('Self-improving development workflow for AI coding agents')
  .version('0.2.0');

// Project management
program.addCommand(initCommand);
program.addCommand(updateCommand);
program.addCommand(statusCommand);
program.addCommand(serveCommand);
program.addCommand(watchCommand);

// Skill registry
program.addCommand(installCommand);
program.addCommand(searchCommand);
program.addCommand(listCommand);
program.addCommand(removeCommand);
program.addCommand(publishCommand);
program.addCommand(loginCommand);

program.parse();
