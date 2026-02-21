import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { createWatchEngine, loadWatchConfig } from '../watch/index.js';

const PID_FILE = '.codeloop/.watch.pid';

export const watchCommand = new Command('watch')
  .description('Watch project for changes, track progress on the board')
  .option('--with-serve', 'Also start the board server')
  .option('--stop', 'Stop background watcher')
  .option('--bg', 'Run in background')
  .action(async (options: { withServe?: boolean; stop?: boolean; bg?: boolean }) => {
    const projectDir = process.cwd();

    // --stop: kill background watcher
    if (options.stop) {
      const pidPath = join(projectDir, PID_FILE);
      if (!existsSync(pidPath)) {
        console.log(chalk.dim('  Not running'));
        return;
      }

      const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
      try {
        process.kill(pid);
        console.log(chalk.green(`  Stopped watcher (PID ${pid})`));
      } catch {
        console.log(chalk.yellow(`  Process ${pid} not found (already stopped?)`));
      }
      unlinkSync(pidPath);
      return;
    }

    // Check project is initialized
    const configPath = join(projectDir, '.codeloop', 'config.yaml');
    if (!existsSync(configPath)) {
      console.log(chalk.red('  No config.yaml found. Run `codeloop init` first.'));
      process.exit(1);
    }

    const config = loadWatchConfig(projectDir);
    if (!config.enabled) {
      console.log(chalk.yellow('  Watch mode is disabled in config.yaml (watch.enabled: false)'));
      return;
    }

    // --bg: fork as background process
    if (options.bg) {
      const { fork } = await import('child_process');
      const args = ['watch'];
      if (options.withServe) args.push('--with-serve');

      const child = fork(process.argv[1], args, {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();

      if (child.pid) {
        const pidPath = join(projectDir, PID_FILE);
        writeFileSync(pidPath, String(child.pid), 'utf-8');
        console.log(chalk.green(`  Watcher started in background (PID ${child.pid})`));
      }
      return;
    }

    // Foreground mode
    let broadcastFn: (() => void) | undefined;

    // --with-serve: also start board server
    if (options.withServe) {
      const { createApp } = await import('../lib/server.js');
      const { serve } = await import('@hono/node-server');
      const { app, broadcast } = createApp(projectDir);
      broadcastFn = broadcast;

      const port = 4040;
      serve({ fetch: app.fetch, port }, () => {
        console.log(chalk.bold(`  Board: ${chalk.cyan(`http://localhost:${port}`)}`));
      });
    }

    const engine = createWatchEngine(projectDir, broadcastFn);

    console.log();
    console.log(chalk.bold('  Codeloop Watch'));

    const signals = Object.entries(config.signals)
      .filter(([, v]) => v)
      .map(([k]) => k);
    console.log(chalk.dim(`  Signals: ${signals.join(', ')}`));
    console.log(chalk.dim(`  Idle timeout: ${config.idle_timeout}s`));
    console.log(chalk.dim('  Press Ctrl+C to stop'));
    console.log();

    engine.start();

    // Graceful shutdown
    const shutdown = () => {
      console.log(chalk.dim('\n  Stopping watcher...'));
      engine.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

export function getWatchStatus(projectDir: string): { running: boolean; pid?: number } {
  const pidPath = join(projectDir, PID_FILE);
  if (!existsSync(pidPath)) return { running: false };

  const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
  try {
    process.kill(pid, 0);
    return { running: true, pid };
  } catch {
    try { unlinkSync(pidPath); } catch { /* ignore */ }
    return { running: false };
  }
}
