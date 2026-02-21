import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';

const TOKEN_PATH = join(process.env.HOME || '~', '.codeloop', 'auth.json');

export const loginCommand = new Command('login')
  .description('Authenticate with the skill registry (check status with --status)')
  .option('--token <token>', 'GitHub personal access token')
  .option('--status', 'Check current auth status')
  .action(async (options: { token?: string; status?: boolean }) => {
    console.log();

    if (options.status) {
      if (!existsSync(TOKEN_PATH)) {
        console.log(chalk.dim('  Not authenticated'));
        console.log(chalk.dim('  Run `codeloop login --token <github-pat>` to authenticate'));
      } else {
        try {
          const auth = JSON.parse(readFileSync(TOKEN_PATH, 'utf-8'));
          console.log(chalk.green(`  Authenticated as: ${auth.username || 'unknown'}`));
          console.log(chalk.dim(`  Token stored at: ${TOKEN_PATH}`));
        } catch {
          console.log(chalk.yellow('  Auth file exists but is invalid'));
        }
      }
      console.log();
      return;
    }

    if (!options.token) {
      console.log(chalk.bold('  GitHub Authentication'));
      console.log();
      console.log('  Create a GitHub Personal Access Token at:');
      console.log(chalk.cyan('  https://github.com/settings/tokens/new'));
      console.log();
      console.log('  Required scopes: (none — public read access is sufficient)');
      console.log();
      console.log('  Then run:');
      console.log(chalk.dim('  codeloop login --token ghp_xxxx'));
      console.log();
      return;
    }

    // Verify the token
    console.log(chalk.dim('  Verifying token...'));

    try {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${options.token}`,
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        console.log(chalk.red('  Invalid token'));
        console.log();
        return;
      }

      const user = await res.json();

      // Save token
      const authDir = dirname(TOKEN_PATH);
      if (!existsSync(authDir)) {
        mkdirSync(authDir, { recursive: true });
      }

      writeFileSync(TOKEN_PATH, JSON.stringify({
        token: options.token,
        username: user.login,
        github_id: String(user.id),
        authenticated_at: new Date().toISOString(),
      }, null, 2), 'utf-8');

      console.log(chalk.green(`  Authenticated as ${user.login}`));
      console.log(chalk.dim(`  Token stored at: ${TOKEN_PATH}`));
    } catch (error: any) {
      console.log(chalk.red(`  Failed to verify token: ${error.message}`));
    }

    console.log();
  });
