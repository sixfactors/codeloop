import fse from 'fs-extra';
import { spawnSync } from 'child_process';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import type { ProjectDetection } from './detect.js';

const { copySync, ensureDirSync, existsSync, readdirSync, readFileSync, writeFileSync } = fse;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Walk up from dist/lib/ to package root
const PACKAGE_ROOT = join(__dirname, '..', '..');

export type ToolId = 'claude' | 'cursor' | 'codex';

export interface ScaffoldResult {
  created: string[];
  skipped: string[];
}

interface ScaffoldFile {
  source: string;      // relative to package root
  destination: string; // relative to project root
  overwrite: boolean;  // false = skip if exists (knowledge files)
}

/**
 * Map template commands to tool-specific destinations.
 *
 * Claude Code: .claude/commands/*.md (markdown with frontmatter)
 * Cursor:      .cursor/commands/*.md (same format, Cursor supports this natively)
 * Codex:       .agents/skills/<name>/SKILL.md (YAML frontmatter with name/description)
 */
function getCommandDestinations(tools: ToolId[]): ScaffoldFile[] {
  const commands = ['design', 'plan', 'manage', 'test', 'commit', 'qa', 'deploy', 'debug', 'reflect', 'ship'];
  const files: ScaffoldFile[] = [];

  for (const cmd of commands) {
    const source = `templates/commands/${cmd}.md`;

    if (tools.includes('claude')) {
      files.push({ source, destination: `.claude/commands/${cmd}.md`, overwrite: false });
    }
    if (tools.includes('cursor')) {
      files.push({ source, destination: `.cursor/commands/${cmd}.md`, overwrite: false });
    }
    if (tools.includes('codex')) {
      files.push({ source, destination: `.agents/skills/${cmd}/SKILL.md`, overwrite: false });
    }
  }

  return files;
}

/**
 * Skill folders under templates/skills/<name>/ (SKILL.md + template.md + checklist.md) go to each
 * host's skills folder, so a lane stage can name the skill and the host can run it.
 */
function getSkillDestinations(tools: ToolId[]): ScaffoldFile[] {
  const dir = join(PACKAGE_ROOT, 'templates/skills');
  if (!existsSync(dir)) return [];
  const files: ScaffoldFile[] = [];
  for (const name of readdirSync(dir)) {
    const folder = join(dir, name);
    if (!existsSync(join(folder, 'SKILL.md'))) continue;
    for (const file of readdirSync(folder)) {
      const source = `templates/skills/${name}/${file}`;
      if (tools.includes('claude')) files.push({ source, destination: `.claude/skills/${name}/${file}`, overwrite: false });
      if (tools.includes('codex')) files.push({ source, destination: `.agents/skills/${name}/${file}`, overwrite: false });
      if (tools.includes('cursor') && file === 'SKILL.md') files.push({ source, destination: `.cursor/commands/${name}.md`, overwrite: false });
    }
  }
  return files;
}

function getLaneFiles(): ScaffoldFile[] {
  const dir = join(PACKAGE_ROOT, 'templates/lanes');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.yaml'))
    .map(f => ({ source: `templates/lanes/${f}`, destination: `.codeloop/lanes/${f}`, overwrite: false }));
}

function getKnowledgeFiles(): ScaffoldFile[] {
  return [
    ...getLaneFiles(),
    { source: 'templates/codeloop/rules.md', destination: '.codeloop/rules.md', overwrite: false },
    { source: 'templates/codeloop/gotchas.md', destination: '.codeloop/gotchas.md', overwrite: false },
    { source: 'templates/codeloop/patterns.md', destination: '.codeloop/patterns.md', overwrite: false },
    { source: 'templates/codeloop/principles.md', destination: '.codeloop/principles.md', overwrite: false },
    { source: 'templates/codeloop/board.json', destination: '.codeloop/board.json', overwrite: false },
    { source: 'templates/codeloop/gitignore', destination: '.codeloop/.gitignore', overwrite: false },
  ];
}

/** `commandsFor`: the tools whose command folders may be written; default all of `tools`. */
export function scaffold(projectDir: string, starterFile: string, tools: ToolId[], opts: { commandsFor?: ToolId[] } = {}): ScaffoldResult {
  const result: ScaffoldResult = { created: [], skipped: [] };

  // 1. Copy command files to tool-specific directories
  const commandFiles = [...getCommandDestinations(opts.commandsFor ?? tools), ...getSkillDestinations(opts.commandsFor ?? tools)];
  for (const file of commandFiles) {
    const destPath = join(projectDir, file.destination);
    const srcPath = join(PACKAGE_ROOT, file.source);

    if (!existsSync(srcPath)) continue;

    if (existsSync(destPath) && !file.overwrite) {
      result.skipped.push(file.destination);
      continue;
    }

    ensureDirSync(dirname(destPath));
    copySync(srcPath, destPath);
    result.created.push(file.destination);
  }

  // 2. Copy knowledge files → .codeloop/
  for (const file of getKnowledgeFiles()) {
    const destPath = join(projectDir, file.destination);
    const srcPath = join(PACKAGE_ROOT, file.source);

    if (!existsSync(srcPath)) continue;

    if (existsSync(destPath) && !file.overwrite) {
      result.skipped.push(file.destination);
      continue;
    }

    ensureDirSync(dirname(destPath));
    copySync(srcPath, destPath);
    result.created.push(file.destination);
  }

  // 3. Append seed content to knowledge files based on stack
  const stackId = starterFile.replace('.yaml', '');
  const seedTargets: { knowledge: string; seeds: string[] }[] = [
    {
      knowledge: '.codeloop/gotchas.md',
      seeds: ['templates/seeds/universal-gotchas.md', `templates/seeds/${stackId}-gotchas.md`],
    },
    {
      knowledge: '.codeloop/patterns.md',
      seeds: ['templates/seeds/universal-patterns.md', `templates/seeds/${stackId}-patterns.md`],
    },
  ];

  for (const target of seedTargets) {
    const destPath = join(projectDir, target.knowledge);
    // Only append seeds to files we just created (not pre-existing ones)
    if (!result.created.includes(target.knowledge)) continue;
    if (!existsSync(destPath)) continue;

    let content = readFileSync(destPath, 'utf-8');
    for (const seedSource of target.seeds) {
      const seedPath = join(PACKAGE_ROOT, seedSource);
      if (existsSync(seedPath)) {
        content += '\n' + readFileSync(seedPath, 'utf-8').trimEnd() + '\n';
      }
    }
    writeFileSync(destPath, content);
  }

  // 4. Copy starter config → .codeloop/config.yaml
  const configDest = join(projectDir, '.codeloop/config.yaml');
  if (!existsSync(configDest)) {
    const starterPath = join(PACKAGE_ROOT, 'starters', starterFile);
    if (existsSync(starterPath)) {
      ensureDirSync(dirname(configDest));
      copySync(starterPath, configDest);
      result.created.push('.codeloop/config.yaml');
    }
  } else {
    result.skipped.push('.codeloop/config.yaml');
  }

  return result;
}

/** Copies the GitHub workflows from templates/ci. An existing workflow file is never overwritten. */
export function installCi(projectDir: string): ScaffoldResult {
  const result: ScaffoldResult = { created: [], skipped: [] };
  const dir = join(PACKAGE_ROOT, 'templates/ci');
  for (const file of readdirSync(dir).filter(f => f.endsWith('.yml'))) {
    const destination = `.github/workflows/${file}`;
    const dest = join(projectDir, destination);
    if (existsSync(dest)) {
      result.skipped.push(destination);
      continue;
    }
    ensureDirSync(dirname(dest));
    copySync(join(dir, file), dest);
    result.created.push(destination);
  }
  return result;
}

/** Installs the commit-msg hook. An existing hook that is not ours is left alone. */
export function installHooks(projectDir: string): { installed: boolean; path: string; reason?: string } {
  const run = spawnSync('git', ['rev-parse', '--git-path', 'hooks'], { cwd: projectDir, encoding: 'utf-8' });
  if (run.status !== 0) return { installed: false, path: '', reason: 'not a git repository' };
  const path = join(resolve(projectDir, run.stdout.trim()), 'commit-msg');
  const source = readFileSync(join(PACKAGE_ROOT, 'templates/hooks/commit-msg'), 'utf-8');
  if (existsSync(path) && readFileSync(path, 'utf-8') !== source) {
    return { installed: false, path, reason: 'a different commit-msg hook already exists' };
  }
  ensureDirSync(dirname(path));
  writeFileSync(path, source, { mode: 0o755 });
  return { installed: true, path };
}

export function getTemplateVersion(templatePath: string): string | null {
  const fullPath = join(PACKAGE_ROOT, templatePath);
  if (!existsSync(fullPath)) return null;

  const content = readFileSync(fullPath, 'utf-8');
  const match = content.match(/<!--\s*codeloop-version:\s*([\d.]+)\s*-->/);
  return match ? match[1] : null;
}

export function getInstalledVersion(projectDir: string, filePath: string): string | null {
  const fullPath = join(projectDir, filePath);
  if (!existsSync(fullPath)) return null;

  const content = readFileSync(fullPath, 'utf-8');
  const match = content.match(/<!--\s*codeloop-version:\s*([\d.]+)\s*-->/);
  return match ? match[1] : null;
}

/** Writes the detected checks and test command into files `init` just made; an existing file is left alone. */
export function applyDetection(projectDir: string, detection: ProjectDetection, created: string[]): string[] {
  const changed: string[] = [];
  const config = join(projectDir, '.codeloop/config.yaml');
  if (created.includes('.codeloop/config.yaml') && detection.qualityChecks.length && existsSync(config)) {
    const text = readFileSync(config, 'utf-8');
    const scopes = Object.keys((parseYaml(text)?.scopes as Record<string, unknown>) ?? {});
    const block = [
      '# Detected by `codeloop init` from package.json.',
      'quality_checks:',
      ...(scopes.length ? scopes : ['all']).flatMap(scope => [`  ${scope}:`, ...detection.qualityChecks.flatMap(c => [`    - name: ${JSON.stringify(c.name)}`, `      command: ${JSON.stringify(c.command)}`])]),
      '',
    ].join('\n');
    writeFileSync(config, replaceTopLevelKey(text, 'quality_checks', block));
    changed.push('.codeloop/config.yaml');
  }
  const lane = join(projectDir, '.codeloop/lanes/build.yaml');
  if (created.includes('.codeloop/lanes/build.yaml') && detection.testCommand && detection.testCommand !== 'npm test' && existsSync(lane)) {
    const text = readFileSync(lane, 'utf-8');
    const next = text.replace('--all-done && npm test"', `--all-done && ${detection.testCommand}"`);
    if (next !== text) {
      writeFileSync(lane, next);
      changed.push('.codeloop/lanes/build.yaml');
    }
  }
  return changed;
}

// A YAML file with comments is edited as text: the key's block, up to the next top-level key, is
// swapped so the rest of the starter's comments survive.
function replaceTopLevelKey(text: string, key: string, block: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex(l => l.startsWith(`${key}:`));
  if (start < 0) return `${text.trimEnd()}\n\n${block}`;
  let end = start + 1;
  while (end < lines.length && !/^[A-Za-z_]/.test(lines[end])) end++;
  // A comment block that leads the next key stays with it.
  while (end > start + 1 && /^\s*#/.test(lines[end - 1])) end--;
  return [...lines.slice(0, start), ...block.split('\n'), ...lines.slice(end)].join('\n');
}

const AGENT_TIMEOUT_MINUTES = 15;
const AGENT_MAX_RUNS_PER_DAY = 50;
const AGENT_BINARY: Record<ToolId, string> = { claude: 'claude', codex: 'codex', cursor: 'cursor-agent' };

function commandOnPath(name: string): boolean {
  return spawnSync('which', [name]).status === 0;
}

function agentCmd(tool: ToolId, onPath: boolean): string {
  if (tool === 'claude') return 'claude -p --permission-mode acceptEdits < {brief}';
  if (tool === 'codex') return onPath ? 'codex exec --full-auto "$(cat {brief})"' : 'codex exec "$(cat {brief})"';
  return 'cursor-agent -p "$(cat {brief})"';
}

/**
 * Writes a real `agents:` block into config.yaml for the tools `init` just set up, so
 * `run --agent` works without extra config. Never touches a config that already has an `agents:`
 * key: that may be hand-edited, and init does not overwrite it.
 *
 * `cursor-agent` is left out when it is not on PATH, unless it is the only tool selected: with
 * nothing else to configure the block still needs to exist, so it is written with a note instead.
 */
/**
 * The MCP server entry each host reads, so the agent's tools (brief, ask, answer, check, propose,
 * next_up) are there without hand-editing. A file that already names a `codeloop` server is kept.
 */
export function applyMcpConfig(projectDir: string, tools: ToolId[]): string[] {
  const targets: Record<string, string> = { claude: '.mcp.json', cursor: '.cursor/mcp.json' };
  const written: string[] = [];
  for (const tool of tools) {
    const rel = targets[tool];
    if (!rel) continue;
    const path = join(projectDir, rel);
    let current: { mcpServers?: Record<string, unknown> } = {};
    if (existsSync(path)) {
      try {
        current = JSON.parse(readFileSync(path, 'utf-8'));
      } catch {
        continue;
      }
    }
    current.mcpServers ??= {};
    if (current.mcpServers.codeloop) continue;
    current.mcpServers.codeloop = { command: 'codeloop', args: ['mcp'] };
    ensureDirSync(dirname(path));
    writeFileSync(path, `${JSON.stringify(current, null, 2)}\n`);
    written.push(rel);
  }
  return written;
}

export function applyAgentsConfig(projectDir: string, tools: ToolId[]): { changed: boolean; skipped: ToolId[] } {
  const configPath = join(projectDir, '.codeloop/config.yaml');
  if (tools.length === 0 || !existsSync(configPath)) return { changed: false, skipped: [] };
  const text = readFileSync(configPath, 'utf-8');
  if ((parseYaml(text) as { agents?: unknown } | null)?.agents) return { changed: false, skipped: [] };

  const anyOnPath = tools.some(t => commandOnPath(AGENT_BINARY[t]));
  const skipped: ToolId[] = [];
  const selected = tools.filter(t => {
    if (t !== 'cursor') return true;
    if (commandOnPath(AGENT_BINARY.cursor) || !anyOnPath) return true;
    skipped.push('cursor');
    return false;
  });
  if (selected.length === 0) return { changed: false, skipped };

  const lines = [
    '# Written by `codeloop init`; edit by hand after this, init will not overwrite it.',
    'agents:',
    `  default: ${selected[0]}`,
    ...selected.flatMap(t => {
      const onPath = commandOnPath(AGENT_BINARY[t]);
      return [
        `  ${t}:`,
        `    cmd: ${JSON.stringify(agentCmd(t, onPath))}${onPath ? '' : `  # ${t} was not found on PATH`}`,
        `    timeout_minutes: ${AGENT_TIMEOUT_MINUTES}`,
        `    max_runs_per_day: ${AGENT_MAX_RUNS_PER_DAY}`,
      ];
    }),
  ];
  writeFileSync(configPath, insertAgentsBlock(text, lines.join('\n')));
  return { changed: true, skipped };
}

// The starter ships a commented example from `# agents:` to `# run:`; the real block replaces just
// that span so it lands where the starter already documents it. Falls back to appending at the end.
function insertAgentsBlock(text: string, block: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex(l => l.trim() === '# agents:');
  if (start < 0) return `${text.trimEnd()}\n\n${block}\n`;
  let end = start + 1;
  while (end < lines.length && lines[end].trim() !== '# run:') end++;
  return [...lines.slice(0, start), block, ...lines.slice(end)].join('\n');
}
