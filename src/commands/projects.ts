import { Command } from 'commander';
import chalk from 'chalk';
import { listProjects, removeProject } from '../lib/hub-registry.js';

export const projectsCommand = new Command('projects').description('The hub\'s registry of known projects');

projectsCommand
  .command('list')
  .description('Every project the hub knows about')
  .action(() => {
    const projects = listProjects();
    console.log();
    if (projects.length === 0) {
      console.log(chalk.dim('  No projects registered yet. `codeloop serve` or `codeloop init` registers the current one.'));
      console.log();
      return;
    }
    console.log(chalk.bold('  Registered projects'));
    console.log();
    for (const p of projects) {
      const badge = p.missing ? chalk.red('missing') : chalk.dim(p.id);
      console.log(`  ${chalk.bold(p.name)} ${badge}`);
      console.log(`  ${chalk.dim(p.path)}`);
      console.log();
    }
  });

projectsCommand
  .command('remove <id>')
  .description('Drop a project from the registry (does not touch its files)')
  .action((id: string) => {
    if (removeProject(id)) {
      console.log(chalk.green(`  Removed "${id}" from the registry.`));
    } else {
      console.log(chalk.red(`  No registered project has id "${id}".`));
      process.exit(1);
    }
  });
