import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { watchFiles, pollGitCommits, createIdleTimer, type SignalConfig, type WatchSignal } from './signals.js';
import { processSignal } from './triggers.js';
import { createReporter } from './reporter.js';

export interface WatchConfig {
  enabled: boolean;
  idle_timeout: number;
  signals: SignalConfig;
  ignore: string[];
}

const DEFAULT_CONFIG: WatchConfig = {
  enabled: true,
  idle_timeout: 300,
  signals: {
    file_change: true,
    git_commit: true,
    test_result: true,
    build_status: true,
    idle: true,
  },
  ignore: ['node_modules', 'dist', '.git', '*.log'],
};

const GIT_POLL_INTERVAL = 5000; // 5 seconds

/**
 * Load watch config from .codeloop/config.yaml.
 * Falls back to defaults if not configured.
 */
export function loadWatchConfig(projectDir: string): WatchConfig {
  const configPath = join(projectDir, '.codeloop/config.yaml');
  if (!existsSync(configPath)) return { ...DEFAULT_CONFIG };

  try {
    const content = readFileSync(configPath, 'utf-8');
    const config = parseYaml(content);

    if (!config.watch) return { ...DEFAULT_CONFIG };

    return {
      enabled: config.watch.enabled ?? DEFAULT_CONFIG.enabled,
      idle_timeout: config.watch.idle_timeout ?? DEFAULT_CONFIG.idle_timeout,
      signals: { ...DEFAULT_CONFIG.signals, ...(config.watch.signals ?? {}) },
      ignore: config.watch.ignore ?? DEFAULT_CONFIG.ignore,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export interface WatchEngine {
  start: () => void;
  stop: () => void;
}

/**
 * Create the watch engine.
 * Orchestrates file watchers, git polling, idle timer, and reporting.
 */
export function createWatchEngine(projectDir: string, broadcastFn?: () => void): WatchEngine {
  const config = loadWatchConfig(projectDir);
  const reporter = createReporter(projectDir, broadcastFn);

  const closers: Array<{ close: () => void }> = [];
  let idleTimer: { reset: () => void; close: () => void } | null = null;

  function handleSignal(signal: WatchSignal) {
    // Reset idle timer on any activity
    if (signal.type !== 'idle' && idleTimer) {
      idleTimer.reset();
    }

    const results = processSignal(projectDir, signal);
    reporter.log(signal, results);
  }

  return {
    start() {
      // File watcher
      if (config.signals.file_change) {
        const watcher = watchFiles(projectDir, config.ignore, handleSignal);
        closers.push(watcher);
      }

      // Git commit poller
      if (config.signals.git_commit) {
        const poller = pollGitCommits(projectDir, GIT_POLL_INTERVAL, handleSignal);
        closers.push(poller);
      }

      // Idle timer
      if (config.signals.idle) {
        idleTimer = createIdleTimer(config.idle_timeout * 1000, handleSignal);
        closers.push(idleTimer);
      }
    },

    stop() {
      for (const closer of closers) {
        closer.close();
      }
      closers.length = 0;
      idleTimer = null;
    },
  };
}
