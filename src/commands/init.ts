import { Command } from 'commander';
import chalk from 'chalk';
import { createInterface } from 'readline';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { detectProject, detectStack, type ProjectDetection, type StackId } from '../lib/detect.js';
import { excludeFromGit, installHostHooks } from '../lib/host-hooks.js';
import { render, renderProtocol } from '../lib/render.js';
import { applyAgentsConfig, applyDetection, applyMcpConfig, installCi, installFiveFiles, installHooks, scaffold, type ToolId } from '../lib/scaffold.js';
import { detectTools } from '../lib/detect.js';
import { loadLanes, loadSkillsIndex, SKILLS_INDEX } from '../lib/lane.js';
import { defaultSkillDirs, ensureSkillsIndex, scanSkills } from '../lib/skills.js';
import { registerProject } from '../lib/hub-registry.js';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

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

const list = (items: string[], empty: string) => (items.length ? items.join(', ') : chalk.dim(empty));

/** What the repository's own files said, as the first thing a person reads after install. */
function reportDetection(d: ProjectDetection): void {
  const row = (label: string, value: string) => console.log(`  ${label.padEnd(16)} ${value}`);
  console.log(chalk.bold('Codeloop read this repository:'));
  row('Languages:', list(d.languages.map(l => `${l.name} (${l.where})`), 'none found'));
  row('Frameworks:', list(d.frameworks, 'none recognised'));
  row('Build and test:', list(d.commands.map(c => `${c.command}${c.cwd ? ` (${c.cwd})` : ''}`), 'no build or test command found'));
  row('Database:', list(d.database.map(x => `${x.tech} (${x.source})`), 'none found'));
  row('Pipeline:', list(d.pipeline.map(p => `${p.file}${p.jobs.length ? ` (jobs: ${p.jobs.join(', ')})` : ''}`), 'none found'));
  row('Modules:', list(d.modules, 'no source folders found'));
  if (d.undetected) console.log(chalk.yellow(`  ${d.undetected}`));
  console.log();
}

// The machine-local files later commands write under .codeloop, kept out of `git status` the way
// the full scaffold's .codeloop/.gitignore keeps them; a five-file install writes no gitignore.
function localBoardFiles(): string[] {
  return readFileSync(join(PACKAGE_ROOT, 'templates/codeloop/gitignore'), 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => `.codeloop/${l}`);
}

export const initCommand = new Command('init')
  .description('Set Codeloop up in this repository: read the stack, write five files, say what it found')
  .option('-s, --starter <name>', 'Use a specific starter (generic, node-typescript, python, go, java, dotnet)')
  .option('-t, --tools <tools>', 'Comma-separated tools: claude,cursor,codex (skip prompt)')
  .option('--full', 'The full scaffold: lanes, skills, commands and role files copied into the repository instead of read from the package')
  .option('--hooks', 'Only install the hooks: the commit-msg trailer, the Claude Code and Cursor hooks, and the pre-commit and pre-push guards')
  .option('--ci <provider>', 'Only write CI workflows (github)')
  .option('-y, --yes', 'Write into an existing .claude/commands/ without asking')
  .action(async (options: { starter?: string; tools?: string; full?: boolean; hooks?: boolean; ci?: string; yes?: boolean }) => {
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
      for (const h of installHostHooks(projectDir)) {
        console.log(h.installed ? chalk.green(`  + ${h.name}${h.reason === 'unchanged' ? ' (unchanged)' : ''}`) : chalk.yellow(`  ~ ${h.name}: ${h.reason}`));
      }
      return;
    }

    // The repository's own files say what it is; --starter only picks the config.
    const detection = detectProject(projectDir);
    let stackId: StackId;
    let stackDesc: string;
    if (options.starter) {
      stackId = options.starter as StackId;
      stackDesc = options.starter;
    } else {
      const detected = detectStack(projectDir);
      stackId = detected.stack;
      stackDesc = detected.description;
    }
    const starterFile = `${stackId}.yaml`;

    // Select tools, interactive prompt or flag
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

    if (!options.full) {
      reportDetection(detection);
      const result = installFiveFiles(projectDir, starterFile, detection);
      const protocol = renderProtocol(projectDir, tools);
      const mcp = applyMcpConfig(projectDir, tools);
      const added = [...result.created, ...protocol.written, ...mcp];
      console.log(chalk.bold(`${added.length} files added to the repository, nothing else changed:`));
      for (const f of added) console.log(chalk.green(`  + ${f}`));
      for (const f of result.skipped) console.log(chalk.yellow(`  ~ ${f} already exists, kept`));
      for (const f of protocol.unchanged) console.log(chalk.yellow(`  ~ ${f} already carries the block`));
      // Hooks and board state live outside the repository diff: .git/hooks, .git/info/exclude.
      const outside: string[] = [];
      const hook = installHooks(projectDir);
      if (hook.installed) outside.push(relative(projectDir, hook.path) || hook.path);
      for (const h of installHostHooks(projectDir, { local: true, hosts: tools.filter((t): t is 'claude' | 'cursor' => t === 'claude' || t === 'cursor') })) if (h.installed) outside.push(h.path ? relative(projectDir, h.path) : h.name);
      excludeFromGit(projectDir, localBoardFiles());
      if (outside.length) console.log(chalk.dim(`  Outside the repository (.git/hooks, .git/info/exclude): ${outside.join(', ')}`));
      registerProject(projectDir);
      console.log();
      console.log(`  Stack config: ${chalk.cyan(stackDesc)}. Lanes and skills are read from the Codeloop package; ${chalk.cyan('codeloop lane list')} shows them.`);
      console.log();
      console.log('  Next: open your AI tool in this folder. It is the lead agent for this repository: it runs');
      console.log(`  ${chalk.cyan('codeloop map')} to learn the system, then ${chalk.cyan('codeloop setup')} to ask you six questions.`);
      console.log(`  Or run those two yourself, then ${chalk.cyan('codeloop serve')} opens the board.`);
      console.log();
      return;
    }

    if (detection.frameworks.length || Object.keys(detection.scripts).length) {
      console.log(chalk.dim(`  Detected ${[...detection.frameworks, ...Object.keys(detection.scripts).map(k => `scripts.${k}`)].join(', ')} in package.json (${detection.packageManager})`));
    }
    if (detection.stack.matchedFile) console.log(chalk.dim(`  Detected ${stackDesc} (found ${detection.stack.matchedFile})`));
    else console.log(chalk.dim(`  No specific stack detected, using generic config`));

    // Somebody's own commands live there already; writing next to them is asked for, or taken from --yes.
    const commandsDir = join(projectDir, '.claude/commands');
    let commandsFor = tools;
    if (tools.includes('claude') && existsSync(commandsDir) && readdirSync(commandsDir).length > 0 && !options.yes) {
      const answer = process.stdin.isTTY ? await prompt(`  .claude/commands/ already has files. Write codeloop's commands beside them? [y/N] `) : '';
      if (!/^y(es)?$/i.test(answer)) {
        commandsFor = tools.filter(t => t !== 'claude');
        console.log(chalk.yellow(`  ~ .claude/commands/ left alone (pass --yes to write into it)`));
      }
    }

    console.log();
    console.log(chalk.bold('Initializing codeloop...'));
    console.log(chalk.dim(`  Tools: ${tools.join(', ')} | Stack: ${stackDesc}`));
    console.log();

    const result = scaffold(projectDir, starterFile, tools, { commandsFor });
    const applied = applyDetection(projectDir, detection, result.created);
    if (applied.includes('.codeloop/config.yaml')) console.log(chalk.dim(`  quality_checks from package.json: ${detection.qualityChecks.map(c => `${c.name} (${c.command})`).join(', ')}`));
    if (applied.includes('.codeloop/lanes/build.yaml')) console.log(chalk.dim(`  build lane test command: ${detection.testCommand}`));

    for (const f of applyMcpConfig(projectDir, tools)) console.log(chalk.green(`  + ${f} (codeloop mcp server)`));
    const agentsResult = applyAgentsConfig(projectDir, tools);
    if (agentsResult.changed) console.log(chalk.dim(`  agents: configured for ${tools.filter(t => !agentsResult.skipped.includes(t)).join(', ')}, so run --agent works now`));
    for (const t of agentsResult.skipped) console.log(chalk.yellow(`  ~ agents.${t} skipped: cursor-agent is not on PATH`));

    // The assistant only follows codeloop if its own instructions file says so, and the session hooks
    // only run if they are installed: without both, a plain chat in this repo edits files directly.
    const rendered = render(projectDir, tools);
    const roleFiles = rendered.written.filter(f => f.includes('/agents/') || f.includes('/skills/codeloop-') || f.includes('/rules/codeloop-'));
    for (const f of rendered.written.filter(f => !roleFiles.includes(f))) console.log(chalk.green(`  + ${f} (tells the assistant to work through codeloop)`));
    if (roleFiles.length) console.log(chalk.green(`  + ${roleFiles.length} stage role files for the assistant`));
    for (const f of rendered.kept) console.log(chalk.yellow(`  ~ ${f}: edited by hand, kept (\`codeloop render --force\` replaces it)`));
    const hook = installHooks(projectDir);
    if (hook.installed) console.log(chalk.green(`  + ${relative(projectDir, hook.path) || hook.path}`));
    for (const h of installHostHooks(projectDir)) if (h.installed && h.reason !== 'unchanged') console.log(chalk.green(`  + ${h.name}`));

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

    // So the hub (and `codeloop projects list`) know about this project from the start, not only
    // once someone runs `serve` here.
    registerProject(projectDir);

    console.log();
    console.log(chalk.bold('Done.'));
    console.log();
    console.log(`  ${lanes} lanes in ${chalk.cyan('.codeloop/lanes/')}, ${indexed} skills indexed in ${chalk.cyan(SKILLS_INDEX)}.`);
    console.log();
    console.log('  Next:');
    console.log(`    ${chalk.cyan('codeloop serve')}   opens the board; describe a problem there and codeloop turns it into stories`);
    console.log(`    or ${chalk.cyan('codeloop shape "<the problem>"')} from here.`);
    console.log();
  });
