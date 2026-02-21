import { Command } from 'commander';
import chalk from 'chalk';
import fse from 'fs-extra';

const { existsSync, readFileSync } = fse;
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseVersion, compareVersions } from '../lib/version.js';
import { parse as parseYaml } from 'yaml';
import { loadBoard } from '../lib/board.js';
import { getServeStatus } from './serve.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = join(__dirname, '..', '..');

interface SkillStatus {
  name: string;
  tools: { tool: string; version: string | null }[];
  latest: string | null;
}

interface KnowledgeStats {
  file: string;
  exists: boolean;
  entries: number;
  freqDistribution: Record<string, number>;
  highFreqEntries: string[];
}

function countEntries(content: string): number {
  return (content.match(/^### /gm) || []).length;
}

function parseFrequencies(content: string): { distribution: Record<string, number>; highFreq: string[] } {
  const distribution: Record<string, number> = {};
  const highFreq: string[] = [];
  const regex = /^### \[freq:(\d+)\]\s*(.+)$/gm;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const freq = parseInt(match[1], 10);
    const name = match[2].trim();
    const bucket = freq >= 10 ? '10+' : freq >= 3 ? '3-9' : '1-2';
    distribution[bucket] = (distribution[bucket] || 0) + 1;

    if (freq >= 10) {
      highFreq.push(`[freq:${freq}] ${name}`);
    }
  }

  return { distribution, highFreq };
}

function getSkillStatuses(projectDir: string): SkillStatus[] {
  const skills = ['design', 'plan', 'manage', 'test', 'commit', 'qa', 'deploy', 'debug', 'reflect', 'ship'];
  const toolPaths: { tool: string; pathFn: (name: string) => string }[] = [
    { tool: 'claude', pathFn: (n) => `.claude/commands/${n}.md` },
    { tool: 'cursor', pathFn: (n) => `.cursor/commands/${n}.md` },
    { tool: 'codex', pathFn: (n) => `.agents/skills/${n}/SKILL.md` },
  ];

  return skills.map(name => {
    const templatePath = join(PACKAGE_ROOT, `templates/commands/${name}.md`);
    const latest = existsSync(templatePath)
      ? parseVersion(readFileSync(templatePath, 'utf-8'))
      : null;

    const tools: { tool: string; version: string | null }[] = [];
    for (const { tool, pathFn } of toolPaths) {
      const fullPath = join(projectDir, pathFn(name));
      if (existsSync(fullPath)) {
        const version = parseVersion(readFileSync(fullPath, 'utf-8'));
        tools.push({ tool, version });
      }
    }

    return { name, tools, latest };
  });
}

function getKnowledgeStats(projectDir: string, filename: string): KnowledgeStats {
  const filePath = join(projectDir, '.codeloop', filename);
  if (!existsSync(filePath)) {
    return { file: filename, exists: false, entries: 0, freqDistribution: {}, highFreqEntries: [] };
  }

  const content = readFileSync(filePath, 'utf-8');
  const entries = countEntries(content);
  const { distribution, highFreq } = parseFrequencies(content);

  return { file: filename, exists: true, entries, freqDistribution: distribution, highFreqEntries: highFreq };
}

const KNOWN_TOP_LEVEL_KEYS = new Set([
  'project', 'scopes', 'quality_checks', 'diff_scan', 'test', 'deploy',
  'debug', 'commit', 'codeloop', 'watch',
]);

const COMMON_TYPOS: Record<string, string> = {
  'quality_check': 'quality_checks',
  'qualityChecks': 'quality_checks',
  'qualitychecks': 'quality_checks',
  'diff_scans': 'diff_scan',
  'diffScan': 'diff_scan',
  'scope': 'scopes',
  'deployment': 'deploy',
  'debugging': 'debug',
  'testing': 'test',
  'commits': 'commit',
  'watching': 'watch',
};

export function validateConfig(projectDir: string): string[] {
  const configPath = join(projectDir, '.codeloop/config.yaml');
  const issues: string[] = [];

  if (!existsSync(configPath)) {
    issues.push('No config.yaml found — run codeloop init');
    return issues;
  }

  let config: any;
  try {
    const content = readFileSync(configPath, 'utf-8');
    config = parseYaml(content);
  } catch {
    issues.push('config.yaml has invalid YAML syntax');
    return issues;
  }

  if (!config || typeof config !== 'object') {
    issues.push('config.yaml is empty or not an object');
    return issues;
  }

  // Check for typos in top-level keys
  for (const key of Object.keys(config)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      const suggestion = COMMON_TYPOS[key];
      if (suggestion) {
        issues.push(`Unknown key "${key}" — did you mean "${suggestion}"?`);
      } else {
        issues.push(`Unknown top-level key "${key}"`);
      }
    }
  }

  // project.name
  if (!config.project?.name) {
    issues.push('project.name is not set');
  }

  // scopes
  if (!config.scopes || Object.keys(config.scopes).length === 0) {
    issues.push('No scopes defined — /commit review will load all knowledge (not scoped)');
  } else {
    for (const [name, scope] of Object.entries(config.scopes) as [string, any][]) {
      if (!scope.paths || !Array.isArray(scope.paths) || scope.paths.length === 0) {
        issues.push(`Scope "${name}" has no paths — it will never match any files`);
      }
    }
  }

  // quality_checks
  if (!config.quality_checks || Object.keys(config.quality_checks).length === 0) {
    issues.push('No quality_checks defined — /commit will skip build/type checks');
  } else {
    for (const [scope, checks] of Object.entries(config.quality_checks) as [string, any][]) {
      if (Array.isArray(checks)) {
        for (const check of checks) {
          if (!check.name) {
            issues.push(`quality_checks.${scope} has a check without a name`);
          }
          if (!check.command) {
            issues.push(`quality_checks.${scope}.${check.name || '?'} has no command`);
          }
        }
      }
    }
  }

  // deploy: check for empty strings
  if (config.deploy) {
    for (const env of ['staging', 'production'] as const) {
      const envConfig = config.deploy[env];
      if (envConfig) {
        if (envConfig.command === '') {
          issues.push(`deploy.${env}.command is empty — /deploy will skip it. Remove or fill in.`);
        }
      }
    }
  }

  // test
  if (config.test && config.test.command === '') {
    issues.push('test.command is empty — /test will try to auto-detect');
  }

  return issues;
}

export const statusCommand = new Command('status')
  .description('Show codeloop status and knowledge stats')
  .action(() => {
    const projectDir = process.cwd();

    console.log();
    console.log(chalk.bold('Codeloop Status'));
    console.log();

    // Skills per tool
    console.log(chalk.bold('  Skills'));
    const skills = getSkillStatuses(projectDir);
    for (const skill of skills) {
      if (skill.tools.length === 0) {
        console.log(chalk.dim(`    ${skill.name}: not installed`));
        continue;
      }

      const toolStrs = skill.tools.map(t => {
        const needsUpdate = !!(skill.latest && t.version && compareVersions(t.version, skill.latest) < 0);
        if (needsUpdate) return chalk.yellow(`${t.tool}:${t.version}→${skill.latest}`);
        return chalk.green(`${t.tool}:${t.version || '?'}`);
      });

      console.log(`    ${skill.name}: ${toolStrs.join(', ')}`);
    }

    // Knowledge
    console.log();
    console.log(chalk.bold('  Knowledge'));
    const gotchas = getKnowledgeStats(projectDir, 'gotchas.md');
    const patterns = getKnowledgeStats(projectDir, 'patterns.md');
    const rules = getKnowledgeStats(projectDir, 'rules.md');

    for (const stats of [gotchas, patterns, rules]) {
      if (!stats.exists) {
        console.log(chalk.dim(`    ${stats.file}: not found`));
        continue;
      }

      const freqStr = Object.entries(stats.freqDistribution)
        .map(([bucket, count]) => `${bucket}: ${count}`)
        .join(', ');

      console.log(`    ${stats.file}: ${stats.entries} entries${freqStr ? ` (${freqStr})` : ''}`);
    }

    // High-frequency suggestions
    if (gotchas.highFreqEntries.length > 0) {
      console.log();
      console.log(chalk.bold('  Suggestions'));
      console.log(chalk.yellow(`    ${gotchas.highFreqEntries.length} gotcha(s) at freq >= 10 — consider promoting to rules.md:`));
      for (const entry of gotchas.highFreqEntries) {
        console.log(chalk.yellow(`      - ${entry}`));
      }
    }

    // Board stats
    const board = loadBoard(projectDir);
    if (board.tasks.length > 0) {
      console.log();
      console.log(chalk.bold('  Board'));
      const byStatus: Record<string, number> = {};
      for (const task of board.tasks) {
        byStatus[task.status] = (byStatus[task.status] || 0) + 1;
      }
      const statusStr = Object.entries(byStatus)
        .map(([status, count]) => `${status}: ${count}`)
        .join(', ');
      console.log(`    ${board.tasks.length} tasks (${statusStr})`);
    } else if (existsSync(join(projectDir, '.codeloop', 'board.json'))) {
      console.log();
      console.log(chalk.bold('  Board'));
      console.log(chalk.dim('    No tasks yet'));
    }

    // Serve status
    const serveStatus = getServeStatus(projectDir);
    if (serveStatus.running) {
      console.log(chalk.green(`    Server: running (PID ${serveStatus.pid})`));
    } else if (existsSync(join(projectDir, '.codeloop', 'board.json'))) {
      console.log(chalk.dim('    Server: not running'));
    }

    // Config validation
    const issues = validateConfig(projectDir);
    if (issues.length > 0) {
      console.log();
      console.log(chalk.bold('  Config Issues'));
      for (const issue of issues) {
        console.log(chalk.red(`    ! ${issue}`));
      }
    }

    console.log();
  });
