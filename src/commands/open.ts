import { Command } from 'commander';
import chalk from 'chalk';
import { findProjectRoot, openUrl, readServeState, serveStateAlive, serveUrl } from '../lib/serve-state.js';
import { registerProject } from '../lib/hub-registry.js';
import { hubStateAlive, hubUrl, readHubState } from '../lib/hub-state.js';
import { DEFAULT_HUB_PORT, ensureHubRunning } from './hub.js';

export const openCommand = new Command('open')
  .description('Open the board already running for this project')
  .option('--standalone', 'Open this project\'s own single-process server instead of its page on the hub')
  .action(async (options: { standalone?: boolean }) => {
    const projectDir = findProjectRoot(process.cwd());
    if (!projectDir) {
      console.log(chalk.red('  No .codeloop folder here or in a parent directory. Run `codeloop init` first.'));
      process.exit(1);
    }

    // A standalone server already running for this project is the board the person started here,
    // so it wins over the hub; the hub is the default only when nothing of this project's own runs.
    const standalone = readServeState(projectDir);
    const standaloneUp = standalone ? await serveStateAlive(standalone) : false;

    if (!options.standalone && !standaloneUp) {
      const project = registerProject(projectDir);
      const running = readHubState();
      // Unlike `serve`, `open` never starts work: a hub already up is reused and registration is
      // free, but a cold hub is told to start (`ensureHubRunning` still only forks one if none
      // answers) rather than left for the person to discover a dead link.
      let state;
      try {
        state = running && (await hubStateAlive(running)) ? running : await ensureHubRunning(DEFAULT_HUB_PORT);
      } catch (e) {
        console.log(chalk.red(`  Could not reach or start the hub: ${(e as Error).message}`));
        process.exit(1);
      }
      const url = `${hubUrl(state)}/p/${project.id}/`;
      openUrl(url);
      console.log(chalk.bold(`  ${chalk.cyan(url)}`));
      // The liveness check above leaves a keep-alive socket pooled; without an explicit exit the
      // process waits for undici to close it instead of returning control to the terminal.
      process.exit(0);
    }

    const state = standalone;
    if (!state || !standaloneUp) {
      console.log(chalk.red('  No standalone board is running for this project.'));
      console.log(`  Start one: ${chalk.cyan('codeloop serve --standalone --open')}`);
      process.exit(1);
    }
    const url = serveUrl(state);
    openUrl(url);
    console.log(chalk.bold(`  ${chalk.cyan(url)}`));
    console.log(chalk.dim(state.owner ? '  Sign in to answer and approve.' : '  Read-only for cards.'));
    process.exit(0);
  });
