import { Command } from 'commander';
import chalk from 'chalk';
import fse from 'fs-extra';

const { existsSync, readFileSync, copySync } = fse;
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { installMissingLane, laneDrift, templateLaneFiles } from '../lib/lane.js';
import { compareVersions, parseVersion } from '../lib/version.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = join(__dirname, '..', '..');

interface SkillLocation {
  name: string;
  templatePath: string;
  installedPaths: string[];  // Check all possible tool locations
}

const SKILL_NAMES = ['design', 'plan', 'manage', 'test', 'commit', 'qa', 'deploy', 'debug', 'reflect', 'ship'];

const SKILLS: SkillLocation[] = SKILL_NAMES.map(name => ({
  name,
  templatePath: `templates/commands/${name}.md`,
  installedPaths: [
    `.claude/commands/${name}.md`,
    `.cursor/commands/${name}.md`,
    `.agents/skills/${name}/SKILL.md`,
  ],
}));

export const updateCommand = new Command('update')
  .description('Update codeloop skills to latest version')
  .option('--dry-run', 'Show what would change without modifying files')
  .action((options: { dryRun?: boolean }) => {
    const projectDir = process.cwd();
    const dryRun = options.dryRun ?? false;

    console.log();
    console.log(chalk.bold(dryRun ? 'Checking for updates (dry run)...' : 'Updating codeloop skills...'));
    console.log();

    let updated = 0;
    let upToDate = 0;

    for (const skill of SKILLS) {
      const templateFullPath = join(PACKAGE_ROOT, skill.templatePath);
      if (!existsSync(templateFullPath)) continue;

      const templateContent = readFileSync(templateFullPath, 'utf-8');
      const templateVersion = parseVersion(templateContent);

      if (!templateVersion) {
        console.log(chalk.dim(`  ${skill.name}: no version tag in template`));
        continue;
      }

      // Find all installed copies across tools
      const installed = skill.installedPaths
        .map(p => ({ path: p, fullPath: join(projectDir, p) }))
        .filter(({ fullPath }) => existsSync(fullPath));

      if (installed.length === 0) {
        console.log(chalk.dim(`  ${skill.name}: not installed`));
        continue;
      }

      for (const { path, fullPath } of installed) {
        const installedContent = readFileSync(fullPath, 'utf-8');
        const installedVersion = parseVersion(installedContent);
        const toolName = path.startsWith('.claude') ? 'claude' : path.startsWith('.cursor') ? 'cursor' : 'codex';

        if (!installedVersion) {
          console.log(chalk.yellow(`  ${skill.name} (${toolName}): no version tag → ${templateVersion}`));
          if (!dryRun) copySync(templateFullPath, fullPath);
          updated++;
        } else if (compareVersions(installedVersion, templateVersion) < 0) {
          console.log(chalk.yellow(`  ${skill.name} (${toolName}): ${installedVersion} → ${templateVersion}`));
          if (!dryRun) copySync(templateFullPath, fullPath);
          updated++;
        } else {
          console.log(chalk.green(`  ${skill.name} (${toolName}): ${installedVersion}`));
          upToDate++;
        }
      }
    }

    console.log();
    if (dryRun) {
      console.log(chalk.dim(`  ${updated} would be updated, ${upToDate} up to date`));
    } else {
      console.log(`  ${chalk.green(`${updated} updated`)}, ${upToDate} up to date`);
    }

    // Lanes are sacred: never overwrite an installed one. Copy a template that is missing, and
    // name drift so the owner can run `codeloop lane refresh <id>` when they want the template.
    console.log();
    console.log(chalk.bold(dryRun ? 'Lanes (dry run)...' : 'Lanes...'));
    let lanesInstalled = 0;
    for (const file of templateLaneFiles()) {
      if (dryRun) {
        const dest = join(projectDir, '.codeloop/lanes', file);
        if (!existsSync(dest)) {
          console.log(chalk.yellow(`  ${file}: would install`));
          lanesInstalled++;
        }
        continue;
      }
      const dest = installMissingLane(projectDir, file);
      if (dest) {
        console.log(chalk.green(`  ${file}: installed`));
        lanesInstalled++;
      }
    }
    const drift = laneDrift(projectDir).filter(d => d.reason !== 'not installed');
    for (const d of drift) {
      console.log(chalk.yellow(`  ${d.id}: ${d.reason}; \`codeloop lane refresh ${d.id}\` takes the template`));
    }
    if (!lanesInstalled && !drift.length) console.log(chalk.dim('  lanes match the templates that are installed'));

    // The design system is the project's to change: copy the default only where it is missing.
    for (const f of ['tokens.css', 'blocks.css', 'README.md']) {
      const dest = join(projectDir, '.codeloop/design-system', f);
      if (existsSync(dest)) continue;
      if (dryRun) console.log(chalk.yellow(`  .codeloop/design-system/${f}: would install`));
      else {
        fse.ensureDirSync(dirname(dest));
        copySync(join(PACKAGE_ROOT, 'templates/design-system', f), dest);
        console.log(chalk.green(`  .codeloop/design-system/${f}: installed`));
      }
    }

    console.log();
    console.log(chalk.dim('  Wiki pages, the design system and legacy knowledge files are never overwritten.'));
    console.log(chalk.dim('  Installed lanes are never overwritten; use `codeloop lane refresh <id>` for that.'));
    console.log();
  });
