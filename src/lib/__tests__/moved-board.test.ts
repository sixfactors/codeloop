import { spawn, type ChildProcess } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CLI, runCli } from '../../__tests__/cli.js';
import { hookdCall } from '../hookd.js';

/**
 * c-330: a project whose .codeloop/moved.json says the record moved to v2. Every v1 board write is
 * refused naming the v2 command; reads and hooks keep working and say the board moved, once.
 */
const MOVED = 'this board moved to codeloop v2; use codeloop-next';
const MARKER = '.codeloop/moved.json';
let dir: string;
const now = new Date().toISOString();

const write = (path: string, text: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
};
const read = (path: string) => readFileSync(join(dir, path), 'utf-8');
const move = (marker: Record<string, unknown> = { to: 'v2', command: 'codeloop-next', at: now }) => write(MARKER, `${JSON.stringify(marker, null, 2)}\n`);
const cli = (args: string[], opts: { input?: string; env?: NodeJS.ProcessEnv } = {}) =>
  runCli(args, { cwd: dir, input: opts.input ?? '', env: { ...opts.env, CODELOOP_PROJECT_DIR: dir } });
const hook = (verb: string, input: Record<string, unknown>, env: NodeJS.ProcessEnv = {}) => cli(['guard', verb], { input: JSON.stringify(input), env });
const edit = (session: string, file: string) => hook('edit', { session_id: session, tool_name: 'Edit', tool_input: { file_path: file } }, { CLAUDE_CODE_SESSION_ID: session });
const movedLines = (text: string) => text.split('\n').filter(l => l.includes('this board moved to codeloop v2'));

/** A hash over every file under `path` (names and bytes), or the empty string when it does not exist. */
function treeHash(path: string): string {
  const full = join(dir, path);
  if (!existsSync(full)) return '';
  const h = createHash('sha1');
  const walk = (p: string) => {
    for (const name of readdirSync(p).sort()) {
      const f = join(p, name);
      if (statSync(f).isDirectory()) walk(f);
      else h.update(f.slice(full.length)).update(readFileSync(f));
    }
  };
  walk(full);
  return h.digest('hex');
}

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-moved-')));
  write('.codeloop/config.yaml', 'project:\n  name: moved\n');
  write('.codeloop/lanes/build.yaml', 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: spec\n    done: { cmd: "false" }\n');
  write('.codeloop/cards.json', JSON.stringify({ version: 1, cards: ['c-1', 'c-2'].map(id => ({ id, title: `Card ${id}`, lane: 'build', laneVersion: 1, stage: 'spec', spec: `.codeloop/specs/${id}`, retries: {}, evidence: [], events: [], createdAt: now, updatedAt: now })) }, null, 2));
  write('.codeloop/specs/c-1/plan.md', '# plan\n\n## Files\n\n- src/one.ts\n');
  write('.codeloop/specs/c-2/plan.md', '# plan\n\n## Files\n\n- src/two.ts\n');
  // s-b holds c-2, so src/two.ts is leased; s-a works c-1.
  cli(['card', 'activate', 'c-1'], { env: { CLAUDE_CODE_SESSION_ID: 's-a' } });
  cli(['card', 'activate', 'c-2'], { env: { CLAUDE_CODE_SESSION_ID: 's-b' } });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('a board moved to v2: writes', () => {
  it('control: with no marker a board write lands', () => {
    const r = cli(['card', 'propose', 'build', 'A proposal']);
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(read('.codeloop/cards.json')).version).toBe(2);
  });

  it('writeCards refuses with exit 2, naming the command from the marker, and cards.json is unchanged', () => {
    move({ to: 'v2', command: 'codeloop-next --home ~/.codeloop-next', at: now });
    const before = read('.codeloop/cards.json');
    const r = cli(['card', 'propose', 'build', 'A proposal']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('this board moved to codeloop v2; use codeloop-next --home ~/.codeloop-next');
    expect(read('.codeloop/cards.json')).toBe(before);
  });

  it('a marker with no command still refuses, naming codeloop-next', () => {
    move({});
    const r = cli(['card', 'propose', 'build', 'A proposal']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(MOVED);
  });

  it('a wiki capture with a title refuses and the wiki folder is unchanged', () => {
    move();
    const before = treeHash('.codeloop/wiki');
    const r = cli(['wiki', 'capture', '--title', 'A lesson', '--body', 'Failure: x\nFix: y', '--scope', 'src/**']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(MOVED);
    expect(treeHash('.codeloop/wiki')).toBe(before);
  });

  it('the stop hook form (`wiki capture --quiet`, no title) exits 0 and writes nothing', () => {
    move();
    const before = treeHash('.codeloop/wiki');
    const r = cli(['wiki', 'capture', '--quiet']);
    expect(r.status).toBe(0);
    expect(treeHash('.codeloop/wiki')).toBe(before);
  });

  it('a question write (`ask`) refuses and no interview file appears', () => {
    move();
    const r = cli(['ask', 'c-1', 'Which way?', '--recommended', 'This way']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(MOVED);
    expect(existsSync(join(dir, '.codeloop/specs/c-1/interview.md'))).toBe(false);
  });

  it('a store write that is not the board (`epic new`) refuses and writes no page', () => {
    write('.codeloop/wiki/initiatives/growth.md', '---\ntitle: Growth\n---\n\nMore users.\n');
    const control = cli(['epic', 'new', 'first', '--title', 'First', '--initiative', 'growth']);
    expect(control.status, `control: epic new writes without the marker: ${control.stderr}`).toBe(0);
    move();
    const r = cli(['epic', 'new', 'second', '--title', 'Second', '--initiative', 'growth']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(MOVED);
    expect(existsSync(join(dir, '.codeloop/wiki/epics/second.md'))).toBe(false);
  });
});

describe('a board moved to v2: reads', () => {
  it('control: with no marker a read prints nothing extra', () => {
    const r = cli(['card', 'list', '--json']);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toHaveLength(2);
    expect(r.stderr).toBe('');
  });

  it('a read prints the board as before, with the moved line once on stderr', () => {
    move();
    const r = cli(['card', 'list', '--json']);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toHaveLength(2);
    expect(movedLines(r.stderr)).toHaveLength(1);
    const show = cli(['card', 'show', 'c-1']);
    expect(show.status).toBe(0);
    expect(show.stdout).toContain('Card c-1');
    expect(movedLines(show.stderr)).toHaveLength(1);
  });
});

describe('a board moved to v2: hooks', () => {
  it('control: with no marker an edit of a file another story leases is refused', () => {
    expect(edit('s-a', 'src/two.ts').status).toBe(2);
  });

  it('guard edit on a leased file exits 0 and prints the moved line', () => {
    move();
    const r = edit('s-a', 'src/two.ts');
    expect(r.status).toBe(0);
    expect(movedLines(r.stderr)).toHaveLength(1);
  });

  it('guard bash lets an owner action through instead of asking, and prints the moved line', () => {
    const control = hook('bash', { tool_input: { command: 'codeloop approve c-1' } });
    expect(control.stdout).toContain('"permissionDecision":"ask"');
    move();
    const r = hook('bash', { tool_input: { command: 'codeloop approve c-1' } });
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain('permissionDecision');
    expect(movedLines(r.stderr)).toHaveLength(1);
    const cursor = cli(['guard', 'bash', '--format', 'cursor'], { input: JSON.stringify({ command: 'codeloop approve c-1' }) });
    expect(cursor.status).toBe(0);
    expect(JSON.parse(cursor.stdout.trim())).toEqual({ permission: 'allow' });
  });

  it('guard prompt and guard session exit 0 with the moved line and read no board', () => {
    move();
    const prompt = hook('prompt', { session_id: 's-a', prompt: 'hello' }, { CLAUDE_CODE_SESSION_ID: 's-a' });
    expect(prompt.status).toBe(0);
    expect(movedLines(prompt.stderr)).toHaveLength(1);
    expect(prompt.stdout).not.toContain('active card');
    const session = hook('session', { session_id: 's-a' }, { CLAUDE_CODE_SESSION_ID: 's-a' });
    expect(session.status).toBe(0);
    expect(movedLines(session.stderr)).toHaveLength(1);
    expect(session.stdout).not.toContain('active story');
  });

  it('through the hook daemon, guard edit on a leased file exits 0 with the moved line', async () => {
    move();
    const sock = join(dir, 'hookd.sock');
    const env = { ...process.env, CODELOOP_HOOKD_SOCK: sock, CODELOOP_PROJECT_DIR: dir };
    const daemon: ChildProcess = spawn(process.execPath, [CLI, 'hookd'], { cwd: dir, env, stdio: 'ignore' });
    for (let i = 0; i < 100 && !existsSync(sock); i++) await new Promise(r => setTimeout(r, 50));
    try {
      const reply = await hookdCall('edit', { cwd: dir, sock, env: { CODELOOP_PROJECT_DIR: dir, CLAUDE_CODE_SESSION_ID: 's-a' }, body: JSON.stringify({ session_id: 's-a', tool_input: { file_path: 'src/two.ts' } }) });
      expect(reply.split('\n')[0]).toBe('0');
      expect(movedLines(reply)).toHaveLength(1);
    } finally {
      const pid = existsSync(`${sock}.pid`) ? Number(readFileSync(`${sock}.pid`, 'utf-8')) : 0;
      if (pid) try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
      daemon.kill('SIGKILL');
    }
  });
});
