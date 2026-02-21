/**
 * Skill installer — downloads, validates, and scaffolds skills into the project.
 */

import fse from 'fs-extra';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { validateSecurity } from './security.js';
import { parseSkillFile } from './skill-schema.js';
import { loadLockfile, saveLockfile, lockSkill, computeIntegrity, type LockedSkill } from './lockfile.js';
import { detectTools, type ToolId } from '../lib/detect.js';

const { existsSync, readFileSync, writeFileSync, ensureDirSync, copySync } = fse;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = join(__dirname, '..', '..');

export interface InstallResult {
  success: boolean;
  name: string;
  version: string;
  files: string[];
  error?: string;
}

/**
 * Get tool-specific destination paths for a skill.
 */
function getSkillDestinations(name: string, tools: ToolId[]): string[] {
  const destinations: string[] = [];

  if (tools.includes('claude')) {
    destinations.push(`.claude/commands/${name}.md`);
  }
  if (tools.includes('cursor')) {
    destinations.push(`.cursor/commands/${name}.md`);
  }
  if (tools.includes('codex')) {
    destinations.push(`.agents/skills/${name}/SKILL.md`);
  }

  return destinations;
}

/**
 * Install a skill from a local file path.
 */
export function installFromLocal(projectDir: string, sourcePath: string): InstallResult {
  if (!existsSync(sourcePath)) {
    return { success: false, name: '', version: '', files: [], error: `File not found: ${sourcePath}` };
  }

  const content = readFileSync(sourcePath, 'utf-8');
  return installFromContent(projectDir, content, `local:${sourcePath}`);
}

/**
 * Install a skill from its raw content string.
 */
export function installFromContent(
  projectDir: string,
  content: string,
  source: string,
  tier: LockedSkill['tier'] = 'unreviewed',
): InstallResult {
  // 1. Parse the skill
  let parsed;
  try {
    parsed = parseSkillFile(content);
  } catch (e: any) {
    return { success: false, name: '', version: '', files: [], error: e.message };
  }

  // 2. Security validation (always re-validate locally)
  const security = validateSecurity(content);
  if (!security.passed) {
    const blocked = security.findings.filter(f => f.severity === 'block');
    const messages = blocked.map(f => `  Line ${f.line}: ${f.message}`).join('\n');
    return {
      success: false,
      name: parsed.manifest.name,
      version: parsed.manifest.version,
      files: [],
      error: `Security validation failed:\n${messages}`,
    };
  }

  // 3. Detect installed tools
  const tools = detectTools(projectDir);
  if (tools.length === 0) {
    // Default to claude if no tools detected
    tools.push('claude');
  }

  // 4. Copy to tool-specific destinations
  const destinations = getSkillDestinations(parsed.manifest.name, tools as ToolId[]);
  const installedFiles: string[] = [];

  for (const dest of destinations) {
    const fullPath = join(projectDir, dest);
    ensureDirSync(dirname(fullPath));
    writeFileSync(fullPath, content, 'utf-8');
    installedFiles.push(dest);
  }

  // 5. Update lockfile
  const lockfile = loadLockfile(projectDir);
  const integrity = computeIntegrity(content);
  const updated = lockSkill(lockfile, parsed.manifest.name, {
    version: parsed.manifest.version,
    source,
    tier,
    installed: new Date().toISOString().split('T')[0],
    integrity,
    files: installedFiles,
  });
  saveLockfile(projectDir, updated);

  return {
    success: true,
    name: parsed.manifest.name,
    version: parsed.manifest.version,
    files: installedFiles,
  };
}

/**
 * Install a built-in skill from the package templates.
 */
export function installBuiltin(projectDir: string, name: string): InstallResult {
  const templatePath = join(PACKAGE_ROOT, `templates/commands/${name}.md`);
  if (!existsSync(templatePath)) {
    return { success: false, name, version: '', files: [], error: `Built-in skill not found: ${name}` };
  }

  const content = readFileSync(templatePath, 'utf-8');
  return installFromContent(projectDir, content, `builtin:${name}`, 'trusted');
}

/**
 * Uninstall a skill — remove files and lockfile entry.
 */
export function uninstallSkill(projectDir: string, name: string): { success: boolean; removed: string[] } {
  const lockfile = loadLockfile(projectDir);
  const entry = lockfile.installed[name];

  if (!entry) {
    return { success: false, removed: [] };
  }

  const removed: string[] = [];
  for (const filePath of entry.files) {
    const fullPath = join(projectDir, filePath);
    if (existsSync(fullPath)) {
      fse.removeSync(fullPath);
      removed.push(filePath);
    }
  }

  // Remove from lockfile
  const { [name]: _, ...rest } = lockfile.installed;
  saveLockfile(projectDir, { installed: rest });

  return { success: true, removed };
}
