import { watch, existsSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { execSync } from 'child_process';

export type SignalType = 'file_change' | 'git_commit' | 'test_result' | 'build_status' | 'idle';

export interface WatchSignal {
  type: SignalType;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface SignalConfig {
  file_change: boolean;
  git_commit: boolean;
  test_result: boolean;
  build_status: boolean;
  idle: boolean;
}

const DEFAULT_IGNORE = ['node_modules', 'dist', '.git', '*.log', '.codeloop/.serve.pid', '.codeloop/.watch.pid'];

/**
 * Watch for file changes using fs.watch on the project directory.
 * Fires a callback for each relevant file change.
 */
export function watchFiles(
  projectDir: string,
  ignore: string[],
  callback: (signal: WatchSignal) => void,
): { close: () => void } {
  const ignoreSet = new Set([...DEFAULT_IGNORE, ...ignore]);
  const watchers: ReturnType<typeof watch>[] = [];

  function shouldIgnore(filePath: string): boolean {
    const rel = relative(projectDir, filePath);
    for (const pattern of ignoreSet) {
      if (rel.startsWith(pattern) || rel.includes(`/${pattern}/`) || rel.includes(`/${pattern}`)) {
        return true;
      }
      // Simple glob: *.log → endsWith .log
      if (pattern.startsWith('*.') && rel.endsWith(pattern.slice(1))) {
        return true;
      }
    }
    return false;
  }

  try {
    const watcher = watch(projectDir, { recursive: true }, (_event, filename) => {
      if (!filename) return;
      const fullPath = join(projectDir, filename);
      if (shouldIgnore(fullPath)) return;

      callback({
        type: 'file_change',
        timestamp: new Date().toISOString(),
        data: { file: filename },
      });
    });
    watchers.push(watcher);
  } catch {
    // fs.watch with recursive may not be supported on all platforms
  }

  return {
    close: () => {
      for (const w of watchers) w.close();
    },
  };
}

/**
 * Poll .git/refs/heads for new commits.
 * Returns the latest commit SHA, or null if not a git repo.
 */
export function getLatestCommitSha(projectDir: string): string | null {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: projectDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Poll for new git commits at a given interval.
 */
export function pollGitCommits(
  projectDir: string,
  intervalMs: number,
  callback: (signal: WatchSignal) => void,
): { close: () => void } {
  let lastSha = getLatestCommitSha(projectDir);

  const timer = setInterval(() => {
    const currentSha = getLatestCommitSha(projectDir);
    if (currentSha && currentSha !== lastSha) {
      // Get commit message
      let message = '';
      try {
        message = execSync(`git log -1 --format=%s ${currentSha}`, {
          cwd: projectDir,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
      } catch { /* ignore */ }

      callback({
        type: 'git_commit',
        timestamp: new Date().toISOString(),
        data: { sha: currentSha, previousSha: lastSha, message },
      });
      lastSha = currentSha;
    }
  }, intervalMs);

  return {
    close: () => clearInterval(timer),
  };
}

/**
 * Idle timer — fires after no file changes for the specified duration.
 */
export function createIdleTimer(
  timeoutMs: number,
  callback: (signal: WatchSignal) => void,
): { reset: () => void; close: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function start() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      callback({
        type: 'idle',
        timestamp: new Date().toISOString(),
        data: { idleSeconds: timeoutMs / 1000 },
      });
    }, timeoutMs);
  }

  start();

  return {
    reset: () => start(),
    close: () => { if (timer) clearTimeout(timer); },
  };
}
