import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * c-333: `scripts/v1-untouched.sh snapshot|compare` over a fixture v1 home and production project.
 * The compare passes when only v1's own appends happened and lists each changed path otherwise.
 */
const SCRIPT = resolve('scripts/v1-untouched.sh');
let root: string;
let home: string;
let project: string;
let store: string;
let snapshot: string;
const now = new Date().toISOString();

const write = (path: string, text: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};
const card = (id: string, events: { action: string; note?: string }[]) => ({ id, title: `Card ${id}`, lane: 'build', laneVersion: 1, stage: 'build', retries: {}, evidence: [], events: events.map((e, i) => ({ at: new Date(Date.parse(now) + i * 1000).toISOString(), actor: 'owner', human: true, ...e })), createdAt: now, updatedAt: now });
const boardFile = () => join(store, '.codeloop/cards.json');
const readBoard = () => JSON.parse(readFileSync(boardFile(), 'utf-8')) as { version: number; cards: ReturnType<typeof card>[] };
const writeBoard = (board: ReturnType<typeof readBoard>) => writeFileSync(boardFile(), `${JSON.stringify(board, null, 2)}\n`);

const run = (verb: 'snapshot' | 'compare', extra: string[] = []) =>
  spawnSync('bash', [SCRIPT, verb, '--home', home, '--project', project, '--file', snapshot, '--binary', join(root, 'bin/codeloop'), '--crontab', join(root, 'bin/crontab'), ...extra], { encoding: 'utf-8', timeout: 60_000 });

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-v1u-')));
  home = join(root, 'home');
  project = join(root, 'ops-ai');
  store = join(home, 'projects/ops-ai');
  snapshot = join(root, 'snapshot.json');
  // The v1 home: registry, hub record, a per-project store the project links to.
  write(join(home, 'projects.json'), `${JSON.stringify([{ id: 'ops-ai', name: 'ops-ai', path: project, addedAt: now }], null, 2)}\n`);
  write(join(home, 'state/hub.json'), `${JSON.stringify({ port: 4050, host: '127.0.0.1', token: 't', pid: 1, startedAt: now }, null, 2)}\n`);
  mkdirSync(join(store, '.codeloop'), { recursive: true });
  writeBoard({ version: 3, cards: [card('c-1', [{ action: 'create' }, { action: 'advance', note: 'to build' }]), card('c-2', [{ action: 'create' }])] });
  // The production project: settings, MCP files, and cards.json as a link into the store, as ops-ai has.
  write(join(project, '.claude/settings.json'), '{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"codeloop guard session"}]}]}}\n');
  write(join(project, '.mcp.json'), '{"mcpServers":{"codeloop":{"command":"codeloop","args":["mcp"]}}}\n');
  write(join(project, '.codeloop/config.yaml'), 'project:\n  name: ops-ai\n');
  symlinkSync(join(store, '.codeloop/cards.json'), join(project, '.codeloop/cards.json'));
  // A stand-in global binary (a real file behind a link, as npm installs it) and a stand-in crontab.
  write(join(root, 'pkg/bin/codeloop'), '#!/bin/sh\necho 1.0.0\n');
  write(join(root, 'pkg/package.json'), '{"name":"@protoboxai/codeloop","version":"1.0.0","gitHead":"abc"}\n');
  chmodSync(join(root, 'pkg/bin/codeloop'), 0o755);
  mkdirSync(join(root, 'bin'), { recursive: true });
  symlinkSync(join(root, 'pkg/bin/codeloop'), join(root, 'bin/codeloop'));
  write(join(root, 'bin/crontab'), `#!/bin/sh\ncat "${join(root, 'crontab.txt')}"\n`);
  chmodSync(join(root, 'bin/crontab'), 0o755);
  write(join(root, 'crontab.txt'), `0 * * * * cd '${project}' && codeloop run # codeloop:${project}\n30 2 * * * /usr/bin/true # something else\n`);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('v1-untouched snapshot and compare', () => {
  it('snapshot writes the file; compare with nothing changed exits 0', () => {
    const s = run('snapshot');
    expect(s.status, s.stderr).toBe(0);
    expect(existsSync(snapshot)).toBe(true);
    const c = run('compare');
    expect(c.status, c.stdout + c.stderr).toBe(0);
    expect(c.stdout).toMatch(/untouched/i);
  });

  it('a v1 append (one new event on a card, a new card) passes: the snapshot events are a prefix', () => {
    expect(run('snapshot').status).toBe(0);
    const board = readBoard();
    board.version += 1;
    board.cards[0].events.push({ at: now, actor: 'agent', human: false, action: 'agent-start' });
    board.cards.push(card('c-3', [{ action: 'create' }]));
    writeBoard(board);
    const c = run('compare');
    expect(c.status, c.stdout + c.stderr).toBe(0);
  });

  it('dropping an old event fails even though the board grew', () => {
    expect(run('snapshot').status).toBe(0);
    const board = readBoard();
    board.version += 1;
    board.cards[0].events.shift();
    board.cards[0].events.push({ at: now, actor: 'agent', human: false, action: 'x' }, { at: now, actor: 'agent', human: false, action: 'y' });
    writeBoard(board);
    const c = run('compare');
    expect(c.status).toBe(1);
    expect(c.stdout + c.stderr).toContain('c-1');
  });

  it('changing the content behind the cards.json link fails, with the link itself unchanged', () => {
    expect(run('snapshot').status).toBe(0);
    const board = readBoard();
    board.cards[1].events[0].note = 'edited in place';
    writeBoard(board);
    const c = run('compare');
    expect(c.status).toBe(1);
    expect(c.stdout + c.stderr).toContain('c-2');
  });

  it('a removed card, a changed hook file, a changed MCP file, a moved hub port, a changed cron line and a repointed binary are each listed', () => {
    expect(run('snapshot').status).toBe(0);
    const board = readBoard();
    board.cards.pop();
    writeBoard(board);
    write(join(project, '.claude/settings.json'), '{"hooks":{}}\n');
    write(join(project, '.mcp.json'), '{"mcpServers":{}}\n');
    write(join(home, 'state/hub.json'), `${JSON.stringify({ port: 4060, host: '127.0.0.1', token: 't', pid: 1, startedAt: now }, null, 2)}\n`);
    write(join(root, 'crontab.txt'), `0 * * * * cd '${project}' && codeloop-next run # codeloop:${project}\n`);
    rmSync(join(root, 'bin/codeloop'));
    write(join(root, 'other/dist/index.js'), '');
    symlinkSync(join(root, 'other/dist/index.js'), join(root, 'bin/codeloop'));
    const c = run('compare');
    expect(c.status).toBe(1);
    const out = c.stdout + c.stderr;
    for (const expected of ['c-2', '.claude/settings.json', '.mcp.json', 'hub', 'crontab', 'binary']) expect(out, `names ${expected}`).toContain(expected);
  });

  it('a snapshot taken against a different home or project is refused rather than compared', () => {
    expect(run('snapshot').status).toBe(0);
    const other = join(root, 'elsewhere');
    mkdirSync(other, { recursive: true });
    const c = spawnSync('bash', [SCRIPT, 'compare', '--home', other, '--project', project, '--file', snapshot, '--binary', join(root, 'bin/codeloop'), '--crontab', join(root, 'bin/crontab')], { encoding: 'utf-8' });
    expect(c.status).toBe(2);
  });
});
