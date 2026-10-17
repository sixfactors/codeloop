/**
 * Every project the hub knows about: `~/.codeloop/projects.json` (`CODELOOP_HOME` overrides the
 * root, for tests and for anyone who wants it elsewhere). `codeloop init` and `codeloop serve`
 * register the current project; `codeloop projects list|remove` manage the list by hand. A
 * project whose path no longer exists stays listed, flagged `missing`, never dropped silently.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { basename, dirname, join, resolve } from 'path';
import { withLock } from './lock.js';

export interface RegisteredProject {
  id: string;
  name: string;
  path: string;
  addedAt: string;
}

export interface ListedProject extends RegisteredProject {
  missing: boolean;
}

export const codeloopHome = (): string => process.env.CODELOOP_HOME ?? join(homedir(), '.codeloop');
const registryPath = () => join(codeloopHome(), 'projects.json');

const slugify = (name: string): string => {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'project';
};

export function readRegistry(): RegisteredProject[] {
  const file = registryPath();
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8'));
    return Array.isArray(parsed) ? (parsed as RegisteredProject[]) : [];
  } catch {
    return [];
  }
}

function writeRegistry(projects: RegisteredProject[]): void {
  const file = registryPath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(projects, null, 2)}\n`);
}

/**
 * Registers `dir`, keyed by its resolved path: registering the same project again (every `serve`
 * does) updates its name in place rather than duplicating the entry. A new project's id is a slug
 * of its name, made unique with a numeric suffix; that id is never reused, even once the project
 * is removed, so an old link never comes to resolve to a different project.
 */
export function registerProject(dir: string, name?: string): RegisteredProject {
  const resolved = resolve(dir);
  const projects = readRegistry();
  const existing = projects.find(p => resolve(p.path) === resolved);
  const wanted = name?.trim() || basename(resolved);
  if (existing) {
    if (wanted && existing.name !== wanted) existing.name = wanted;
    writeRegistry(projects);
    return existing;
  }
  const taken = new Set(projects.map(p => p.id));
  let id = slugify(wanted);
  let n = 2;
  while (taken.has(id)) id = `${slugify(wanted)}-${n++}`;
  const entry: RegisteredProject = { id, name: wanted, path: resolved, addedAt: new Date().toISOString() };
  writeRegistry([...projects, entry]);
  return entry;
}

export const listProjects = (): ListedProject[] => readRegistry().map(p => ({ ...p, missing: !existsSync(p.path) }));

export const findProject = (id: string): RegisteredProject | undefined => readRegistry().find(p => p.id === id);

export function removeProject(id: string): boolean {
  const projects = readRegistry();
  const next = projects.filter(p => p.id !== id);
  if (next.length === projects.length) return false;
  writeRegistry(next);
  return true;
}

/**
 * `codeloop projects prune`: the entries whose folder is gone, removed unless `dryRun`. The registry
 * is shared by every project on the machine, so the read, the check and the write hold its lock.
 */
export function pruneProjects(opts: { dryRun: boolean }): RegisteredProject[] {
  mkdirSync(codeloopHome(), { recursive: true });
  return withLock(registryPath(), () => {
    const projects = readRegistry();
    const gone = projects.filter(p => !existsSync(p.path));
    if (!opts.dryRun && gone.length) writeRegistry(projects.filter(p => existsSync(p.path)));
    return gone;
  });
}
