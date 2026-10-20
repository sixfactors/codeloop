import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Single-quoted for sh, so a path with spaces or quotes stays one word. */
const shq = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;

/**
 * The node running this process and the package's own bin folder. Hooks and MCP entries are
 * written with these: GUI hosts and GUI git clients start them with a bare PATH, where a bare
 * `codeloop` exits 127 and the guard passes without running.
 */
export function codeloopPaths(): { node: string; bin: string } {
  return { node: process.execPath, bin: join(PACKAGE_ROOT, 'bin') };
}

/** A hook command from the templates (`codeloop ...` or `codeloop-hook ...`) with absolute paths. */
export function absoluteCommand(command: string): string {
  const { node, bin } = codeloopPaths();
  const hook = /^codeloop-hook(\s|$)/.exec(command);
  if (hook) return `CODELOOP_NODE=${shq(node)} CODELOOP_BIN=${shq(join(bin, 'codeloop'))} ${shq(join(bin, 'codeloop-hook'))}${command.slice('codeloop-hook'.length)}`;
  if (/^codeloop(\s|$)/.test(command)) return `CODELOOP_NODE=${shq(node)} ${shq(join(bin, 'codeloop'))}${command.slice('codeloop'.length)}`;
  return command;
}

/** Every `command` string in a template entry, with absolute paths. */
function withPaths<T>(entry: T): T {
  if (Array.isArray(entry)) return entry.map(withPaths) as T;
  if (entry && typeof entry === 'object') return Object.fromEntries(Object.entries(entry).map(([k, v]) => [k, k === 'command' && typeof v === 'string' ? absoluteCommand(v) : withPaths(v)])) as T;
  return entry;
}

/** A git hook template with this install's node and codeloop paths written into it. */
function gitHookSource(name: string): string {
  const { node, bin } = codeloopPaths();
  return readFileSync(join(PACKAGE_ROOT, 'templates/hooks', name), 'utf-8')
    .replace(/^CODELOOP_NODE=\$\{CODELOOP_NODE:-node\}$/m, () => `CODELOOP_NODE=\${CODELOOP_NODE:-${shq(node)}}`)
    .replace(/^codeloop=codeloop$/m, () => `codeloop=${shq(join(bin, 'codeloop'))}`);
}

export interface HookInstall {
  name: string;
  installed: boolean;
  path?: string;
  reason?: string;
}

/**
 * Merges `templates/hooks/<templateFile>`'s `hooks.<event>` arrays into `<destRel>`'s own `hooks`
 * key, deduping by exact entry match so a second run is a no-op. Other top-level keys in the
 * destination file (permissions, say) are left alone.
 */
function mergeHooksFile(projectDir: string, destRel: string, templateFile: string): { changed: boolean } {
  const destPath = join(projectDir, destRel);
  const template = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'templates/hooks', templateFile), 'utf-8')) as { hooks: Record<string, unknown[]> };
  const dest = existsSync(destPath) ? JSON.parse(readFileSync(destPath, 'utf-8')) : {};
  dest.hooks ??= {};
  let changed = false;
  for (const [event, entries] of Object.entries(template.hooks)) {
    dest.hooks[event] ??= [];
    // An entry from an install before absolute paths runs the same hook again; it is replaced.
    const bare = new Set(entries.map(e => JSON.stringify(e)));
    const kept = (dest.hooks[event] as unknown[]).filter(e => !bare.has(JSON.stringify(e)));
    if (kept.length !== dest.hooks[event].length) changed = true;
    dest.hooks[event] = kept;
    for (const entry of entries.map(withPaths)) {
      const exists = (dest.hooks[event] as unknown[]).some(e => JSON.stringify(e) === JSON.stringify(entry));
      if (!exists) {
        dest.hooks[event].push(entry);
        changed = true;
      }
    }
  }
  if (changed) {
    mkdirSync(dirname(destPath), { recursive: true });
    writeFileSync(destPath, `${JSON.stringify(dest, null, 2)}\n`);
  }
  return { changed };
}

/** Installs a git hook from `templates/hooks/<name>` next to `commit-msg`; refuses to overwrite a different existing one. */
function installGitHook(projectDir: string, name: 'pre-commit' | 'pre-push' | 'post-commit'): HookInstall {
  const run = spawnSync('git', ['rev-parse', '--git-path', 'hooks'], { cwd: projectDir, encoding: 'utf-8' });
  if (run.status !== 0) return { name, installed: false, reason: 'not a git repository' };
  const source = gitHookSource(name);
  const template = readFileSync(join(PACKAGE_ROOT, 'templates/hooks', name), 'utf-8');
  // A repo with core.hooksPath never runs .git/hooks. Husky points it at .husky/_ and runs the
  // script of the same name one level up, so that is where the guard has to go, appended to
  // whatever the repo already runs there.
  const hooksPath = spawnSync('git', ['config', '--get', 'core.hooksPath'], { cwd: projectDir, encoding: 'utf-8' }).stdout.trim();
  if (hooksPath && /\.husky\/_\/?$/.test(hooksPath)) {
    const path = join(resolve(projectDir, hooksPath), '..', name);
    const marker = `# codeloop ${name}`;
    const block = `\n${marker}\n${source.replace(/^#!.*\n/, '')}`;
    const current = existsSync(path) ? readFileSync(path, 'utf-8') : '#!/bin/sh\n';
    if (current.includes(marker)) return { name, installed: true, path, reason: 'unchanged' };
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${current.replace(/\n*$/, '\n')}${block}`, { mode: 0o755 });
    return { name, installed: true, path };
  }
  const path = join(resolve(projectDir, hooksPath || run.stdout.trim()), name);
  if (existsSync(path) && readFileSync(path, 'utf-8') === source) return { name, installed: true, path, reason: 'unchanged' };
  // The hook as an earlier install wrote it, bare PATH lookups and all: replaced whole.
  const earlier = existsSync(path) && readFileSync(path, 'utf-8') === template;
  if (existsSync(path) && !earlier) {
    // A hook the repo already runs (its own script, or one a `prepare` step copies in) keeps running
    // first; the guard is appended after it under a marker, once.
    const current = readFileSync(path, 'utf-8');
    const marker = `# codeloop ${name}`;
    if (current.includes(marker)) return { name, installed: true, path, reason: 'unchanged' };
    writeFileSync(path, `${current.replace(/\n*$/, '\n')}\n${marker}\n${source.replace(/^#!.*\n/, '')}`, { mode: 0o755 });
    return { name, installed: true, path, reason: 'appended to the existing hook' };
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source, { mode: 0o755 });
  return { name, installed: true, path };
}

/**
 * Everything `codeloop init --hooks` and `codeloop render --hooks` install on top of the
 * commit-msg hook: the Claude Code PreToolUse/UserPromptSubmit/Stop hooks (merged into
 * `.claude/settings.json`), the Cursor sessionStart/sessionEnd/subagentStart/subagentStop hooks
 * (written to `.cursor/hooks.json`), the pre-commit/pre-push git guards, and the post-commit hook
 * that records each commit in its card's activity.
 */
/**
 * True when the project already runs codeloop's git guard: a hook equal to the shipped one, or one
 * carrying its `# codeloop <name>` marker, at the path git reads hooks from.
 */
export function hasGitGuardHooks(projectDir: string): boolean {
  const run = spawnSync('git', ['rev-parse', '--git-path', 'hooks'], { cwd: projectDir, encoding: 'utf-8' });
  if (run.status !== 0) return false;
  const hooksPath = spawnSync('git', ['config', '--get', 'core.hooksPath'], { cwd: projectDir, encoding: 'utf-8' }).stdout.trim();
  const husky = hooksPath && /\.husky\/_\/?$/.test(hooksPath);
  const dir = husky ? join(resolve(projectDir, hooksPath), '..') : resolve(projectDir, hooksPath || run.stdout.trim());
  return (['pre-commit', 'pre-push', 'post-commit'] as const).some(name => {
    const path = join(dir, name);
    if (!existsSync(path)) return false;
    const text = readFileSync(path, 'utf-8');
    return text.includes(`# codeloop ${name}`) || text === gitHookSource(name) || text === readFileSync(join(PACKAGE_ROOT, 'templates/hooks', name), 'utf-8');
  });
}

/**
 * Keeps `paths` out of `git status` without touching the repository's own .gitignore: they go into
 * `.git/info/exclude`, which git reads like a gitignore and never commits. A five-file install
 * writes its hook files and board state this way, so the repository diff shows only the five.
 */
export function excludeFromGit(projectDir: string, paths: string[]): { path?: string; added: string[] } {
  const run = spawnSync('git', ['rev-parse', '--git-path', 'info/exclude'], { cwd: projectDir, encoding: 'utf-8' });
  if (run.status !== 0) return { added: [] };
  const file = resolve(projectDir, run.stdout.trim());
  const current = existsSync(file) ? readFileSync(file, 'utf-8') : '';
  const have = new Set(current.split('\n').map(l => l.trim()));
  const added = paths.filter(p => !have.has(p));
  if (added.length) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${current.replace(/\n*$/, current ? '\n' : '')}# codeloop: machine-local files, never committed\n${added.join('\n')}\n`);
  }
  return { path: file, added };
}

/**
 * `local`: the Claude hooks go into `.claude/settings.local.json`, which Claude Code reads like
 * settings.json, and both host files are excluded from git, so an install adds nothing to the
 * repository beyond the files it means to (c-381).
 */
export function installHostHooks(projectDir: string, opts: { hostsOf?: string; gitHooks?: boolean; local?: boolean; hosts?: ('claude' | 'cursor')[] } = {}): HookInstall[] {
  // Only the hosts init set up get hook files; a repo with neither folder gets Claude's, the default host.
  // `hostsOf` names the tree whose folders say which hosts are set up: a story worktree is a fresh
  // checkout, so the main tree decides.
  const decides = opts.hostsOf ?? projectDir;
  const hasCursor = opts.hosts ? opts.hosts.includes('cursor') : existsSync(join(decides, '.cursor'));
  const hasClaude = opts.hosts ? opts.hosts.includes('claude') : existsSync(join(decides, '.claude')) || !hasCursor;
  const out: HookInstall[] = [];
  const claudeFile = opts.local ? '.claude/settings.local.json' : '.claude/settings.json';
  if (hasClaude) {
    const claude = mergeHooksFile(projectDir, claudeFile, 'claude-hooks.json');
    out.push({ name: claudeFile, installed: true, reason: claude.changed ? undefined : 'unchanged' });
  }
  if (hasCursor) {
    const cursor = mergeHooksFile(projectDir, '.cursor/hooks.json', 'cursor-hooks.json');
    out.push({ name: '.cursor/hooks.json', installed: true, reason: cursor.changed ? undefined : 'unchanged' });
  }
  if (opts.local) excludeFromGit(projectDir, [...(hasClaude ? [claudeFile] : []), ...(hasCursor ? ['.cursor/hooks.json'] : [])]);
  if (opts.gitHooks === false) return out;
  return [
    ...out,
    installGitHook(projectDir, 'pre-commit'),
    installGitHook(projectDir, 'pre-push'),
    installGitHook(projectDir, 'post-commit'),
  ];
}
