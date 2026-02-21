import { Command } from 'commander';
import chalk from 'chalk';
import { uninstallSkill } from '../registry/installer.js';
import { loadLockfile } from '../registry/lockfile.js';

export const removeCommand = new Command('remove')
  .description('Uninstall a skill')
  .argument('<name>', 'Skill name to remove')
  .action((name: string) => {
    const projectDir = process.cwd();

    console.log();

    // Check if installed
    const lockfile = loadLockfile(projectDir);
    if (!lockfile.installed[name]) {
      console.log(chalk.yellow(`  "${name}" is not in the lockfile.`));
      console.log(chalk.dim('  Note: built-in skills managed by codeloop init/update are not tracked in the lockfile.'));
      console.log();
      return;
    }

    const result = uninstallSkill(projectDir, name);

    if (!result.success) {
      console.log(chalk.red(`  Failed to remove "${name}"`));
      console.log();
      return;
    }

    console.log(chalk.green(`  Removed ${name}`));
    for (const file of result.removed) {
      console.log(chalk.dim(`    ✗ ${file}`));
    }
    console.log();
  });
