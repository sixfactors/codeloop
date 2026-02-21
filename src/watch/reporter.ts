import { existsSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import type { TriggerResult } from './triggers.js';
import type { WatchSignal } from './signals.js';

const WATCH_LOG = '.codeloop/watch.log';
const MAX_LOG_LINES = 500;

export interface Reporter {
  log: (signal: WatchSignal, results: TriggerResult[]) => void;
  broadcast: (() => void) | null;
}

/**
 * Create a reporter that logs to .codeloop/watch.log
 * and optionally broadcasts to a serve instance via SSE.
 */
export function createReporter(projectDir: string, broadcastFn?: () => void): Reporter {
  const logPath = join(projectDir, WATCH_LOG);

  // Ensure log directory exists
  const logDir = dirname(logPath);
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  return {
    log: (signal: WatchSignal, results: TriggerResult[]) => {
      const timestamp = signal.timestamp.slice(11, 19); // HH:MM:SS
      const lines = results.map(r => `[${timestamp}] ${r.action}: ${r.details}`);
      const entry = lines.join('\n') + '\n';

      try {
        appendFileSync(logPath, entry, 'utf-8');
      } catch {
        // Log file write failure is non-critical
      }

      // Also log to console in foreground mode
      for (const line of lines) {
        console.log(`  ${line}`);
      }

      // Broadcast to SSE clients if server is running
      if (broadcastFn) {
        try {
          broadcastFn();
        } catch {
          // SSE broadcast failure is non-critical
        }
      }
    },
    broadcast: broadcastFn ?? null,
  };
}
