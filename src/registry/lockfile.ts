/**
 * Lockfile management for installed skills.
 * Tracks installed skills with versions, sources, and integrity hashes.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const LOCKFILE_PATH = '.codeloop/skills.lock';

export interface LockedSkill {
  version: string;
  source: string;              // "registry:<name>" or "github:user/repo" or "local:<path>"
  tier: 'trusted' | 'community' | 'unreviewed';
  installed: string;           // ISO date
  integrity: string;           // sha256 hash
  files: string[];             // Installed file paths relative to project root
}

export interface Lockfile {
  installed: Record<string, LockedSkill>;
}

/**
 * Compute sha256 integrity hash for skill content.
 */
export function computeIntegrity(content: string): string {
  return `sha256-${createHash('sha256').update(content, 'utf-8').digest('hex').slice(0, 12)}`;
}

/**
 * Load the lockfile from the project directory.
 * Returns an empty lockfile if it doesn't exist.
 */
export function loadLockfile(projectDir: string): Lockfile {
  const lockPath = join(projectDir, LOCKFILE_PATH);
  if (!existsSync(lockPath)) {
    return { installed: {} };
  }

  try {
    const content = readFileSync(lockPath, 'utf-8');
    const parsed = parseYaml(content);
    return {
      installed: parsed?.installed ?? {},
    };
  } catch {
    return { installed: {} };
  }
}

/**
 * Save the lockfile to the project directory.
 */
export function saveLockfile(projectDir: string, lockfile: Lockfile): void {
  const lockPath = join(projectDir, LOCKFILE_PATH);
  const lockDir = dirname(lockPath);

  if (!existsSync(lockDir)) {
    mkdirSync(lockDir, { recursive: true });
  }

  const content = stringifyYaml(lockfile, { lineWidth: 120 });
  writeFileSync(lockPath, content, 'utf-8');
}

/**
 * Add or update a skill in the lockfile.
 */
export function lockSkill(
  lockfile: Lockfile,
  name: string,
  entry: LockedSkill,
): Lockfile {
  return {
    installed: {
      ...lockfile.installed,
      [name]: entry,
    },
  };
}

/**
 * Remove a skill from the lockfile.
 */
export function unlockSkill(lockfile: Lockfile, name: string): Lockfile {
  const { [name]: _, ...rest } = lockfile.installed;
  return { installed: rest };
}

/**
 * Check if a skill's installed files match their integrity hash.
 */
export function verifyIntegrity(projectDir: string, name: string, lockfile: Lockfile): boolean {
  const entry = lockfile.installed[name];
  if (!entry) return false;

  // Check that at least one installed file exists and matches
  for (const filePath of entry.files) {
    const fullPath = join(projectDir, filePath);
    if (!existsSync(fullPath)) return false;

    const content = readFileSync(fullPath, 'utf-8');
    const hash = computeIntegrity(content);
    if (hash !== entry.integrity) return false;
  }

  return true;
}
