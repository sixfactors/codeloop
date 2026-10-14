import { specPath, workDir } from './project-root.js';
import { loadConfig } from './config.js';
import { existsSync, readFileSync } from 'fs';
import { isAbsolute, join, relative } from 'path';
import { cardKey, type Card } from './cards.js';

/**
 * The `## Files` list in a card's plan.md, one path per `- ` line. Undefined when the section is
 * missing or empty: a plan that names no files is not enforced, only warned about (the guard
 * hooks and the pre-commit check both treat undefined as "nothing to check against").
 */
export function planFiles(projectDir: string, card: Card): string[] | undefined {
  if (!card.spec) return undefined;
  const planPath = specPath(projectDir, card.spec, 'plan.md');
  if (!existsSync(planPath)) return undefined;
  const text = readFileSync(planPath, 'utf-8');
  // Every `## Files` section counts: the template ships one empty, and a second one appended
  // below it is the common way a person adds the list.
  // The section runs to the next `## ` heading or the end of the file; a `$` under the m flag would
  // stop it at the end of its first line, keeping only the first file.
  const files = [...text.matchAll(/^## Files[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)]
    .flatMap(m => m[1].split('\n'))
    .map(line => /^-\s+(.+)$/.exec(line.trim())?.[1]?.trim())
    .map(entry => (entry ? planEntryPath(entry) : undefined))
    .filter((f): f is string => Boolean(f));
  return files.length ? files : undefined;
}

/**
 * The path in one `## Files` line. Plans write paths as code (`` `src/a.ts` ``) and often follow
 * them with a note (`(new)`, `: why`), so a literal comparison never matched a planned file.
 */
function planEntryPath(entry: string): string | undefined {
  const quoted = /^`([^`]+)`/.exec(entry);
  const raw = quoted ? quoted[1] : entry.split(/\s+|:\s/)[0];
  const path = raw.trim().replace(/^\.\//, '').replace(/[:,;]$/, '');
  return path || undefined;
}

/** True when `path` (absolute under the project, or already relative to it) is inside one of `files`: an exact path, a folder, or a glob. */
export function pathInPlan(projectDir: string, files: string[], path: string): boolean {
  const rel = (isAbsolute(path) ? relative(workDir(projectDir), path) : path).replace(/^\.\//, '');
  return files.some(entry => {
    const f = entry.replace(/\/$/, '');
    if (/[*?]/.test(f)) return globToRegExp(f).test(rel);
    return rel === f || rel.startsWith(`${f}/`) || f.startsWith(`${rel}/`);
  });
}

/**
 * Files every story may touch by design (shared Makefiles, generated indexes, OpenAPI files), from
 * `leases.shared` in .codeloop/config.yaml: exact paths, folders, or globs with `*` and `**`. A
 * story's plan never leases these, so another session editing one is not refused.
 */
export function isSharedPath(projectDir: string, path: string): boolean {
  const shared = (loadConfig(projectDir).leases?.shared ?? []) as unknown[];
  const rel = isAbsolute(path) ? relative(workDir(projectDir), path) : path;
  return shared.filter((p): p is string => typeof p === 'string' && p.trim() !== '').some(pattern => {
    if (!/[*?]/.test(pattern)) return rel === pattern || rel.startsWith(`${pattern.replace(/\/$/, '')}/`);
    return globToRegExp(pattern).test(rel);
  });
}

const SPECIAL = '.+^$(){}|[]\\';

// `*` matches within one path segment, a double star across segments (a double star followed by a
// slash also matches no folder at all), `?` one character.
function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { out += '(?:.*/)?'; i += 2; } else { out += '.*'; i += 1; }
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else out += SPECIAL.includes(c) ? `\\${c}` : c;
  }
  return new RegExp(`^${out}$`);
}

/**
 * Paths the plan check never governs: anything outside the repo (a session's scratch notes), the
 * codeloop folder itself, and the story's own working papers (its spec folder, evidence, use cases).
 * The plan lists the source files a story changes, not where its author drafts.
 */
export function outsidePlanScope(projectDir: string, card: Card, path: string): boolean {
  const abs = isAbsolute(path) ? path : specPath(projectDir, path);
  const rel = relative(workDir(projectDir), abs);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return rel !== '';
  const nnn = cardKey(card);
  const own = ['.codeloop/', `evidence/${nnn}/`, `usecases/${nnn}/`, `shape/${card.id}/`, ...(card.spec ? [`${card.spec.replace(/\/$/, '')}/`] : [])];
  return own.some(prefix => rel === prefix.slice(0, -1) || rel.startsWith(prefix));
}
