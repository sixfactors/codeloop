import { Command } from 'commander';
import chalk from 'chalk';
import { loadLanes, SKILLS_INDEX } from '../lib/lane.js';
import { doneGaps } from '../lib/skills.js';
import { createLocalClient } from '../sdk/local.js';
import { guard } from './guard.js';

export const adoptCommand = new Command('adopt')
  .description('Index the skills and commands that already exist so lanes can name them; merges into the index unless --replace')
  .option('--from <dir...>', 'Directories to scan (default: .claude/skills, .claude/commands, .cursor/commands, .agents/skills in the project, and ~/.claude/skills, ~/.claude/commands)')
  .option('--replace', 'Rebuild the index from the scan alone, dropping entries from other directories')
  .option('--gaps', 'List lane stages with no mechanical done check')
  .action(guard(async (opts: { from?: string[]; replace?: boolean; gaps?: boolean }) => {
    const projectDir = process.cwd();
    const { indexed, added, updated, removed, duplicates } = await createLocalClient(projectDir).setup.adopt({ from: opts.from, replace: opts.replace });
    console.log(`  indexed ${indexed} skills and commands into ${SKILLS_INDEX} (${added} added, ${updated} updated, ${removed} removed)`);

    for (const dup of duplicates) {
      console.log(chalk.yellow(`  duplicate: ${dup.name}`));
      dup.sources.forEach((s: string) => console.log(chalk.dim(`    ${s}`)));
    }
    if (opts.gaps) {
      const gaps = doneGaps(loadLanes(projectDir));
      if (gaps.length === 0) console.log('  no gaps: every lane stage has a check command');
      gaps.forEach(g => console.log(chalk.yellow(`  gap: ${g.lane}/${g.stage}: ${g.reason}`)));
    }
  }));
