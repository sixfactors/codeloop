import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export type StackId = 'node-typescript' | 'python' | 'go' | 'generic';
export type ToolId = 'claude' | 'cursor' | 'codex';

interface DetectionRule {
  stack: StackId;
  files: string[];
  description: string;
}

const rules: DetectionRule[] = [
  {
    stack: 'node-typescript',
    files: ['tsconfig.json'],
    description: 'TypeScript (Node.js)',
  },
  {
    stack: 'python',
    files: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile'],
    description: 'Python',
  },
  {
    stack: 'go',
    files: ['go.mod'],
    description: 'Go',
  },
];

export interface DetectionResult {
  stack: StackId;
  description: string;
  matchedFile: string | null;
}

export function detectStack(projectDir: string): DetectionResult {
  for (const rule of rules) {
    for (const file of rule.files) {
      if (existsSync(join(projectDir, file))) {
        return {
          stack: rule.stack,
          description: rule.description,
          matchedFile: file,
        };
      }
    }
  }

  return {
    stack: 'generic',
    description: 'Generic project',
    matchedFile: null,
  };
}

/**
 * Detect which AI coding tools are present in the project.
 * Looks for tool-specific directories.
 */
export function detectTools(projectDir: string): ToolId[] {
  const detected: ToolId[] = [];

  // Claude Code: .claude/ directory or CLAUDE.md
  if (existsSync(join(projectDir, '.claude')) || existsSync(join(projectDir, 'CLAUDE.md'))) {
    detected.push('claude');
  }

  // Cursor: .cursor/ directory or .cursorrules
  if (existsSync(join(projectDir, '.cursor')) || existsSync(join(projectDir, '.cursorrules'))) {
    detected.push('cursor');
  }

  // Codex: .codex/ directory or AGENTS.md or .agents/
  if (
    existsSync(join(projectDir, '.codex')) ||
    existsSync(join(projectDir, 'AGENTS.md')) ||
    existsSync(join(projectDir, '.agents'))
  ) {
    detected.push('codex');
  }

  return detected;
}

/** What `codeloop init` reads out of package.json and the lockfiles, and what it writes from that. */
export interface ProjectDetection {
  stack: DetectionResult;
  tools: ToolId[];
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | null;
  /** The known frameworks and test tools among the dependencies, in this order. */
  frameworks: string[];
  scripts: { test?: string; lint?: string; build?: string };
  /** What goes under `quality_checks:` in config.yaml. */
  qualityChecks: { name: string; command: string }[];
  /** What replaces `npm test` in the build lane's build stage. */
  testCommand?: string;
}

const FRAMEWORKS: [string, string[]][] = [
  ['next', ['next']],
  ['express', ['express']],
  ['fastify', ['fastify']],
  ['nest', ['@nestjs/core', '@nestjs/common']],
  ['react', ['react']],
  ['vite', ['vite']],
  ['vitest', ['vitest']],
  ['jest', ['jest']],
  ['playwright', ['@playwright/test', 'playwright']],
];

const LOCKFILES: [ProjectDetection['packageManager'], string][] = [
  ['pnpm', 'pnpm-lock.yaml'],
  ['yarn', 'yarn.lock'],
  ['bun', 'bun.lockb'],
  ['bun', 'bun.lock'],
  ['npm', 'package-lock.json'],
];

export function detectProject(projectDir: string): ProjectDetection {
  const out: ProjectDetection = { stack: detectStack(projectDir), tools: detectTools(projectDir), packageManager: null, frameworks: [], scripts: {}, qualityChecks: [] };
  const file = join(projectDir, 'package.json');
  if (!existsSync(file)) return out;
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> };
  try {
    pkg = JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return out;
  }
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  out.frameworks = FRAMEWORKS.filter(([, names]) => names.some(n => n in deps)).map(([id]) => id);
  out.packageManager = LOCKFILES.find(([, lock]) => existsSync(join(projectDir, lock)))?.[0] ?? 'npm';
  const pm = out.packageManager;
  const scripts = pkg.scripts ?? {};
  for (const name of ['test', 'lint', 'build'] as const) if (typeof scripts[name] === 'string' && scripts[name].trim()) out.scripts[name] = scripts[name];
  // `run` is what every manager accepts; `test` is special-cased by all of them too.
  if (out.scripts.lint) out.qualityChecks.push({ name: 'Lint', command: `${pm} run lint` });
  if ('typescript' in deps && existsSync(join(projectDir, 'tsconfig.json'))) out.qualityChecks.push({ name: 'Typecheck', command: 'npx tsc --noEmit' });
  if (out.scripts.build) out.qualityChecks.push({ name: 'Build', command: `${pm} run build` });
  if (out.scripts.test) out.testCommand = `${pm} test`;
  return out;
}
