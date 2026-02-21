import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { installFromLocal, installFromContent, installBuiltin } from '../registry/installer.js';
import { findInLocalIndex, loadLocalIndex } from '../registry/local-index.js';
import { validateSecurity } from '../registry/security.js';

const REGISTRY_URL = process.env.CODELOOP_REGISTRY_URL || 'https://skills.codeloop.dev';

export const installCommand = new Command('install')
  .description('Install a skill from the registry, GitHub, or local path')
  .argument('<source>', 'Skill name, github:user/repo/path, or local path')
  .action(async (source: string) => {
    const projectDir = process.cwd();

    console.log();

    // Determine install source
    if (source.startsWith('./') || source.startsWith('/') || source.startsWith('../')) {
      // Local path install
      console.log(chalk.dim(`  Installing from local path: ${source}`));
      const result = installFromLocal(projectDir, source);

      if (!result.success) {
        console.log(chalk.red(`  Failed: ${result.error}`));
        process.exit(1);
      }

      console.log(chalk.green(`  Installed ${result.name}@${result.version}`));
      for (const file of result.files) {
        console.log(chalk.dim(`    → ${file}`));
      }
    } else if (source.startsWith('github:')) {
      // GitHub install
      const githubPath = source.slice(7); // Remove "github:"
      console.log(chalk.dim(`  Installing from GitHub: ${githubPath}`));

      try {
        // Fetch from GitHub raw content
        const [owner, repo, ...pathParts] = githubPath.split('/');
        const filePath = pathParts.length > 0 ? pathParts.join('/') : 'SKILL.md';
        const url = `https://raw.githubusercontent.com/${owner}/${repo}/main/${filePath}`;

        const res = await fetch(url);
        if (!res.ok) {
          // Try HEAD branch
          const headUrl = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${filePath}`;
          const headRes = await fetch(headUrl);
          if (!headRes.ok) {
            console.log(chalk.red(`  Failed to fetch: ${url} (${res.status})`));
            process.exit(1);
          }
          const content = await headRes.text();
          const result = installFromContent(projectDir, content, `github:${githubPath}`, 'community');
          logResult(result);
          return;
        }

        const content = await res.text();
        const result = installFromContent(projectDir, content, `github:${githubPath}`, 'community');
        logResult(result);
      } catch (error: any) {
        console.log(chalk.red(`  Failed: ${error.message}`));
        process.exit(1);
      }
    } else {
      // Registry install (by name)
      console.log(chalk.dim(`  Looking up: ${source}`));

      // 1. Check local index first
      const localIndex = loadLocalIndex();
      const localEntry = findInLocalIndex(localIndex, source);

      if (localEntry && localEntry.source === 'builtin') {
        // Install from built-in templates
        const result = installBuiltin(projectDir, source);
        logResult(result);
        return;
      }

      // 2. Try registry API
      try {
        const res = await fetch(`${REGISTRY_URL}/api/skills/${source}`);
        if (!res.ok) {
          if (res.status === 404) {
            console.log(chalk.red(`  Skill "${source}" not found in registry.`));
            console.log(chalk.dim(`  Try: codeloop search "${source}"`));
          } else {
            console.log(chalk.red(`  Registry error: ${res.status}`));
          }
          process.exit(1);
        }

        const data = await res.json();
        const latestVersion = data.versions?.find((v: any) => v.dist_tag === 'latest') || data.versions?.[0];

        if (!latestVersion?.artifact_url) {
          console.log(chalk.red(`  No downloadable version found for "${source}"`));
          process.exit(1);
        }

        // Download artifact
        const artifactRes = await fetch(latestVersion.artifact_url);
        if (!artifactRes.ok) {
          console.log(chalk.red(`  Failed to download artifact: ${artifactRes.status}`));
          process.exit(1);
        }

        const content = await artifactRes.text();
        const tier = data.skill?.tier || 'community';
        const result = installFromContent(projectDir, content, `registry:${source}`, tier);
        logResult(result);
      } catch (error: any) {
        console.log(chalk.red(`  Failed to connect to registry: ${error.message}`));

        // Fallback: check if it's a builtin name
        if (localEntry) {
          console.log(chalk.yellow(`  Falling back to local index...`));
          const result = installBuiltin(projectDir, source);
          logResult(result);
        } else {
          process.exit(1);
        }
      }
    }

    console.log();
  });

function logResult(result: ReturnType<typeof installFromLocal>) {
  if (!result.success) {
    console.log(chalk.red(`  Failed: ${result.error}`));
    process.exit(1);
  }

  console.log(chalk.green(`  Installed ${result.name}@${result.version}`));
  for (const file of result.files) {
    console.log(chalk.dim(`    → ${file}`));
  }
}
