/**
 * Where codeloop keeps what it writes. This module is the only place that knows; every other module
 * asks it, and a layering test fails on a root-relative specs, evidence, shape or usecases path
 * anywhere else.
 *
 * `store.layout: dotfolder`, the default: everything under `.codeloop/` (specs, evidence, shape, use
 * cases, mocks, artifacts), so codeloop never writes into the project's source tree. `root`: the
 * pre-0.5 layout with `specs/`, `evidence/`, `shape/`, `usecases/`, `docs/mocks` and `docs/artifacts`
 * at the repo root, kept for repos that cannot move yet and announced on every command. A project
 * that sets neither but still has root-level `specs/` or `evidence/` (and no `.codeloop/specs`) is
 * read as `root`, so an upgrade never strands its board; `codeloop store move --layout dotfolder`
 * moves it.
 */
import { existsSync, lstatSync, readdirSync } from 'fs';
import { join } from 'path';
import { loadConfig } from './config.js';

export type Layout = 'dotfolder' | 'root';
export type StoryFolder = 'specs' | 'evidence' | 'shape' | 'usecases' | 'mocks' | 'artifacts';

const ROOT: Record<StoryFolder, string> = {
  specs: 'specs',
  evidence: 'evidence',
  shape: 'shape',
  usecases: 'usecases',
  mocks: 'docs/mocks',
  artifacts: 'docs/artifacts',
};

const DOT: Record<StoryFolder, string> = {
  specs: '.codeloop/specs',
  evidence: '.codeloop/evidence',
  shape: '.codeloop/shape',
  usecases: '.codeloop/usecases',
  // Older per-topic mocks; a card's own mock sits beside its spec, the gallery in .codeloop/mocks.
  mocks: '.codeloop/mocks/archive',
  artifacts: '.codeloop/artifacts',
};

export const FOLDERS = Object.keys(ROOT) as StoryFolder[];

const isDir = (p: string) => {
  try {
    return lstatSync(p).isDirectory() || lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};

/** The layout a project uses: `store.layout` when set, else `root` for a project still holding root-level story folders, else `dotfolder`. */
export function layout(projectDir: string): Layout {
  const store = (loadConfig(projectDir) as { store?: { layout?: unknown } }).store;
  const set = store && typeof store === 'object' ? store.layout : undefined;
  if (set === 'root' || set === 'dotfolder') return set;
  const legacy = isDir(join(projectDir, 'specs')) || isDir(join(projectDir, 'evidence'));
  return legacy && !existsSync(join(projectDir, DOT.specs)) ? 'root' : 'dotfolder';
}

/** True when the project's layout came from its folders, not from `store.layout`. */
export function layoutInferred(projectDir: string): boolean {
  const store = (loadConfig(projectDir) as { store?: { layout?: unknown } }).store;
  return !(store && typeof store === 'object' && (store.layout === 'root' || store.layout === 'dotfolder'));
}

/** A story folder relative to the project root, for this project's layout. */
export function folder(projectDir: string, kind: StoryFolder): string {
  return (layout(projectDir) === 'root' ? ROOT : DOT)[kind];
}

/** The same folder in a named layout: what `store move --layout` moves from and to. */
export const folderIn = (which: Layout, kind: StoryFolder): string => (which === 'root' ? ROOT : DOT)[kind];

export const specsDir = (projectDir: string) => folder(projectDir, 'specs');
export const evidenceDir = (projectDir: string) => folder(projectDir, 'evidence');
export const shapeDir = (projectDir: string) => folder(projectDir, 'shape');
export const usecasesDir = (projectDir: string) => folder(projectDir, 'usecases');
export const mocksArchiveDir = (projectDir: string) => folder(projectDir, 'mocks');
export const artifactsDir = (projectDir: string) => folder(projectDir, 'artifacts');

/** `evidence/<nnn>` or `.codeloop/evidence/<nnn>`. */
export const evidenceOf = (projectDir: string, nnn: string) => `${evidenceDir(projectDir)}/${nnn}`;
export const usecasesOf = (projectDir: string, nnn: string) => `${usecasesDir(projectDir)}/${nnn}`;

/**
 * The layout a card's own paths say, for callers with no project at hand: a spec recorded under
 * `.codeloop/` is dotfolder, a root-level one is root, and a card with none is the default.
 */
export function layoutOfSpec(spec: string | undefined): Layout {
  if (!spec) return 'dotfolder';
  return spec.startsWith('.codeloop/') ? 'dotfolder' : 'root';
}

/** The one-line notice a root-layout project gets on every command. */
export function legacyNotice(projectDir: string): string | undefined {
  if (layout(projectDir) !== 'root') return undefined;
  return 'codeloop: this project keeps specs/, evidence/ and shape/ at the repo root (the legacy layout, removed in 0.7); `codeloop store move --layout dotfolder --dry-run` shows the move to .codeloop/';
}

/** Root-level story folders still holding content: what `codeloop doctor` reports as the legacy layout. */
export function legacyFolders(projectDir: string): string[] {
  return (['specs', 'evidence', 'shape', 'usecases'] as const)
    .map(k => ROOT[k])
    .filter(dir => {
      const full = join(projectDir, dir);
      if (!isDir(full)) return false;
      // The pointer README `store move --layout dotfolder` leaves is not content.
      return readdirSync(full).some(f => f !== 'README.md');
    });
}
