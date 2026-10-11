import { Command } from 'commander';
import { randomBytes } from 'crypto';
import chalk from 'chalk';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createHubApp } from '../lib/hub.js';
import { findWorkspaceBuild, hubListener, loadNext, staticChunks } from '../lib/next-server.js';
import { hubStateAlive, hubUrl, readHubState, removeHubState, writeHubState, type HubState } from '../lib/hub-state.js';
import { openUrl } from '../lib/serve-state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = join(__dirname, '..', '..');

export const DEFAULT_HUB_PORT = 4040;

export const hubCommand = new Command('hub')
  .description('Run the one board that serves every registered project, each under its own path')
  .option('-p, --port <port>', 'Port to listen on', String(DEFAULT_HUB_PORT))
  .option('--host <host>', 'Address to listen on', '127.0.0.1')
  .option('--stop', 'Stop the hub')
  .option('--open', 'Open the browser after starting')
  .action(async (options: { port: string; host: string; stop?: boolean; open?: boolean }) => {
    if (options.stop) {
      const state = readHubState();
      removeHubState();
      if (!state) {
        console.log(chalk.dim('  Not running'));
        return;
      }
      try {
        process.kill(state.pid);
        console.log(chalk.green(`  Stopped hub (PID ${state.pid})`));
      } catch {
        console.log(chalk.yellow(`  Process ${state.pid} not found (already stopped?)`));
      }
      return;
    }

    const port = parseInt(options.port, 10);
    const already = readHubState();
    if (already && already.port === port && (await hubStateAlive(already))) {
      console.log(chalk.bold(`  Hub already running: ${chalk.cyan(hubUrl(already))}`));
      console.log(chalk.dim('  codeloop hub --stop stops it.'));
      return;
    }

    await runHubForeground(port, options.host, { open: options.open, token: process.env.CODELOOP_SERVE_TOKEN });
  });

/**
 * Builds and serves the hub in this process: the hub's own API (project dispatch + `/api/hub/*`)
 * plus the one shared workspace UI, on one port. Exits the process on listen failure; the caller
 * (this command, or `ensureHubRunning` forking a background copy) decides what "failure" means.
 */
export async function runHubForeground(port: number, host: string, opts: { open?: boolean; token?: string } = {}): Promise<void> {
  const token = opts.token ?? randomBytes(24).toString('hex');
  const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;
  process.env.CODELOOP_PORT = String(port);
  process.env.CODELOOP_API_INTERNAL = `http://127.0.0.1:${port}`;

  const hub = createHubApp({ token });
  const workspaceBuild = findWorkspaceBuild(PACKAGE_ROOT);
  const pages = workspaceBuild ? await loadNext(workspaceBuild, { hostname: host, port }) : undefined;
  if (!pages) {
    console.log(chalk.red('  No workspace UI build found. The hub needs one to serve /p/<id>/... pages; see dist/workspace or workspace/.next/standalone.'));
  }

  const { createServer } = await import('http');
  const { getRequestListener } = await import('@hono/node-server');
  const api = getRequestListener(hub.app.fetch);
  const server = createServer(pages ? hubListener(api, pages, { chunks: workspaceBuild ? staticChunks(workspaceBuild) : undefined }) : api);

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, host, () => {
      writeHubState({ port, host, token, pid: process.pid, startedAt: new Date().toISOString() });
      console.log();
      console.log(chalk.bold(`  Codeloop hub: ${chalk.cyan(`${url}/`)}`));
      console.log(chalk.dim(`  API/SDK token (not needed in the browser): ${token}`));
      console.log(chalk.dim(pages ? `  Workspace app: ${workspaceBuild}` : '  API only: no workspace build found'));
      console.log(chalk.dim('  codeloop hub --stop stops it. Press Ctrl+C to stop.'));
      console.log();
      if (opts.open) openUrl(`${url}/`);
      resolveListen();
    });
  });

  const stopOnSignal = () => {
    removeHubState();
    process.exit(0);
  };
  process.on('SIGINT', stopOnSignal);
  process.on('SIGTERM', stopOnSignal);
}

/**
 * Starts the hub in the background if one is not already running and reachable, the way `serve
 * --bg` starts a project server. Used by `codeloop serve` and `codeloop open` so a second project
 * never has to think about ports. Returns the state of whichever hub is now running.
 */
export async function ensureHubRunning(port = DEFAULT_HUB_PORT, host = '127.0.0.1'): Promise<HubState> {
  const existing = readHubState();
  if (existing && (await hubStateAlive(existing))) return existing;

  const { fork } = await import('child_process');
  const { createServer: probe } = await import('net');
  const free = await new Promise<boolean>(resolveFree => {
    const s = probe();
    s.once('error', () => resolveFree(false));
    s.listen(port, host, () => s.close(() => resolveFree(true)));
  });
  if (!free) {
    if (existing) return existing; // something is already on the port; trust the recorded state
    throw new Error(`port ${port} is already in use by something else, and no hub is recorded there. See what holds it with \`lsof -iTCP:${port} -sTCP:LISTEN\`, or pass a different port.`);
  }
  const token = randomBytes(24).toString('hex');
  const child = fork(process.argv[1], ['hub', '--port', String(port), '--host', host], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, CODELOOP_SERVE_TOKEN: token },
  });
  child.unref();

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      process.kill(child.pid!, 0);
    } catch {
      break;
    }
    const state = readHubState();
    if (state && state.pid === child.pid && (await hubStateAlive(state))) return state;
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`hub did not start on port ${port}. See what holds it with \`lsof -iTCP:${port} -sTCP:LISTEN\`.`);
}
