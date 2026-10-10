import { existsSync, readFileSync } from 'fs';
import { isAbsolute, join, relative } from 'path';
import type { Card } from './cards.js';

/**
 * The `## Files` list in a card's plan.md, one path per `- ` line. Undefined when the section is
 * missing or empty: a plan that names no files is not enforced, only warned about (the guard
 * hooks and the pre-commit check both treat undefined as "nothing to check against").
 */
export function planFiles(projectDir: string, card: Card): string[] | undefined {
  if (!card.spec) return undefined;
  const planPath = join(projectDir, card.spec, 'plan.md');
  if (!existsSync(planPath)) return undefined;
  const text = readFileSync(planPath, 'utf-8');
  // Every `## Files` section counts: the template ships one empty, and a second one appended
  // below it is the common way a person adds the list.
  const files = [...text.matchAll(/^## Files\s*\n([\s\S]*?)(?=\n## |\s*$)/gm)]
    .flatMap(m => m[1].split('\n'))
    .map(line => /^-\s+(.+)$/.exec(line.trim())?.[1]?.trim())
    .filter((f): f is string => Boolean(f));
  return files.length ? files : undefined;
}

/** True when `path` (absolute under the project, or already relative to it) is inside one of `files`. */
export function pathInPlan(projectDir: string, files: string[], path: string): boolean {
  const rel = isAbsolute(path) ? relative(projectDir, path) : path;
  return files.some(f => rel === f || rel.startsWith(`${f}/`) || f.startsWith(`${rel}/`));
}
