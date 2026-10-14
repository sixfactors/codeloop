/**
 * Where a project's board and story files live (`store.home` in config.yaml). `repo`, the default:
 * in the repository, as always. `user`: under `~/.codeloop/projects/<id>/`, outside every checkout,
 * so the main tree and all of its worktrees read and write one board and one set of story files and
 * a builder's ticks never have to travel by merge. The wiki, lanes and config stay in the repo.
 *
 * In `user` mode each store path in the main tree is a symlink into the per-project folder, so every
 * reader keeps joining the project root as before; `ensureStoreLinks` makes them, and refuses while
 * a real repo copy still sits where a link belongs.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readlinkSync, realpathSync, rmSync, symlinkSync } from 'fs';
import { basename, dirname, join, relative, resolve } from 'path';
import { loadConfig } from './config.js';
import { codeloopHome, readRegistry } from './hub-registry.js';
import { RefusalError } from './cards.js';

export type StoreHome = 'repo' | 'user';

/** The board and story paths that move with `store.home`, relative to the project root. */
export const STORE_ITEMS = ['.codeloop/cards.json', '.codeloop/state', '.codeloop/mocks', 'specs', 'evidence', 'shape', 'docs/mocks'] as const;

export function storeHome(projectDir: string): StoreHome {
  const store = (loadConfig(projectDir) as { store?: { home?: unknown } }).store;
  return store && typeof store === 'object' && store.home === 'user' ? 'user' : 'repo';
}

/** The project's id: its hub registry id when it is registered, else the main tree's folder name. */
export function projectId(projectDir: string): string {
  const resolved = resolve(projectDir);
  const registered = readRegistry().find(p => resolve(p.path) === resolved);
  return registered?.id ?? (basename(resolved).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project');
}

export const userStoreDir = (projectDir: string): string => join(codeloopHome(), 'projects', projectId(projectDir));

/** The folder that holds the store: the project root for `repo`, the per-project folder for `user`. */
export const storeDir = (projectDir: string): string => (storeHome(projectDir) === 'user' ? userStoreDir(projectDir) : projectDir);

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** A path with a symlink at its end followed, so an atomic write (temp file, then rename) replaces the file it points at, not the link. */
export function followLink(path: string): string {
  if (!isLink(path)) return path;
  const target = resolve(dirname(path), readlinkSync(path));
  return existsSync(target) ? realpathSync(target) : target;
}

export interface StoreLink {
  item: string;
  path: string;
  target: string;
  state: 'linked' | 'created' | 'repo-copy';
}

/**
 * In `user` mode, makes each store path in the project a symlink into the per-project folder (the
 * folder's own copy is created empty when missing). A real file or folder still at a store path is
 * reported as `repo-copy` and left alone: `store move` copied it, and only the person deletes it.
 */
export function ensureStoreLinks(projectDir: string): StoreLink[] {
  if (storeHome(projectDir) !== 'user') return [];
  const home = userStoreDir(projectDir);
  const out: StoreLink[] = [];
  for (const item of STORE_ITEMS) {
    const path = join(projectDir, item);
    const target = join(home, item);
    if (isLink(path)) {
      out.push({ item, path, target, state: 'linked' });
      continue;
    }
    if (existsSync(path)) {
      out.push({ item, path, target, state: 'repo-copy' });
      continue;
    }
    if (!existsSync(target)) {
      if (item.endsWith('.json')) {
        mkdirSync(dirname(target), { recursive: true });
      } else mkdirSync(target, { recursive: true });
    }
    mkdirSync(dirname(path), { recursive: true });
    symlinkSync(relative(dirname(path), target) || target, path);
    out.push({ item, path, target, state: 'created' });
  }
  return out;
}

/** Refuses while a repo copy sits where a `user`-mode link belongs: the board would read the stale copy. */
export function assertStoreReady(projectDir: string): void {
  const copies = ensureStoreLinks(projectDir).filter(l => l.state === 'repo-copy');
  if (copies.length) {
    throw new RefusalError(`store.home is user, but repo copies are still at ${copies.map(c => c.item).join(', ')}; the board would read them instead of ${userStoreDir(projectDir)}. Delete them (\`rm -rf ${copies.map(c => c.item).join(' ')}\`) and run the command again`);
  }
}

export interface StoreWhere {
  home: StoreHome;
  dir: string;
  items: { item: string; path: string; resolved: string; link: boolean }[];
}

export function storeWhere(projectDir: string): StoreWhere {
  const home = storeHome(projectDir);
  return {
    home,
    dir: storeDir(projectDir),
    items: STORE_ITEMS.map(item => {
      const path = join(projectDir, item);
      return { item, path, resolved: home === 'user' ? join(userStoreDir(projectDir), item) : path, link: isLink(path) };
    }),
  };
}

export interface StoreMove {
  to: StoreHome;
  copied: string[];
  /** What the person deletes once they have checked the copy. */
  toDelete: string[];
}

/** Sets `store.home` in config.yaml, keeping every other line, other `store:` keys included, as written. */
function writeHome(home: StoreHome, readText: () => string, writeText: (text: string) => void): void {
  const lines = readText().replace(/\n*$/, '\n').split('\n');
  const at = lines.findIndex(l => /^store:\s*$/.test(l));
  if (at < 0) return writeText(`${lines.join('\n').replace(/\n*$/, '\n')}store:\n  home: ${home}\n`);
  let end = at + 1;
  while (end < lines.length && /^[ \t]+\S/.test(lines[end])) end++;
  const body = lines.slice(at + 1, end).filter(l => !/^[ \t]+home:/.test(l));
  writeText([...lines.slice(0, at), 'store:', `  home: ${home}`, ...body, ...lines.slice(end)].join('\n'));
}

/**
 * Copies every store path to the other home and flips `store.home`. The source copy is never
 * touched; the result names it for the person to delete. Moving to `repo` replaces the links with
 * real copies, which is the only change made at the source side.
 */
export function moveStore(projectDir: string, to: StoreHome, config: { read: () => string; write: (text: string) => void }): StoreMove {
  const from = storeHome(projectDir);
  if (from === to) throw new RefusalError(`store.home is already ${to}`);
  const home = userStoreDir(projectDir);
  const copied: string[] = [];
  const toDelete: string[] = [];
  for (const item of STORE_ITEMS) {
    const repoPath = join(projectDir, item);
    const userPath = join(home, item);
    if (to === 'user') {
      if (isLink(repoPath) || !existsSync(repoPath)) continue;
      mkdirSync(dirname(userPath), { recursive: true });
      cpSync(repoPath, userPath, { recursive: true, force: true, preserveTimestamps: true });
      copied.push(item);
      toDelete.push(item);
    } else {
      if (!existsSync(userPath)) continue;
      if (isLink(repoPath)) rmSync(repoPath);
      if (existsSync(repoPath)) throw new RefusalError(`${item} already exists in the repo; move it aside before \`store move --to repo\``);
      mkdirSync(dirname(repoPath), { recursive: true });
      cpSync(userPath, repoPath, { recursive: true, force: true, preserveTimestamps: true });
      copied.push(item);
      toDelete.push(userPath);
    }
  }
  writeHome(to, config.read, config.write);
  return { to, copied, toDelete };
}
