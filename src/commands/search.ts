import { Command } from 'commander';
import chalk from 'chalk';
import { loadLocalIndex, searchLocalIndex, type IndexEntry } from '../registry/local-index.js';

const REGISTRY_URL = process.env.CODELOOP_REGISTRY_URL || 'https://skills.codeloop.dev';

export const searchCommand = new Command('search')
  .description('Search for skills in the registry')
  .argument('<query>', 'Search query')
  .option('--tag <tag>', 'Filter by tag')
  .option('--stack <stack>', 'Filter by stack')
  .option('--local', 'Search local index only (offline)')
  .action(async (query: string, options: { tag?: string; stack?: string; local?: boolean }) => {
    console.log();

    // 1. Search local index
    const localIndex = loadLocalIndex();
    let results = searchLocalIndex(localIndex, query);

    // Apply filters
    if (options.tag) {
      results = results.filter(s => s.tags.includes(options.tag!));
    }
    if (options.stack) {
      results = results.filter(s => s.stack === options.stack);
    }

    // 2. Search registry API (unless --local)
    let remoteResults: IndexEntry[] = [];
    if (!options.local) {
      try {
        const params = new URLSearchParams({ q: query });
        if (options.tag) params.set('tag', options.tag);
        if (options.stack) params.set('stack', options.stack);

        const res = await fetch(`${REGISTRY_URL}/api/skills?${params}`);
        if (res.ok) {
          const data = await res.json();
          remoteResults = (data.skills || []).map((s: any) => ({
            name: s.name,
            version: s.latest_version || '?',
            description: s.description,
            author: s.author_name || 'unknown',
            tags: s.tags || [],
            stack: s.stack || 'generic',
            tier: s.tier || 'community',
            source: 'registry' as const,
          }));
        }
      } catch {
        // Registry offline — use local results only
        if (results.length === 0) {
          // Only show hint if local had no results either
          console.log(chalk.dim('  (Community registry offline — showing local results only)'));
        }
      }
    }

    // Merge results (local first, deduplicate by name)
    const seen = new Set(results.map(r => r.name));
    for (const remote of remoteResults) {
      if (!seen.has(remote.name)) {
        results.push(remote);
        seen.add(remote.name);
      }
    }

    if (results.length === 0) {
      console.log(chalk.dim(`  No skills found for "${query}"`));
      console.log();
      return;
    }

    console.log(chalk.bold(`  Skills matching "${query}"`));
    console.log();

    for (const skill of results) {
      const tierBadge = skill.tier === 'trusted'
        ? chalk.green('trusted')
        : skill.tier === 'community'
          ? chalk.cyan('community')
          : chalk.yellow('unreviewed');

      console.log(`  ${chalk.bold(skill.name)} ${chalk.dim(`v${skill.version}`)} ${tierBadge}`);
      console.log(`  ${chalk.dim(skill.description)}`);

      if (skill.tags.length > 0) {
        console.log(`  ${chalk.dim(`tags: ${skill.tags.join(', ')}`)}`);
      }

      console.log(`  ${chalk.dim(`codeloop install ${skill.name}`)}`);
      console.log();
    }
  });
