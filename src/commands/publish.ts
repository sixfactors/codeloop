import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { parseSkillFile } from '../registry/skill-schema.js';
import { validateSecurity } from '../registry/security.js';
import { computeIntegrity } from '../registry/lockfile.js';

const REGISTRY_URL = process.env.CODELOOP_REGISTRY_URL || 'https://skills.codeloop.dev';
const TOKEN_PATH = join(process.env.HOME || '~', '.codeloop', 'auth.json');

export const publishCommand = new Command('publish')
  .description('Publish a skill to the registry (validate locally with --dry-run)')
  .option('--dry-run', 'Validate only, don\'t publish')
  .action(async (options: { dryRun?: boolean }) => {
    const dir = process.cwd();

    console.log();

    // Find SKILL.md
    const skillPath = join(dir, 'SKILL.md');
    if (!existsSync(skillPath)) {
      console.log(chalk.red('  No SKILL.md found in current directory.'));
      console.log(chalk.dim('  Create a SKILL.md file with the required frontmatter to publish.'));
      console.log();
      return;
    }

    // Parse
    const content = readFileSync(skillPath, 'utf-8');
    let parsed;
    try {
      parsed = parseSkillFile(content);
    } catch (e: any) {
      console.log(chalk.red(`  Validation error: ${e.message}`));
      console.log();
      return;
    }

    console.log(chalk.bold(`  Skill: ${parsed.manifest.name}@${parsed.manifest.version}`));
    console.log(chalk.dim(`  ${parsed.manifest.description}`));

    // Security check
    const security = validateSecurity(content);
    if (!security.passed) {
      console.log();
      console.log(chalk.red('  Security validation FAILED:'));
      for (const finding of security.findings.filter(f => f.severity === 'block')) {
        console.log(chalk.red(`    Line ${finding.line}: ${finding.message}`));
      }
      console.log();
      return;
    }

    if (security.findings.length > 0) {
      console.log();
      console.log(chalk.yellow('  Security warnings:'));
      for (const finding of security.findings.filter(f => f.severity === 'warn')) {
        console.log(chalk.yellow(`    Line ${finding.line}: ${finding.message}`));
      }
    }

    console.log(chalk.green('  Security: passed'));

    if (options.dryRun) {
      console.log();
      console.log(chalk.bold('  Dry run complete — would publish:'));
      console.log(chalk.dim(`    Name: ${parsed.manifest.name}`));
      console.log(chalk.dim(`    Version: ${parsed.manifest.version}`));
      console.log(chalk.dim(`    Tags: ${parsed.manifest.tags.join(', ') || 'none'}`));
      console.log(chalk.dim(`    Stack: ${parsed.manifest.stack}`));
      console.log(chalk.dim(`    Integrity: ${computeIntegrity(content)}`));
      console.log();
      return;
    }

    // Read auth token
    if (!existsSync(TOKEN_PATH)) {
      console.log();
      console.log(chalk.red('  Not authenticated. Run `codeloop login` first.'));
      console.log();
      return;
    }

    let token: string;
    try {
      const auth = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'));
      token = auth.token;
      if (!token) throw new Error('No token');
    } catch {
      console.log(chalk.red('  Invalid auth file. Run `codeloop login` again.'));
      console.log();
      return;
    }

    // Publish to registry
    console.log(chalk.dim('  Publishing...'));

    try {
      const res = await fetch(`${REGISTRY_URL}/api/skills/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: parsed.manifest.name,
          version: parsed.manifest.version,
          description: parsed.manifest.description,
          manifest: parsed.manifest,
          integrity: computeIntegrity(content),
          artifact_url: '', // TODO: upload artifact to GitHub Releases
          tags: parsed.manifest.tags,
          stack: parsed.manifest.stack,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        console.log(chalk.red(`  Publish failed: ${data.error || res.statusText}`));
        console.log();
        return;
      }

      const data = await res.json();
      console.log(chalk.green(`  Published ${data.name}@${data.version}`));
      console.log(chalk.dim(`  Install: codeloop install ${data.name}`));
    } catch (error: any) {
      console.log(chalk.red(`  Failed to connect to registry: ${error.message}`));
      console.log();
      console.log(chalk.dim('  The community registry (skills.codeloop.dev) is not yet available.'));
      console.log(chalk.dim('  Use --dry-run to validate your skill locally, or share via GitHub:'));
      console.log(chalk.dim('  codeloop install github:your-user/your-repo'));
    }

    console.log();
  });
