/**
 * The hook daemon. Claude Code and Cursor run `guard edit|bash|prompt|session` on every tool call;
 * each was a fresh node process (~70 MB, 40 to 80 ms), and six sessions multiplied that. One resident
 * process per user answers them over a unix socket instead; bin/codeloop-hook is the shell client and
 * falls back to the CLI when the socket is absent or the daemon answers FALLBACK.
 *
 * Wire format, request: lines `verb`, `cwd`, `args` (tab separated), `bodyLen`, then `KEY=value`
 * lines for the CODELOOP_*, CLAUDE_CODE_* and CURSOR_* variables, a blank line, then bodyLen bytes of
 * the hook's stdin. Reply: the exit code line, stdout, the line SEPARATOR, stderr; or the single line
 * FALLBACK. Requests run one at a time because a request sets the process cwd and environment.
 */
import { chmodSync, existsSync, mkdirSync, statSync, unlinkSync } from 'fs';
import net from 'net';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { codeloopHome } from './hub-registry.js';

export const SEPARATOR = '--CODELOOP-STDERR--';
export const IDLE_MS = 10 * 60 * 1000;
const ENV_PREFIX = /^(CODELOOP_|CLAUDE_CODE_|CURSOR_)/;
/** Verbs whose throw blocks (exit 2) instead of falling back: the CLI refuses the same way, and an allow here would let an unchecked edit or shell command through. */
const FAIL_CLOSED = new Set<string>(['edit', 'bash']);

export const hookdSocket = (): string => process.env.CODELOOP_HOOKD_SOCK || join(codeloopHome(), 'state', 'hookd.sock');

class ExitSignal extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`);
  }
}

interface Request {
  verb: string;
  cwd: string;
  args: string[];
  env: Record<string, string>;
  body: string;
}

/** Parses one request off the front of `buf`, or undefined while it is incomplete. */
export function parseRequest(buf: Buffer): Request | undefined {
  let pos = 0;
  const line = (): string | undefined => {
    const nl = buf.indexOf(0x0a, pos);
    if (nl < 0) return undefined;
    const text = buf.subarray(pos, nl).toString('utf-8');
    pos = nl + 1;
    return text;
  };
  const verb = line();
  const cwd = line();
  const args = line();
  const len = line();
  if (verb === undefined || cwd === undefined || args === undefined || len === undefined) return undefined;
  const env: Record<string, string> = {};
  for (;;) {
    const l = line();
    if (l === undefined) return undefined;
    if (l === '') break;
    const eq = l.indexOf('=');
    if (eq > 0) env[l.slice(0, eq)] = l.slice(eq + 1);
  }
  const n = Number(len);
  if (buf.length - pos < n) return undefined;
  return { verb, cwd, args: args ? args.split('\t') : [], env, body: buf.subarray(pos, pos + n).toString('utf-8') };
}

type Handler = (args: string[]) => Promise<void>;

async function handlers(): Promise<Record<string, Handler>> {
  const g = await import('../commands/guard-hooks.js');
  return {
    edit: args => g.guardEdit(args[0]),
    bash: args => g.guardBash({ format: args[args.indexOf('--format') + 1] ?? 'claude' }),
    prompt: () => g.guardPrompt(),
    session: () => g.guardSession(),
  };
}

/** Runs one guard verb in this process with its console, exit and stdin captured. */
export async function execute(req: Request): Promise<string> {
  const table = await handlers();
  const run = table[req.verb];
  if (!run) return 'FALLBACK\n';
  const { withStdin } = await import('../commands/guard-hooks.js');
  const out: string[] = [];
  const err: string[] = [];
  const saved = { log: console.log, error: console.error, warn: console.warn, exit: process.exit, cwd: process.cwd() };
  const format = (a: unknown[]) => a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n';
  console.log = (...a: unknown[]) => void out.push(format(a));
  console.error = (...a: unknown[]) => void err.push(format(a));
  console.warn = console.error;
  process.exit = ((code?: number) => {
    throw new ExitSignal(code ?? 0);
  }) as typeof process.exit;
  for (const k of Object.keys(process.env)) if (ENV_PREFIX.test(k) && !k.startsWith('CODELOOP_HOOKD_')) delete process.env[k];
  Object.assign(process.env, req.env);
  let code = 0;
  try {
    process.chdir(req.cwd);
    await withStdin(req.body, () => run(req.args));
  } catch (e) {
    if (e instanceof ExitSignal) code = e.code;
    else if (FAIL_CLOSED.has(req.verb)) {
      err.push(`${(await import('../commands/guard-hooks.js')).guardFailed(req.verb as 'edit' | 'bash', e)}\n`);
      code = 2;
    } else {
      Object.assign(console, { log: saved.log, error: saved.error, warn: saved.warn });
      process.exit = saved.exit;
      return 'FALLBACK\n';
    }
  } finally {
    Object.assign(console, { log: saved.log, error: saved.error, warn: saved.warn });
    process.exit = saved.exit;
    try {
      process.chdir(saved.cwd);
    } catch {
      // the daemon's own cwd vanished; the next request sets its own
    }
  }
  return `${code}\n${out.join('')}${SEPARATOR}\n${err.join('')}`;
}

const entryPath = (): string => join(dirname(fileURLToPath(import.meta.url)), '..', 'index.js');
const mtime = (p: string): number => {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
};

function alive(sock: string): Promise<boolean> {
  return new Promise(resolve => {
    const c = net.connect(sock);
    c.once('connect', () => (c.destroy(), resolve(true)));
    c.once('error', () => resolve(false));
  });
}

/**
 * Listens until idle for `idleMs` or until the CLI build changes (the next hook call then starts a
 * fresh daemon on the new code). Resolves when the server has closed. Exits quietly when another
 * daemon already holds the socket.
 */
export async function serveHookd(opts: { idleMs?: number; sock?: string } = {}): Promise<void> {
  const sock = opts.sock ?? hookdSocket();
  const idleMs = opts.idleMs ?? IDLE_MS;
  mkdirSync(dirname(sock), { recursive: true, mode: 0o700 });
  if (existsSync(sock)) {
    if (await alive(sock)) return;
    unlinkSync(sock);
  }
  const built = mtime(entryPath());
  let queue: Promise<unknown> = Promise.resolve();
  let idle: NodeJS.Timeout | undefined;
  const server = net.createServer(conn => {
    clearTimeout(idle);
    let buf = Buffer.alloc(0);
    let handled = false;
    conn.on('data', chunk => {
      if (handled) return;
      buf = Buffer.concat([buf, chunk]);
      const req = parseRequest(buf);
      if (!req) return;
      handled = true;
      queue = queue.then(async () => {
        let reply: string;
        try {
          reply = await execute(req);
        } catch {
          reply = 'FALLBACK\n';
        }
        conn.end(reply);
        arm();
        if (mtime(entryPath()) !== built) server.close();
      });
    });
    conn.on('error', () => undefined);
  });
  const arm = () => {
    clearTimeout(idle);
    idle = setTimeout(() => server.close(), idleMs);
  };
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(sock, () => {
      chmodSync(sock, 0o600);
      arm();
      resolve();
    });
  });
  await new Promise<void>(resolve => server.once('close', () => resolve()));
  clearTimeout(idle);
  try {
    unlinkSync(sock);
  } catch {
    // already gone
  }
}

/** The client side for tests and callers in node: one request, the raw reply. */
export function hookdCall(verb: string, opts: { cwd: string; args?: string[]; env?: Record<string, string>; body?: string; sock?: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = opts.body ?? '';
    const env = Object.entries(opts.env ?? {}).map(([k, v]) => `${k}=${v}`);
    const head = [verb, opts.cwd, (opts.args ?? []).join('\t'), String(Buffer.byteLength(body)), ...env, '', ''].join('\n');
    const c = net.connect(opts.sock ?? hookdSocket());
    let reply = '';
    c.setEncoding('utf-8');
    c.on('data', d => (reply += d));
    c.on('end', () => resolve(reply));
    c.on('error', reject);
    c.on('connect', () => c.write(head + body));
  });
}
