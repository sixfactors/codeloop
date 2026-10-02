import { Command } from 'commander';
import chalk from 'chalk';
import { loadLanes, SKILLS_INDEX } from '../lib/lane.js';
import { defaultSkillDirs, doneGaps, duplicateSkills, scanSkills, writeSkillsIndex } from '../lib/skills.js';
import { guard } from './guard.js';

export const adoptCommand = new Command('adopt')
  .description('Index the skills and commands that already exist so lanes can name them')
  .option('--from <dir...>', 'Directories to scan (default: .claude/skills, .claude/commands, .cursor/commands, .agents/skills in the project, and ~/.claude/skills, ~/.claude/commands)')
  .option('--gaps', 'List lane stages with no mechanical done check')
  .action(guard((opts: { from?: string[]; gaps?: boolean }) => {
    const projectDir = process.cwd();
    const entries = scanSkills(projectDir, opts.from ?? defaultSkillDirs(projectDir));
    writeSkillsIndex(projectDir, entries);
    console.log(`  indexed ${entries.length} skills and commands into ${SKILLS_INDEX}`);

    for (const dup of duplicateSkills(entries)) {
      console.log(chalk.yellow(`  duplicate: ${dup.name}`));
      dup.sources.forEach(s => console.log(chalk.dim(`    ${s}`)));
    }
    if (opts.gaps) {
      const gaps = doneGaps(loadLanes(projectDir));
      if (gaps.length === 0) console.log('  no gaps: every lane stage has a check command');
      gaps.forEach(g => console.log(chalk.yellow(`  gap: ${g.lane}/${g.stage}: ${g.reason}`)));
    }
  }));
