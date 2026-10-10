import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

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
    for (const entry of entries) {
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
function installGitHook(projectDir: string, name: 'pre-commit' | 'pre-push'): HookInstall {
  const run = spawnSync('git', ['rev-parse', '--git-path', 'hooks'], { cwd: projectDir, encoding: 'utf-8' });
  if (run.status !== 0) return { name, installed: false, reason: 'not a git repository' };
  const source = readFileSync(join(PACKAGE_ROOT, 'templates/hooks', name), 'utf-8');
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
  if (existsSync(path) && readFileSync(path, 'utf-8') !== source) return { name, installed: false, path, reason: `a different ${name} hook already exists` };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source, { mode: 0o755 });
  return { name, installed: true, path };
}

/**
 * Everything `codeloop init --hooks` and `codeloop render --hooks` install on top of the
 * commit-msg hook: the Claude Code PreToolUse/UserPromptSubmit/Stop hooks (merged into
 * `.claude/settings.json`), the Cursor sessionStart/sessionEnd/subagentStart/subagentStop hooks
 * (written to `.cursor/hooks.json`), and the pre-commit/pre-push git guards.
 */
export function installHostHooks(projectDir: string): HookInstall[] {
  const claude = mergeHooksFile(projectDir, '.claude/settings.json', 'claude-hooks.json');
  const cursor = mergeHooksFile(projectDir, '.cursor/hooks.json', 'cursor-hooks.json');
  return [
    { name: '.claude/settings.json', installed: true, reason: claude.changed ? undefined : 'unchanged' },
    { name: '.cursor/hooks.json', installed: true, reason: cursor.changed ? undefined : 'unchanged' },
    installGitHook(projectDir, 'pre-commit'),
    installGitHook(projectDir, 'pre-push'),
  ];
}
