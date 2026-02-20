import fse from 'fs-extra';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const { copySync, ensureDirSync, existsSync, readFileSync } = fse;

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
 * Cursor:      .cursor/commands/*.md (same format — Cursor supports this natively)
 * Codex:       .agents/skills/<name>/SKILL.md (YAML frontmatter with name/description)
 */
function getCommandDestinations(tools: ToolId[]): ScaffoldFile[] {
  const commands = ['plan', 'manage', 'commit', 'reflect'];
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

function getKnowledgeFiles(): ScaffoldFile[] {
  return [
    { source: 'templates/codeloop/rules.md', destination: '.codeloop/rules.md', overwrite: false },
    { source: 'templates/codeloop/gotchas.md', destination: '.codeloop/gotchas.md', overwrite: false },
    { source: 'templates/codeloop/patterns.md', destination: '.codeloop/patterns.md', overwrite: false },
    { source: 'templates/codeloop/principles.md', destination: '.codeloop/principles.md', overwrite: false },
    { source: 'templates/tasks/todo.md', destination: 'tasks/todo.md', overwrite: false },
  ];
}

export function scaffold(projectDir: string, starterFile: string, tools: ToolId[]): ScaffoldResult {
  const result: ScaffoldResult = { created: [], skipped: [] };

  // 1. Copy command files to tool-specific directories
  const commandFiles = getCommandDestinations(tools);
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

  // 3. Copy starter config → .codeloop/config.yaml
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
