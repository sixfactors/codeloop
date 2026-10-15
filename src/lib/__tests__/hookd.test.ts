import { execFileSync, spawn, spawnSync, type ChildProcess } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hookdCall, SEPARATOR } from '../hookd.js';
import { CLI } from '../../__tests__/cli.js';

const CLIENT = resolve('bin/codeloop-hook');
let root: string;
let proj: string;
let sock: string;
let shim: string;
let daemon: ChildProcess | undefined;
let daemonPid = 0;

const cliCalls = () => (existsSync(join(root, 'cli-calls')) ? readFileSync(join(root, 'cli-calls'), 'utf-8').split('\n').filter(Boolean).length : 0);
const split = (reply: string) => {
  const [code, ...rest] = reply.split('\n');
  const body = rest.join('\n');
  const at = body.indexOf(SEPARATOR + '\n');
  return { code: Number(code), out: body.slice(0, at), err: body.slice(at + SEPARATOR.length + 1) };
};
const env = (extra: Record<string, string> = {}) => ({ ...process.env, CODELOOP_HOOKD_SOCK: sock, CODELOOP_BIN: shim, CODELOOP_CARD: '', ...extra });
const client = (verb: string, input: string, extra: Record<string, string> = {}) =>
  spawnSync('sh', [CLIENT, verb], { cwd: proj, input, encoding: 'utf-8', env: env(extra), timeout: 30_000 });
const cli = (verb: string, input: string, extra: Record<string, string> = {}) =>
  spawnSync(process.execPath, [CLI, 'guard', verb], { cwd: proj, input, encoding: 'utf-8', env: env(extra), timeout: 30_000 });

beforeAll(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'cl-hd-')));
  proj = join(root, 'p');
  mkdirSync(join(proj, '.codeloop'), { recursive: true });
  writeFileSync(join(proj, '.codeloop/config.yaml'), 'project:\n  name: demo\n');
  sock = join(root, 's.sock');
  // The client starts `$CODELOOP_BIN hookd` and runs `$CODELOOP_BIN guard <verb>`; the shim does the
  // second against the built CLI and ignores the first, so the test owns the only daemon.
  shim = join(root, 'codeloop');
  writeFileSync(shim, `#!/bin/sh\n[ "$1" = hookd ] && exit 0\necho "$@" >> "${join(root, 'cli-calls')}"\nexec "${process.execPath}" "${CLI}" "$@"\n`);
  chmodSync(shim, 0o755);
  daemon = spawn(process.execPath, [CLI, 'hookd'], { cwd: root, env: env(), stdio: 'ignore' });
  for (let i = 0; i < 100 && !existsSync(`${sock}.pid`); i++) await new Promise(r => setTimeout(r, 50));
  for (let i = 0; i < 100 && !existsSync(sock); i++) await new Promise(r => setTimeout(r, 50));
  daemonPid = Number(readFileSync(`${sock}.pid`, 'utf-8'));
});
afterAll(() => {
  if (daemonPid) process.kill(daemonPid, 'SIGKILL');
  rmSync(root, { recursive: true, force: true });
});

describe('codeloop-hookd', () => {
  it('answers like the CLI: guard edit with no active card refuses with exit 2 and the same message', () => {
    const before = cliCalls();
    const viaDaemon = client('edit', '{"tool_input":{"file_path":"a.ts"}}');
    expect(cliCalls(), 'the daemon answered, the CLI did not run').toBe(before);
    const viaCli = cli('edit', '{"tool_input":{"file_path":"a.ts"}}');
    expect(viaCli.status).toBe(2);
    expect(viaDaemon.status).toBe(2);
    expect(viaDaemon.stderr).toBe(viaCli.stderr);
  });

  it('answers like the CLI: an owner action in the shell tool goes to the person as an ask', () => {
    const input = '{"tool_input":{"command":"codeloop approve c-001"}}';
    const before = cliCalls();
    const viaDaemon = client('bash', input);
    expect(cliCalls()).toBe(before);
    expect(viaDaemon.stdout).toBe(cli('bash', input).stdout);
    expect(viaDaemon.stdout).toContain('"permissionDecision":"ask"');
  });

  it('one request does not leak its environment or format into the next', async () => {
    const asCursor = split(await hookdCall('bash', { cwd: proj, args: ['--format', 'cursor'], body: '{"command":"ls"}', env: { CODELOOP_CARD: 'c-001' }, sock }));
    expect(asCursor.out).toContain('"permission":"allow"');
    const next = split(await hookdCall('bash', { cwd: proj, body: '{"tool_input":{"command":"ls"}}', sock }));
    expect(next.out).toBe('');
    const edit = split(await hookdCall('edit', { cwd: proj, body: '{}', sock }));
    expect(edit.code).toBe(2);
  });

  it('asks the client to fall back for a verb it does not serve', async () => {
    expect(await hookdCall('commit', { cwd: proj, sock })).toBe('FALLBACK\n');
  });

  it('the client runs the CLI itself when no daemon answers', () => {
    const lonely = join(root, 'none.sock');
    const before = cliCalls();
    const run = client('edit', '{}', { CODELOOP_HOOKD_SOCK: lonely });
    expect(cliCalls()).toBe(before + 1);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain('no active card');
  });

  it('stays near 60 MiB resident after serving requests (a bare node is 48; measured 59 to 60.4)', async () => {
    for (let i = 0; i < 5; i++) await hookdCall('edit', { cwd: proj, body: '{}', sock });
    const rssKb = Number(execFileSync('ps', ['-o', 'rss=', '-p', String(daemonPid)], { encoding: 'utf-8' }).trim());
    expect(rssKb / 1024).toBeLessThan(62);
  });
});
