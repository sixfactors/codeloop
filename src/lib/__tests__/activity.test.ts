import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ACTIVITY_DIR } from '../activity.js';
import { advanceCard } from '../engine.js';
import { startCardRun } from '../runs.js';
import { cardActivity } from '../services.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'dist/index.js');
let dir: string;

// The hooks read the session from their stdin; the parent's own host session must not leak in.
const ENV = { ...process.env, CLAUDE_CODE_SESSION_ID: '', CURSOR_SESSION_ID: '', CODELOOP_CARD: '', CODELOOP_ROLE: '' };

function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

function hook(args: string[], input: Record<string, unknown>, env: Record<string, string> = {}): number | null {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf-8', input: JSON.stringify(input), env: { ...ENV, ...env } }).status;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-activity-'));
  write('.codeloop/lanes/build.yaml', `id: build
version: 1
metric: { name: m, source: cards }
stages:
  - id: build
    done: { cmd: "echo 2 tests failing; exit 1" }
`);
  const now = new Date().toISOString();
  write('.codeloop/cards.json', JSON.stringify({
    version: 1,
    cards: [{ id: 'c-1', title: 'Card c-1', lane: 'build', laneVersion: 1, stage: 'build', retries: {}, evidence: [], events: [], createdAt: now, updatedAt: now }],
  }, null, 2));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('activity stream', () => {
  it('a session working a card leaves its prompt, edit, command and the check in order, with cursors', () => {
    expect(hook(['card', 'activate', 'c-1'], {}, { CLAUDE_CODE_SESSION_ID: 'S1' })).toBe(0);
    const session = JSON.parse(readFileSync(join(dir, '.codeloop/state/active/S1.json'), 'utf-8'));
    expect(session.label).toMatch(/^claude on .+, since \d\d:\d\d$/);

    expect(hook(['guard', 'prompt'], { session_id: 'S1', prompt: 'fix the failing card tests' })).toBe(0);
    expect(hook(['guard', 'edit'], { session_id: 'S1', tool_input: { file_path: join(dir, 'src/a.ts') } })).toBe(0);
    expect(hook(['guard', 'bash'], { session_id: 'S1', tool_input: { command: 'npm test' } })).toBe(0);
    expect(advanceCard(dir, 'c-1').outcome).toBe('failed');

    const { lines: items } = cardActivity(dir, 'c-1');
    expect(items.map(i => i.kind)).toEqual(['prompt', 'edit', 'cmd', 'check']);
    expect(items.slice(0, 3).map(i => i.session)).toEqual(['S1', 'S1', 'S1']);
    expect(items[1].file).toBe('src/a.ts');
    expect(items[2].text).toBe('npm test');
    expect(items[3]).toMatchObject({ pass: false, stage: 'build' });
    expect(items[3].output).toContain('2 tests failing');

    const cursors = items.map(i => Number(i.cursor));
    expect(cursors).toEqual([...cursors].sort((a, b) => a - b));
    const after = cardActivity(dir, 'c-1', { after: items[1].cursor });
    expect(after.lines.map(i => i.kind)).toEqual(['cmd', 'check']);
    expect(cardActivity(dir, 'c-1', { limit: 2 }).next).toBe(items[1].cursor);
  });

  it('a session with no active card appends nothing', () => {
    hook(['guard', 'prompt'], { session_id: 'S2', prompt: 'hello' });
    hook(['guard', 'edit'], { session_id: 'S2', tool_input: { file_path: join(dir, 'src/a.ts') } });
    hook(['guard', 'bash'], { session_id: 'S2', tool_input: { command: 'ls' } });
    hook(['guard', 'stop'], { session_id: 'S2' });
    expect(existsSync(join(dir, ACTIVITY_DIR))).toBe(false);
  });

  it('a commit with a Card trailer lands on that card, and an unknown id is ignored', () => {
    const git = (...args: string[]) => spawnSync('git', args, { cwd: dir, encoding: 'utf-8' });
    git('init', '-q');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'feat(x): wire it', '-m', 'Card: c-1\nCard: c-999');
    expect(hook(['guard', 'commit'], {})).toBe(0);
    const { lines: items } = cardActivity(dir, 'c-1');
    expect(items.map(i => i.kind)).toEqual(['commit']);
    expect(items[0].subject).toBe('feat(x): wire it');
    expect(existsSync(join(dir, ACTIVITY_DIR, 'c-999.jsonl'))).toBe(false);
  });

  it('a headless run copies its log into the activity before it settles', async () => {
    const { finished } = startCardRun(dir, 'c-1');
    await finished;
    const kinds = cardActivity(dir, 'c-1').lines.map(i => i.kind);
    expect(kinds).toContain('check');
    const logs = cardActivity(dir, 'c-1').lines.filter(i => i.kind === 'log').map(i => i.text);
    expect(logs.some(t => String(t).includes('2 tests failing'))).toBe(true);
    expect(logs.some(t => String(t).startsWith('c-1: failed'))).toBe(true);
  });
});
