import { existsSync } from 'fs';
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
