import { Command } from 'commander';
import { randomBytes } from 'crypto';
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
  .option('--owner', 'Allow Approve and Reject from the board, for whoever has the URL with its token')
  .option('--host <host>', 'Address to listen on. Anything but the default exposes the board to the network', '127.0.0.1')
  .action(async (options: { port: string; bg?: boolean; stop?: boolean; open?: boolean; owner?: boolean; host: string }) => {
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

    const token = process.env.CODELOOP_SERVE_TOKEN ?? randomBytes(24).toString('hex');
    const loopback = ['127.0.0.1', 'localhost', '::1'].includes(options.host);
    const url = `http://${loopback ? '127.0.0.1' : options.host}:${port}/?token=${token}`;
    const stateDir = join(projectDir, '.codeloop');
    if (!existsSync(stateDir)) {
      console.log(chalk.red('  No .codeloop folder found. Run `codeloop init` first.'));
      process.exit(1);
    }

    // --bg: fork as background process
    if (options.bg) {
      const { fork } = await import('child_process');
      const child = fork(process.argv[1], ['serve', '--port', String(port), '--host', options.host, ...(options.owner ? ['--owner'] : [])], {
        detached: true,
        stdio: 'ignore',
        // The child cannot print its token to this terminal, so the parent chooses it.
        env: { ...process.env, CODELOOP_SERVE_TOKEN: token },
      });
      child.unref();

      if (child.pid) {
        const pidPath = join(projectDir, PID_FILE);
        writeFileSync(pidPath, String(child.pid), 'utf-8');
        console.log(chalk.green(`  Board server started in background (PID ${child.pid})`));
        console.log(`  ${chalk.cyan(url)}`);
      }
      return;
    }

    // Foreground mode
    const uiDir = existsSync(UI_DIR) ? UI_DIR : undefined;
    const { app, broadcast, broadcastCards } = createApp(projectDir, uiDir, { owner: options.owner, token, anyHost: !loopback });

    const { serve } = await import('@hono/node-server');
    serve({ fetch: app.fetch, port, hostname: options.host }, () => {
      console.log();
      console.log(chalk.bold(`  Codeloop board: ${chalk.cyan(url)}`));
      console.log(chalk.dim('  The token in that URL is needed for every change. Anyone who has the URL can make them.'));
      if (!loopback) console.log(chalk.yellow(`  Listening on ${options.host}: the board is reachable from the network.`));
      console.log(chalk.dim(options.owner ? '  Approve and Reject are enabled (--owner)' : '  Read-only for cards; add --owner to approve from the board'));
      console.log(chalk.dim('  Press Ctrl+C to stop'));
      console.log();

      // --open: open browser
      if (options.open) {
        import('child_process').then(({ exec }) => {
          const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
          exec(`${cmd} '${url}'`);
        });
      }
    });

    // Watch the folder, not the files: cards.json is replaced by rename on every write, and
    // board.json may not exist yet. Lane edits change what the Cards view draws too.
    const { watch } = await import('fs');
    const timers: Record<string, ReturnType<typeof setTimeout>> = {};
    const later = (key: string, run: () => void) => {
      clearTimeout(timers[key]);
      timers[key] = setTimeout(run, 100);
    };
    watch(stateDir, (_event, name) => {
      if (name === 'board.json') later('board', broadcast);
      if (name === 'cards.json') later('cards', broadcastCards);
    });
    const lanesDir = join(stateDir, 'lanes');
    if (existsSync(lanesDir)) watch(lanesDir, () => later('cards', broadcastCards));
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
