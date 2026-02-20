import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createApp } from '../lib/server.js';
import { loadBoard } from '../lib/board.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = join(__dirname, '..', '..');
const UI_DIR = join(PACKAGE_ROOT, 'dist', 'ui');

const DEFAULT_PORT = 4040;
const PID_FILE = '.codeloop/.serve.pid';

export const serveCommand = new Command('serve')
  .description('Start the visual board server')
  .option('-p, --port <port>', 'Port to listen on', String(DEFAULT_PORT))
  .option('--bg', 'Run in background')
  .option('--stop', 'Stop background server')
  .option('--open', 'Open browser after starting')
  .action(async (options: { port: string; bg?: boolean; stop?: boolean; open?: boolean }) => {
    const projectDir = process.cwd();
    const port = parseInt(options.port, 10);

    // --stop: kill background server
    if (options.stop) {
      const pidPath = join(projectDir, PID_FILE);
      if (!existsSync(pidPath)) {
        console.log(chalk.dim('  Not running'));
        return;
      }

      const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
      try {
        process.kill(pid);
        console.log(chalk.green(`  Stopped server (PID ${pid})`));
      } catch {
        console.log(chalk.yellow(`  Process ${pid} not found (already stopped?)`));
      }
      unlinkSync(pidPath);
      return;
    }

    // Check board exists
    const boardPath = join(projectDir, '.codeloop', 'board.json');
    if (!existsSync(boardPath)) {
      console.log(chalk.red('  No board.json found. Run `codeloop init` first.'));
      process.exit(1);
    }

    // --bg: fork as background process
    if (options.bg) {
      const { fork } = await import('child_process');
      const child = fork(process.argv[1], ['serve', '--port', String(port)], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();

      if (child.pid) {
        const pidPath = join(projectDir, PID_FILE);
        writeFileSync(pidPath, String(child.pid), 'utf-8');
        console.log(chalk.green(`  Board server started in background (PID ${child.pid})`));
        console.log(`  ${chalk.cyan(`http://localhost:${port}`)}`);
      }
      return;
    }

    // Foreground mode
    const uiDir = existsSync(UI_DIR) ? UI_DIR : undefined;
    const { app, broadcast } = createApp(projectDir, uiDir);

    const { serve } = await import('@hono/node-server');
    serve({ fetch: app.fetch, port }, () => {
      console.log();
      console.log(chalk.bold(`  Codeloop board: ${chalk.cyan(`http://localhost:${port}`)}`));
      console.log(chalk.dim('  Press Ctrl+C to stop'));
      console.log();

      // --open: open browser
      if (options.open) {
        import('child_process').then(({ exec }) => {
          const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
          exec(`${cmd} http://localhost:${port}`);
        });
      }
    });

    // Watch board.json for external changes (skill writes) and push via SSE
    const { watch } = await import('fs');
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      watch(boardPath, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          broadcast();
        }, 100);
      });
    } catch {
      // board.json not created yet
    }
  });

export function getServeStatus(projectDir: string): { running: boolean; pid?: number; port?: number } {
  const pidPath = join(projectDir, PID_FILE);
  if (!existsSync(pidPath)) return { running: false };

  const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
  try {
    process.kill(pid, 0); // Test if process exists
    return { running: true, pid };
  } catch {
    // Stale PID file — clean up
    try { unlinkSync(pidPath); } catch {}
    return { running: false };
  }
}
