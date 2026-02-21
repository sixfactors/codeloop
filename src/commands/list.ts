import { Command } from 'commander';
import chalk from 'chalk';
import { loadLockfile } from '../registry/lockfile.js';

export const listCommand = new Command('list')
  .description('Show installed skills')
  .action(() => {
    const projectDir = process.cwd();
    const lockfile = loadLockfile(projectDir);

    console.log();

    const names = Object.keys(lockfile.installed);
    if (names.length === 0) {
      console.log(chalk.dim('  No skills installed via registry.'));
      console.log(chalk.dim('  Built-in skills are managed by `codeloop init` and `codeloop update`.'));
      console.log();
      return;
    }

    console.log(chalk.bold('  Installed Skills'));
    console.log();

    for (const name of names.sort()) {
      const entry = lockfile.installed[name];
      const tierBadge = entry.tier === 'trusted'
        ? chalk.green('trusted')
        : entry.tier === 'community'
          ? chalk.cyan('community')
          : chalk.yellow('unreviewed');

      console.log(`  ${chalk.bold(name)} ${chalk.dim(`v${entry.version}`)} ${tierBadge}`);
      console.log(`  ${chalk.dim(`source: ${entry.source}`)}`);
      console.log(`  ${chalk.dim(`installed: ${entry.installed}`)}`);
      for (const file of entry.files) {
        console.log(`  ${chalk.dim(`  → ${file}`)}`);
      }
      console.log();
    }
  });
