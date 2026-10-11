import { Command } from 'commander';
import chalk from 'chalk';
import { findProjectRoot, openUrl, readServeState, serveStateAlive, serveUrl } from '../lib/serve-state.js';

export const openCommand = new Command('open')
  .description('Open the board already running for this project')
  .action(async () => {
    const projectDir = findProjectRoot(process.cwd());
    if (!projectDir) {
      console.log(chalk.red('  No .codeloop folder here or in a parent directory. Run `codeloop init` first.'));
      process.exit(1);
    }
    const state = readServeState(projectDir);
    if (!state || !(await serveStateAlive(state))) {
      console.log(chalk.red('  No board is running for this project.'));
      console.log(`  Start one: ${chalk.cyan('codeloop serve --open')}`);
      process.exit(1);
    }
    const url = serveUrl(state);
    openUrl(url);
    console.log(chalk.bold(`  ${chalk.cyan(url)}`));
    console.log(chalk.dim(state.owner ? '  Sign in to answer and approve.' : '  Read-only for cards.'));
  });
