import { Command } from 'commander';
import chalk from 'chalk';
import { dirname, join } from 'path';
import { connect } from 'net';
import { fileURLToPath } from 'url';
import { createHubApp } from '../lib/hub.js';
import { appMockRoutes, findWorkspaceBuild, hubListener, loadNext, staticChunks } from '../lib/next-server.js';
import { hubStateAlive, hubUrl, loadHubSecrets, readHubState, removeHubState, writeHubState, type HubState } from '../lib/hub-state.js';
import { openUrl } from '../lib/serve-state.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = join(__dirname, '..', '..');

export const DEFAULT_HUB_PORT = 4040;

export const hubCommand = new Command('hub')
  .description('Run the one board that serves every registered project, each under its own path')
  .option('-p, --port <port>', 'Port to listen on', String(DEFAULT_HUB_PORT))
  .option('--host <host>', 'Address to listen on', '127.0.0.1')
  .option('--stop', 'Stop the hub and return once its port is closed')
  .option('--restart', 'Stop the hub, wait for its port to close, then start a new one on the same port')
  .option('--open', 'Open the browser after starting')
  .option('--new-token', 'Issue a new token and sign every browser out (default: reuse the last run\'s)')
  .action(async (options: { port: string; host: string; stop?: boolean; restart?: boolean; open?: boolean; newToken?: boolean }) => {
    if (options.restart) {
      const old = readHubState();
      const port = old?.port ?? parseInt(options.port, 10);
      const host = old?.host ?? options.host;
      if (old) {
        await stopHub(old);
        removeHubState();
      }
      const state = await ensureHubRunning(port, host, { log: line => console.log(chalk.dim(line)) });
      console.log(chalk.green(`  Hub restarted: ${chalk.cyan(hubUrl(state))}`));
      if (options.open) openUrl(`${hubUrl(state)}/`);
      return;
    }
    if (options.stop) {
      const state = readHubState();
      removeHubState();
      if (!state) {
        console.log(chalk.dim('  Not running'));
        return;
      }
      const outcome = await stopHub(state);
      console.log(outcome === 'missing' ? chalk.yellow(`  Process ${state.pid} not found (already stopped?)`) : chalk.green(`  Stopped hub (PID ${state.pid})`));
      return;
    }

    const port = parseInt(options.port, 10);
    const already = readHubState();
    if (already && already.port === port && (await hubStateAlive(already))) {
      console.log(chalk.bold(`  Hub already running: ${chalk.cyan(hubUrl(already))}`));
      console.log(chalk.dim('  codeloop hub --stop stops it.'));
      return;
    }

    await runHubForeground(port, options.host, { open: options.open, token: process.env.CODELOOP_SERVE_TOKEN, newToken: options.newToken });
  });

/** True while something accepts connections on the port. */
function listening(host: string, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const c = connect({ host: host === '0.0.0.0' ? '127.0.0.1' : host, port });
    c.once('connect', () => (c.destroy(), resolve(true)));
    c.once('error', () => resolve(false));
  });
}

/** Resolves once nothing accepts connections on the port; false if it still does after `timeoutMs`. */
export async function waitForPortClosed(host: string, port: number, timeoutMs = 15_000, pollMs = 100): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (await listening(host, port)) {
    if (Date.now() >= end) return false;
    await new Promise(r => setTimeout(r, pollMs));
  }
  return true;
}

/**
 * Stops the recorded hub and returns only after its listener has closed, so whatever starts next on
 * the port does not race the old one (a start that loses that race leaves the browser refused).
 * SIGKILL follows if SIGTERM has not closed the port in 10 s.
 */
export async function stopHub(state: HubState, timeoutMs = 15_000): Promise<'stopped' | 'missing'> {
  try {
    process.kill(state.pid);
  } catch {
    return (await waitForPortClosed(state.host, state.port, 1000)) ? 'missing' : 'stopped';
  }
  if (!(await waitForPortClosed(state.host, state.port, Math.min(10_000, timeoutMs)))) {
    try {
      process.kill(state.pid, 'SIGKILL');
    } catch {
      // gone between the checks
    }
    await waitForPortClosed(state.host, state.port, Math.max(1000, timeoutMs - 10_000));
  }
  return 'stopped';
}

/**
 * Builds and serves the hub in this process: the hub's own API (project dispatch + `/api/hub/*`)
 * plus the one shared workspace UI, on one port. Exits the process on listen failure; the caller
 * (this command, or `ensureHubRunning` forking a background copy) decides what "failure" means.
 */
export async function runHubForeground(port: number, host: string, opts: { open?: boolean; token?: string; newToken?: boolean } = {}): Promise<void> {
  const { token, sessionSecret } = loadHubSecrets({ fresh: opts.newToken, token: opts.token });
  const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;
  process.env.CODELOOP_PORT = String(port);
  process.env.CODELOOP_API_INTERNAL = `http://127.0.0.1:${port}`;

  const hub = createHubApp({ token, sessionSecret, port });
  const workspaceBuild = findWorkspaceBuild(PACKAGE_ROOT);
  const pages = workspaceBuild ? await loadNext(workspaceBuild, { hostname: host, port }) : undefined;
  if (!pages) {
    console.log(chalk.red('  No workspace UI build found. The hub needs one to serve /p/<id>/... pages; see dist/workspace or workspace/.next/standalone.'));
  }

  const { createServer } = await import('http');
  const { getRequestListener } = await import('@hono/node-server');
  const api = getRequestListener(hub.app.fetch);
  const server = createServer(pages ? hubListener(api, pages, { chunks: workspaceBuild ? staticChunks(workspaceBuild) : undefined, appMocks: workspaceBuild ? appMockRoutes(workspaceBuild) : undefined }) : api);

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

export interface HubStarted {
  state: HubState;
  /** Milliseconds from the call until the port accepted a connection. */
  listeningMs: number;
  /** Milliseconds until the hub answered 200; undefined when only the socket was up by the deadline. */
  readyMs?: number;
}

/**
 * Waits for a freshly forked hub. The listener opens first; the Next workspace behind it can take
 * 20 s or more to serve its first 200. A listening socket counts as started and the first 200 as
 * ready, and both moments are reported. Fails only when the process dies or never listens within
 * `timeoutMs` (default 45 s).
 */
export async function awaitHubStart(args: {
  pid: number;
  port: number;
  host: string;
  timeoutMs?: number;
  pollMs?: number;
  readState?: () => HubState | undefined;
  alive?: (state: HubState) => Promise<boolean>;
  log?: (line: string) => void;
}): Promise<HubStarted> {
  const { pid, port, host, timeoutMs = 45_000, pollMs = 300, readState = readHubState, alive = hubStateAlive, log } = args;
  const t0 = Date.now();
  let listeningMs: number | undefined;
  let last: HubState | undefined;
  while (Date.now() - t0 < timeoutMs) {
    try {
      process.kill(pid, 0);
    } catch {
      break;
    }
    if (listeningMs === undefined && (await listening(host, port))) {
      listeningMs = Date.now() - t0;
      log?.(`  hub listening on port ${port} after ${(listeningMs / 1000).toFixed(1)} s`);
    }
    const state = readState();
    if (state && state.pid === pid) {
      last = state;
      if (await alive(state)) {
        const readyMs = Date.now() - t0;
        log?.(`  hub answering 200 after ${(readyMs / 1000).toFixed(1)} s`);
        return { state, listeningMs: listeningMs ?? readyMs, readyMs };
      }
    }
    await new Promise(r => setTimeout(r, pollMs));
  }
  if (listeningMs !== undefined && last) {
    log?.(`  hub is listening but has not answered 200 after ${Math.round((Date.now() - t0) / 1000)} s; it may still be warming up`);
    return { state: last, listeningMs };
  }
  throw new Error(`hub did not start on port ${port}. See what holds it with \`lsof -iTCP:${port} -sTCP:LISTEN\`.`);
}

/**
 * Starts the hub in the background if one is not already running and reachable, the way `serve
 * --bg` starts a project server. Used by `codeloop serve` and `codeloop open` so a second project
 * never has to think about ports. Returns the state of whichever hub is now running.
 */
export async function ensureHubRunning(port = DEFAULT_HUB_PORT, host = '127.0.0.1', opts: { log?: (line: string) => void } = {}): Promise<HubState> {
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
  const child = fork(process.argv[1], ['hub', '--port', String(port), '--host', host], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();

  const started = await awaitHubStart({ pid: child.pid!, port, host, log: opts.log });
  return started.state;
}
