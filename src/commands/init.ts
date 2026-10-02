import { Command } from 'commander';
import chalk from 'chalk';
import { createInterface } from 'readline';
import { detectStack, type StackId } from '../lib/detect.js';
import { installCi, installHooks, scaffold, type ToolId } from '../lib/scaffold.js';
import { detectTools } from '../lib/detect.js';
import { loadLanes, loadSkillsIndex, SKILLS_INDEX } from '../lib/lane.js';
import { defaultSkillDirs, ensureSkillsIndex, scanSkills } from '../lib/skills.js';

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function selectTools(projectDir: string): Promise<ToolId[]> {
  const detected = detectTools(projectDir);
  const allTools: { id: ToolId; name: string; detected: boolean }[] = [
    { id: 'claude', name: 'Claude Code', detected: detected.includes('claude') },
    { id: 'cursor', name: 'Cursor', detected: detected.includes('cursor') },
    { id: 'codex', name: 'Codex', detected: detected.includes('codex') },
  ];

  console.log();
  console.log(chalk.bold('  Which AI coding tools do you use?'));
  console.log();

  for (let i = 0; i < allTools.length; i++) {
    const tool = allTools[i];
    const marker = tool.detected ? chalk.green('(detected)') : '';
    console.log(`    ${i + 1}. ${tool.name} ${marker}`);
  }
  console.log(`    a. All`);
  console.log();

  const defaultSelection = detected.length > 0
    ? detected.map(d => allTools.findIndex(t => t.id === d) + 1).join(',')
    : '1';

  const answer = await prompt(`  Select tools (comma-separated) [${defaultSelection}]: `);
  const input = answer || defaultSelection;

  if (input.toLowerCase() === 'a') {
    return allTools.map(t => t.id);
  }

  const indices = input.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  return indices
    .filter(i => i >= 1 && i <= allTools.length)
    .map(i => allTools[i - 1].id);
}

export const initCommand = new Command('init')
  .description('Initialize codeloop in the current project')
  .option('-s, --starter <name>', 'Use a specific starter (generic, node-typescript, python, go)')
  .option('-t, --tools <tools>', 'Comma-separated tools: claude,cursor,codex (skip prompt)')
  .option('--hooks', 'Only install the commit-msg hook that adds the Feature: trailer')
  .option('--ci <provider>', 'Only write CI workflows (github)')
  .action(async (options: { starter?: string; tools?: string; hooks?: boolean; ci?: string }) => {
    const projectDir = process.cwd();

    if (options.ci) {
      if (options.ci !== 'github') {
        console.log(chalk.red(`  unknown CI provider "${options.ci}" (github)`));
        process.exit(1);
      }
      const ci = installCi(projectDir);
      ci.created.forEach(f => console.log(chalk.green(`  + ${f}`)));
      ci.skipped.forEach(f => console.log(chalk.yellow(`  ~ ${f} (already exists)`)));
      if (!options.hooks) return;
    }

    if (options.hooks) {
      const hook = installHooks(projectDir);
      if (!hook.installed) {
        console.log(chalk.red(`  commit-msg hook not installed: ${hook.reason}`));
        process.exit(1);
      }
      console.log(chalk.green(`  + ${hook.path}`));
      return;
    }

    // Detect or use specified starter
    let stackId: StackId;
    let stackDesc: string;

    if (options.starter) {
      stackId = options.starter as StackId;
      stackDesc = options.starter;
    } else {
      const detected = detectStack(projectDir);
      stackId = detected.stack;
      stackDesc = detected.description;
      if (detected.matchedFile) {
        console.log(chalk.dim(`  Detected ${stackDesc} (found ${detected.matchedFile})`));
      } else {
        console.log(chalk.dim(`  No specific stack detected, using generic config`));
      }
    }

    // Select tools — interactive prompt or flag
    let tools: ToolId[];
    if (options.tools) {
      tools = options.tools.split(',').map(t => t.trim()) as ToolId[];
    } else {
      tools = await selectTools(projectDir);
    }

    if (tools.length === 0) {
      console.log(chalk.red('\n  No tools selected. Aborting.\n'));
      process.exit(1);
    }

    const starterFile = `${stackId}.yaml`;

    console.log();
    console.log(chalk.bold('Initializing codeloop...'));
    console.log(chalk.dim(`  Tools: ${tools.join(', ')} | Stack: ${stackDesc}`));
    console.log();

    const result = scaffold(projectDir, starterFile, tools);

    // The shipped lanes name the skills just installed, so the index has to exist before lint or pack
    // can pass. An existing index is left alone: adopt replaces it, it does not merge.
    ensureSkillsIndex(projectDir, () => scanSkills(projectDir, defaultSkillDirs(projectDir)));
    const indexed = loadSkillsIndex(projectDir)?.length ?? 0;
    const lanes = loadLanes(projectDir).length;

    // Print created files
    if (result.created.length > 0) {
      console.log(chalk.green('  Created:'));
      for (const file of result.created) {
        console.log(chalk.green(`    + ${file}`));
      }
    }

    // Print skipped files
    if (result.skipped.length > 0) {
      console.log(chalk.yellow('  Skipped (already exist):'));
      for (const file of result.skipped) {
        console.log(chalk.yellow(`    ~ ${file}`));
      }
    }

    console.log();
    console.log(chalk.bold('Done.'));
    console.log();
    console.log(`  ${lanes} lanes in ${chalk.cyan('.codeloop/lanes/')}, ${indexed} skills indexed in ${chalk.cyan(SKILLS_INDEX)}.`);
    console.log(`  ${chalk.cyan('codeloop serve')} opens the board in a browser.`);
    console.log();
    console.log('  Next, type:');
    console.log(`    ${chalk.cyan('codeloop start "<your feature>"')}`);
    console.log(`    ${chalk.cyan('codeloop inbox')}`);
    console.log();
  });
