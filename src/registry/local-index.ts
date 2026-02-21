/**
 * Local skill index — shipped with the npm package.
 * Provides offline skill discovery without needing the registry API.
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = join(__dirname, '..', '..');

export interface IndexEntry {
  name: string;
  version: string;
  description: string;
  author: string;
  tags: string[];
  stack: string;
  tier: 'trusted' | 'community' | 'unreviewed';
  source: 'builtin' | 'registry';
}

export interface LocalIndex {
  version: number;
  updatedAt: string;
  skills: IndexEntry[];
}

/**
 * Load the local index from the package.
 */
export function loadLocalIndex(): LocalIndex {
  const indexPath = join(PACKAGE_ROOT, 'registry', 'index.json');
  if (!existsSync(indexPath)) {
    return { version: 1, updatedAt: new Date().toISOString(), skills: [] };
  }

  try {
    const content = readFileSync(indexPath, 'utf-8');
    return JSON.parse(content) as LocalIndex;
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), skills: [] };
  }
}

/**
 * Search the local index by keyword.
 * Matches against name, description, and tags.
 */
export function searchLocalIndex(index: LocalIndex, query: string): IndexEntry[] {
  const lower = query.toLowerCase();
  const terms = lower.split(/\s+/).filter(Boolean);

  return index.skills
    .map(skill => {
      let score = 0;
      const searchable = `${skill.name} ${skill.description} ${skill.tags.join(' ')}`.toLowerCase();

      for (const term of terms) {
        if (skill.name.includes(term)) score += 3;         // Name match is strongest
        if (skill.tags.some(t => t.includes(term))) score += 2;  // Tag match
        if (searchable.includes(term)) score += 1;          // Description match
      }

      return { skill, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ skill }) => skill);
}

/**
 * Find a skill by exact name in the local index.
 */
export function findInLocalIndex(index: LocalIndex, name: string): IndexEntry | undefined {
  return index.skills.find(s => s.name === name);
}
