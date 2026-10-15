import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { runCli } from '../../__tests__/cli.js';
import { closeIndex, getIndex } from '../index/index.js';
import { orchTurn } from '../orch.js';
import { runDue } from '../run.js';
import { homeView } from '../services.js';

let dir: string;
const OFF = '.codeloop/state/off.json';
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
};
const now = new Date().toISOString();
const inMinutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();
const pause = (until: string | null, why = 'quick fix') => write(OFF, JSON.stringify({ until, why, by: 'Dean', at: now }));
const activityFiles = () => (existsSync(join(dir, '.codeloop/state/activity')) ? readdirSync(join(dir, '.codeloop/state/activity')) : []);
const cli = (args: string[], opts: { input?: string; env?: NodeJS.ProcessEnv } = {}) =>
  runCli(args, { cwd: dir, input: opts.input ?? '', env: { ...opts.env, CODELOOP_PROJECT_DIR: dir } });
const edit = (session: string, file: string, env: NodeJS.ProcessEnv = {}) =>
  cli(['guard', 'edit'], { input: JSON.stringify({ session_id: session, tool_name: 'Edit', tool_input: { file_path: file } }), env });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-off-'));
  write('.codeloop/lanes/build.yaml', 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: spec\n    done: { cmd: "false" }\n');
  write('.codeloop/cards.json', JSON.stringify({ version: 1, cards: ['c-1', 'c-2'].map(id => ({ id, title: `Card ${id}`, lane: 'build', laneVersion: 1, stage: 'spec', spec: `specs/${id}`, retries: {}, evidence: [], events: [], createdAt: now, updatedAt: now })) }, null, 2));
  write('specs/c-1/plan.md', '# plan\n\n## Files\n\n- src/one.ts\n');
  write('specs/c-2/plan.md', '# plan\n\n## Files\n\n- src/two.ts\n');
  // s-b holds c-2, so src/two.ts is leased; s-a edits it from c-1 and is refused while codeloop is on.
  cli(['card', 'activate', 'c-1'], { env: { CLAUDE_CODE_SESSION_ID: 's-a' } });
  cli(['card', 'activate', 'c-2'], { env: { CLAUDE_CODE_SESSION_ID: 's-b' } });
});
afterEach(async () => {
  await closeIndex(dir);
  rmSync(dir, { recursive: true, force: true });
});

describe('codeloop off', () => {
  it('control: with codeloop on, an edit of a file another story leases is refused', () => {
    expect(edit('s-a', 'src/two.ts').status).toBe(2);
  });

  it('with off.json present, guard edit on a leased file exits 0 and writes no activity line', () => {
    const before = activityFiles().map(f => [f, existsSync(join(dir, '.codeloop/state/activity', f))]);
    pause(null);
    const r = edit('s-a', 'src/two.ts');
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
    expect(activityFiles().map(f => [f, true])).toEqual(before.map(([f]) => [f, true]));
    expect(existsSync(join(dir, '.codeloop/state/activity/c-1.jsonl'))).toBe(false);
  });

  it('CODELOOP_OFF=1 does the same with no file', () => {
    const r = edit('s-a', 'src/two.ts', { CODELOOP_OFF: '1' });
    expect(r.status).toBe(0);
    expect(existsSync(join(dir, '.codeloop/state/activity/c-1.jsonl'))).toBe(false);
  });

  it('after `until` passes the guard enforces again and the file is gone', () => {
    pause(new Date(Date.now() - 1000).toISOString());
    const r = edit('s-a', 'src/two.ts');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/belongs to c-2/);
    expect(existsSync(join(dir, OFF))).toBe(false);
  });

  it('guard session prints the off line first and reads no board', () => {
    pause(inMinutes(90), 'spike');
    const r = cli(['guard', 'session']);
    expect(r.status).toBe(0);
    expect(r.stdout.split('\n')[0]).toMatch(/^codeloop is off here until \d\d:\d\d \(spike\)$/);
    expect(r.stdout.trim().split('\n')).toHaveLength(1);
  });

  it('`off --for 2h --why` writes the file and `on` removes it', () => {
    const off = cli(['off', '--for', '2h', '--why', 'spike']);
    expect(off.status).toBe(0);
    expect(JSON.parse(readFileSync(join(dir, OFF), 'utf-8'))).toMatchObject({ why: 'spike' });
    expect(cli(['off', '--for', 'soon']).status).toBe(2);
    expect(cli(['on']).status).toBe(0);
    expect(existsSync(join(dir, OFF))).toBe(false);
  });

  it('orchTurn refuses while off, with the reason', async () => {
    pause(inMinutes(30), 'spike');
    await expect(orchTurn(dir, 'c-1')).rejects.toThrow(/^codeloop is off here until \d\d:\d\d \(spike\)$/);
  });

  it('runDue starts nothing while off and says why', () => {
    pause(null, 'demo');
    const r = runDue(dir);
    expect(r.stopped).toBe('codeloop is off here (indefinite: demo)');
    expect(r.created).toEqual([]);
  });

  it('homeView carries off', async () => {
    pause(inMinutes(30), 'spike');
    const home = await homeView(getIndex(dir), dir);
    expect(home.off).toMatchObject({ why: 'spike' });
  });
});
