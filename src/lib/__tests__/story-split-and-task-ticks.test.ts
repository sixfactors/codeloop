import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readCards } from '../cards.js';
import { advanceCard, createCard, placeCard, RefusalError } from '../engine.js';
import { cardActivity } from '../services.js';
import { runCli } from '../../__tests__/cli.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
let dir: string;

function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

const tasks = (n: number) => Array.from({ length: n }, (_, i) => `- [ ] T${String(i + 1).padStart(3, '0')} [api] do thing ${i + 1}`).join('\n') + '\n';

function setup(taskCount: number, config = ''): void {
  write('.codeloop/lanes/build.yaml', `id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - { id: spec, done: { cmd: "true" } }\n  - { id: build, done: { cmd: "true" } }\n  - { id: review, done: { cmd: "true" } }\n`);
  if (config) write('.codeloop/config.yaml', config);
  createCard(dir, { lane: 'build', title: 'Big story', id: 'c-1' });
  const cards = JSON.parse(readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8'));
  cards.cards[0].spec = 'specs/001-big';
  writeFileSync(join(dir, '.codeloop/cards.json'), JSON.stringify(cards));
  write('specs/001-big/tasks.md', tasks(taskCount));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-split-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('story size at build entry', () => {
  it('refuses a place at build with nine tasks, naming the count', () => {
    setup(9);
    expect(() => placeCard(dir, 'c-1', 'build', 'owner')).toThrow(/c-1 has 9 tasks; split it into stories of eight or fewer \(`codeloop card split c-1 \.\.\.`\)/);
    expect(readCards(dir).cards[0].stage).toBe('spec');
  });

  it('refuses an advance into build with nine tasks', () => {
    setup(9);
    expect(() => advanceCard(dir, 'c-1')).toThrow(RefusalError);
    expect(readCards(dir).cards[0].stage).toBe('spec');
  });

  it('lets eight tasks through', () => {
    setup(8);
    expect(placeCard(dir, 'c-1', 'build', 'owner').stage).toBe('build');
  });

  it('lets nine through when lanes.max_tasks is 12', () => {
    setup(9, 'lanes:\n  max_tasks: 12\n');
    expect(placeCard(dir, 'c-1', 'build', 'owner').stage).toBe('build');
  });
});

describe('the task cap on finished work', () => {
  it('approves a story at the spec gate whose twelve tasks are all ticked', () => {
    write('.codeloop/lanes/build.yaml', `id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - { id: spec, done: { cmd: "true" }, gate: { name: spec, approver: owner } }\n  - { id: build, done: { cmd: "true" } }\n  - { id: review, done: { cmd: "true" } }\n`);
    createCard(dir, { lane: 'build', title: 'Big story', id: 'c-1' });
    const cards = JSON.parse(readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8'));
    cards.cards[0].spec = 'specs/001-big';
    writeFileSync(join(dir, '.codeloop/cards.json'), JSON.stringify(cards));
    write('specs/001-big/tasks.md', tasks(12));
    const env = { ...process.env, CODELOOP_CARD: '', CODELOOP_ROLE: 'owner' };
    const cli = (...args: string[]) => runCli(args, { cwd: dir, encoding: 'utf-8', env });
    write('specs/001-big/tasks.md', tasks(12).replace(/- \[ \]/g, '- [x]'));
    expect(advanceCard(dir, 'c-1').card.gate).toBe('spec');
    const approved = cli('approve', 'c-1');
    expect(approved.stderr).not.toMatch(/split it/);
    expect(readCards(dir).cards[0].stage).toBe('build');
  });
});

describe('Task trailer ticks the board', () => {
  const git = (...args: string[]) => spawnSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, encoding: 'utf-8' });
  const commit = (trailers: string) => {
    git('commit', '-q', '--allow-empty', '-m', 'feat(x): work', '-m', trailers);
    return runCli(['guard', 'commit'], { cwd: dir, encoding: 'utf-8', env: { ...process.env, CODELOOP_CARD: '', CODELOOP_ROLE: '' } });
  };
  const tasksFile = () => readFileSync(join(dir, 'specs/001-big/tasks.md'), 'utf-8');
  const taskLines = () => cardActivity(dir, 'c-1').lines.filter(l => l.kind === 'task');

  beforeEach(() => {
    setup(3);
    git('init', '-q');
  });

  it('ticks the named task, writes a task activity line and a card event', () => {
    commit('Card: c-1\nTask: T002');
    expect(tasksFile()).toContain('- [x] T002');
    expect(tasksFile()).toContain('- [ ] T001');
    expect(taskLines()).toHaveLength(1);
    expect(taskLines()[0]).toMatchObject({ task: 'T002' });
    expect(taskLines()[0].sha).toMatch(/^[0-9a-f]{12}$/);
    expect(readCards(dir).cards[0].events.filter(e => e.action === 'task').map(e => e.note)).toEqual(['T002']);
  });

  it('ignores an unknown id with a warning and changes nothing', () => {
    const before = tasksFile();
    const r = commit('Card: c-1\nTask: T099');
    expect(tasksFile()).toBe(before);
    expect(taskLines()).toHaveLength(0);
    expect(r.stderr).toContain('T099');
  });

  it('a second commit with the same id is a no-op', () => {
    commit('Card: c-1\nTask: T002');
    commit('Card: c-1\nTask: T002');
    expect(taskLines()).toHaveLength(1);
    expect(readCards(dir).cards[0].events.filter(e => e.action === 'task')).toHaveLength(1);
  });
});

describe('a queued split sibling', () => {
  it('splits, ticks its tasks and moves to build, and every refusal on the way names card move', () => {
    setup(3);
    placeCard(dir, 'c-1', 'build', 'owner');
    const env = { ...process.env, CODELOOP_CARD: '', CODELOOP_ROLE: 'owner' };
    const cli = (...args: string[]) => runCli(args, { cwd: dir, encoding: 'utf-8', env });
    const split = cli('card', 'split', 'c-1', 'First half', 'Second half');
    expect(split.status).toBe(0);
    const sibling = readCards(dir).cards.find(c => c.title === 'Second half')!;
    expect(sibling.stage).toBe('queued');
    write(`${sibling.spec}/tasks.md`, '- [x] T001 [api] one\n- [x] T002 [api] two\n');
    expect(cli('card', 'reopen', sibling.id).stderr).toMatch(new RegExp(`codeloop card move ${sibling.id} <stage>`));
    expect(cli('approve', sibling.id).stderr).toMatch(new RegExp(`codeloop card move ${sibling.id} <stage>`));
    const moved = cli('card', 'move', sibling.id, 'build');
    expect(moved.status).toBe(0);
    expect(readCards(dir).cards.find(c => c.id === sibling.id)!.stage).toBe('build');
  });
});

describe('task check on a story that skipped spec', () => {
  it('reads the tasks.md an S story has, ticked or not', () => {
    write('.codeloop/lanes/build.yaml', `id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - { id: spec, when: "size >= M", done: { cmd: "true" } }\n  - { id: build, done: { cmd: "true" } }\n`);
    createCard(dir, { lane: 'build', title: 'Small story', id: 'c-1', fields: { size: 'S' } });
    const cards = JSON.parse(readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8'));
    expect(cards.cards[0].stage).toBe('build');
    cards.cards[0].spec = 'specs/001-small';
    writeFileSync(join(dir, '.codeloop/cards.json'), JSON.stringify(cards));
    const env = { ...process.env, CODELOOP_CARD: '', CODELOOP_ROLE: 'owner' };
    const check = () => runCli(['task', 'check', 'c-1', '--all-done'], { cwd: dir, encoding: 'utf-8', env });
    write('specs/001-small/tasks.md', '- [x] T001 [api] one\n- [ ] T002 [api] two\n');
    expect(check().status).toBe(1);
    write('specs/001-small/tasks.md', '- [x] T001 [api] one\n- [x] T002 [api] two\n');
    const done = check();
    expect(done.stdout).toMatch(/all 2 tasks done/);
    expect(done.status).toBe(0);
    write('specs/001-small/tasks.md', '# c-1 tasks\n\n## Rubric\n');
    expect(check().stdout).toMatch(/no tasks: c-1 skips the spec stage/);
    rmSync(join(dir, 'specs'), { recursive: true });
    expect(check().stdout).toMatch(/no tasks: c-1 skips the spec stage/);
  });
});
