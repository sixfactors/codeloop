import { Command } from 'commander';
import { randomBytes } from 'crypto';
import chalk from 'chalk';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readBoardAuth } from '../lib/auth.js';
import { createApp } from '../lib/server.js';
import { getIndex } from '../lib/index/index.js';
import { findWorkspaceBuild, loadNext, splitListener, staticChunks } from '../lib/next-server.js';
import { findProjectRoot, openUrl, readServeState, removeServeState, serveStateAlive, serveUrl, writeServeState } from '../lib/serve-state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = join(__dirname, '..', '..');
const UI_DIR = join(PACKAGE_ROOT, 'dist', 'ui');

const DEFAULT_PORT = 4040;
// Legacy: only `--bg` ever wrote this. serve.json (serve-state.ts) now covers both modes; this
// is still read and cleaned up by `--stop` for a server started before that change.
const PID_FILE = '.codeloop/.serve.pid';

function requireProjectDir(): string {
  const found = findProjectRoot(process.cwd());
  if (found) return found;
  console.log(chalk.red('  No .codeloop folder here or in a parent directory. Run `codeloop init` first.'));
  process.exit(1);
}

export const serveCommand = new Command('serve')
  .description('Start the visual board server')
  .option('-p, --port <port>', 'Port to listen on', String(DEFAULT_PORT))
  .option('--bg', 'Run in background')
  .option('--stop', 'Stop the server running for this project')
  .option('--open', 'Open browser after starting')
  .option('--owner', 'Allow Approve, Reject and other writes from the board. On localhost this is already the default; it is required on a non-loopback --host')
  .option('--read-only', 'Disable Approve, Reject and other writes even on localhost')
  .option('--ui <dir>', 'Serve this static build instead of the workspace app (or set CODELOOP_UI_DIR)')
  .option('--host <host>', 'Address to listen on. Anything but the default exposes the board to the network', '127.0.0.1')
  .action(async (options: { port: string; bg?: boolean; stop?: boolean; open?: boolean; owner?: boolean; readOnly?: boolean; host: string; ui?: string }) => {
    // Works from a subfolder, like git finds .git: walk up to the nearest .codeloop/.
    const projectDir = requireProjectDir();
    const port = parseInt(options.port, 10);

    // --stop: kill whichever server this project's state names (serve.json, or the legacy pid file).
    if (options.stop) {
      const state = readServeState(projectDir);
      const pidPath = join(projectDir, PID_FILE);
      const pid = state?.pid ?? (existsSync(pidPath) ? parseInt(readFileSync(pidPath, 'utf-8').trim(), 10) : undefined);
      removeServeState(projectDir);
      if (existsSync(pidPath)) unlinkSync(pidPath);
      if (!pid) {
        console.log(chalk.dim('  Not running'));
        return;
      }
      try {
        process.kill(pid);
        console.log(chalk.green(`  Stopped server (PID ${pid})`));
      } catch {
        console.log(chalk.yellow(`  Process ${pid} not found (already stopped?)`));
      }
      return;
    }

    const already = readServeState(projectDir);

    // A server for this project is already up on the port being asked for: print its URL again
    // rather than fail there (the common case is re-running `codeloop serve` having forgotten one
    // is already up). A different --port is a deliberate second server and still gets to bind.
    if (already && already.port === port && (await serveStateAlive(already))) {
      console.log(chalk.bold(`  Codeloop board already running: ${chalk.cyan(serveUrl(already))}`));
      console.log(chalk.dim(`  codeloop serve --stop stops it; codeloop open reprints this URL later.`));
      return;
    }

    // Reusing the last token this project served means an agent or a script holding it from
    // before a restart still works, instead of it silently going stale the moment the process does.
    const token = process.env.CODELOOP_SERVE_TOKEN ?? already?.token ?? randomBytes(24).toString('hex');
    const wantedUiEnv = options.ui ?? process.env.CODELOOP_UI_DIR;
    const loopback = ['127.0.0.1', 'localhost', '::1'].includes(options.host);
    // On loopback, anyone reaching the port is already on this machine, so owner access is the
    // default; --read-only turns it off. Off loopback, --owner is required (and --read-only still wins).
    const owner = !options.readOnly && (loopback || !!options.owner);
    const url = `http://${loopback ? '127.0.0.1' : options.host}:${port}/`;

    // A non-loopback host puts the board on the network; the default password is public (it is in
    // this file's history), so refuse rather than let anyone on that network sign in as the owner.
    if (!loopback) {
      const auth = readBoardAuth(projectDir);
      if (auth.isDefault) {
        console.log(chalk.red('  Refusing to start on a non-loopback host while the board still uses the default password.'));
        console.log(chalk.dim('  Set a real one first: `codeloop config board-password`.'));
        process.exit(1);
      }
    }

    // --bg: fork as background process
    if (options.bg) {
      const { fork } = await import('child_process');
      // A port another process holds would make the probe below answer for a child that died.
      const { createServer } = await import('net');
      const free = await new Promise<boolean>(resolve => {
        const s = createServer();
        s.once('error', () => resolve(false));
        s.listen(port, options.host, () => s.close(() => resolve(true)));
      });
      if (!free) {
        console.log(chalk.red(`  Port ${port} is already in use. See what holds it with \`lsof -iTCP:${port} -sTCP:LISTEN\`, or pass --port.`));
        process.exit(1);
      }
      const child = fork(process.argv[1], ['serve', '--port', String(port), '--host', options.host, ...(options.owner ? ['--owner'] : []), ...(options.readOnly ? ['--read-only'] : [])], {
        detached: true,
        stdio: 'ignore',
        // The child cannot print its token to this terminal, so the parent chooses it.
        env: { ...process.env, CODELOOP_SERVE_TOKEN: token, ...(wantedUiEnv ? { CODELOOP_UI_DIR: wantedUiEnv } : {}) },
      });
      child.unref();

      if (child.pid) {
        // Only a child that answers on the port counts as started: one that dies on a port already
        // in use would otherwise leave a pid file pointing at nothing and a success line on screen.
        const probe = `http://${options.host === '0.0.0.0' ? '127.0.0.1' : options.host}:${port}/api/cards`;
        const deadline = Date.now() + 15_000;
        let up = false;
        while (Date.now() < deadline) {
          try {
            process.kill(child.pid, 0);
          } catch {
            break;
          }
          try {
            const res = await fetch(probe, { signal: AbortSignal.timeout(1000) });
            if (res.ok) {
              up = true;
              break;
            }
          } catch {}
          await new Promise(r => setTimeout(r, 300));
        }
        if (!up) {
          console.log(chalk.red(`  Board server did not start on port ${port}. Another process may hold it: \`lsof -iTCP:${port} -sTCP:LISTEN\`, or pass --port.`));
          process.exit(1);
        }
        const pidPath = join(projectDir, PID_FILE);
        writeFileSync(pidPath, String(child.pid), 'utf-8');
        writeServeState(projectDir, { port, host: options.host, token, pid: child.pid, owner, startedAt: new Date().toISOString() });
        console.log(chalk.green(`  Board server started in background (PID ${child.pid})`));
        console.log(`  ${chalk.cyan(url)}`);
      }
      return;
    }

    // Foreground mode. The workspace app runs as a Next server inside this process when a build
    // is present and `next` can be loaded; `--ui` or a missing build serves a static folder instead.
    const wantedUi = options.ui ?? process.env.CODELOOP_UI_DIR;
    const workspaceBuild = wantedUi ? undefined : findWorkspaceBuild(PACKAGE_ROOT);
    const uiDir = wantedUi ? resolve(projectDir, wantedUi) : existsSync(UI_DIR) ? UI_DIR : undefined;
    if (wantedUi && !existsSync(join(uiDir!, 'index.html'))) {
      console.error(chalk.red(`  no index.html under ${uiDir}; build the UI first`));
      process.exit(2);
    }
    // Server components in the workspace read the API at this address; same process, same port.
    process.env.CODELOOP_PORT = String(port);
    process.env.CODELOOP_API_INTERNAL = `http://127.0.0.1:${port}`;
    // The index starts building before Next loads; the two do not wait on each other.
    const index = getIndex(projectDir);
    const pages = workspaceBuild ? await loadNext(workspaceBuild, { hostname: options.host, port }) : undefined;
    const { app } = createApp(projectDir, pages ? undefined : uiDir, { owner, token, anyHost: !loopback });

    void index.ready.then(() => console.log(chalk.dim(`  Index built in ${index.buildMs} ms`)));
    const { createServer } = await import('http');
    const { getRequestListener } = await import('@hono/node-server');
    const api = getRequestListener(app.fetch);
    const server = createServer(pages ? splitListener(api, pages, { anyHost: !loopback, chunks: workspaceBuild ? staticChunks(workspaceBuild) : undefined }) : api);
    server.listen(port, options.host, () => {
      writeServeState(projectDir, { port, host: options.host, token, pid: process.pid, owner, startedAt: new Date().toISOString() });
      const auth = readBoardAuth(projectDir);
      console.log();
      console.log(chalk.bold(`  Codeloop board: ${chalk.cyan(url)}`));
      if (!loopback) console.log(chalk.yellow(`  Listening on ${options.host}: the board is reachable from the network.`));
      console.log(chalk.dim(owner ? `  Sign in as ${auth.user} to answer and approve.` : loopback ? '  Read-only for cards (--read-only). Drop the flag to allow writes from the board.' : '  Read-only for cards; add --owner to allow writes from the board.'));
      if (owner && auth.isDefault) console.log(chalk.yellow(`  Still the default password. Change it: codeloop config board-password`));
      console.log(chalk.dim(`  API/SDK token (not needed in the browser): ${token}`));
      console.log(chalk.dim(pages ? `  Workspace app: ${workspaceBuild}` : uiDir ? `  Static board: ${uiDir}` : '  API only: no workspace build or static board found'));
      console.log(chalk.dim('  codeloop open reprints this URL later. Press Ctrl+C to stop'));
      console.log();

      // --open: open browser
      if (options.open) openUrl(url);
    });
    const stopOnSignal = () => {
      removeServeState(projectDir);
      process.exit(0);
    };
    process.on('SIGINT', stopOnSignal);
    process.on('SIGTERM', stopOnSignal);
    // The index follows the store's own watcher (cards, lanes, wiki, specs, evidence, mocks), so
    // nothing here watches files.
  });

export function getServeStatus(projectDir: string): { running: boolean; pid?: number; port?: number } {
  const pidPath = join(projectDir, PID_FILE);
  if (!existsSync(pidPath)) return { running: false };

  const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
  try {
    process.kill(pid, 0); // Test if process exists
    return { running: true, pid };
  } catch {
    // Stale PID file, clean up
    try { unlinkSync(pidPath); } catch {}
    return { running: false };
  }
}
