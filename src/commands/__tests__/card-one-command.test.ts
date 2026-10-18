import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { runCli } from '../../__tests__/cli.js';

// One test per failure mode in specs/368-*/spec.md. Every case drives the built CLI against a
// throwaway project, so the command, the engine and the hooks are exercised together.
let dir: string;

const write = (path: string, text: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
};

const card = (id: string, stage: string, extra: Record<string, unknown> = {}) => {
  const now = new Date().toISOString();
  return { id, title: `Founders can do thing ${id}`, lane: 'build', laneVersion: 1, stage, retries: {}, evidence: [], events: [], createdAt: now, updatedAt: now, ...extra };
};
const proposed = (id: string, extra: Record<string, unknown> = {}) => card(id, 'proposed', { gate: 'proposal', awaiting: 'owner', ...extra });
const board = (...cards: unknown[]) => write('.codeloop/cards.json', JSON.stringify({ version: 1, cards }, null, 2));
const cards = (): Record<string, any>[] => JSON.parse(readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8')).cards;
const byId = (id: string) => cards().find(c => c.id === id)!;

const cli = (args: string[], env: Record<string, string> = {}, input = '') => {
  const run = runCli(args, { cwd: dir, input, env: { ...process.env, ...env } });
  return { status: run.status, out: `${run.stdout}${run.stderr}`, stdout: run.stdout };
};
const AGENT = { CODELOOP_AGENT_RUN: 'claude' };

const sessionFile = (session: string) => join(dir, '.codeloop/state/active', `${session}.json`);
function hold(session: string, cardId: string, minutesAgo = 0): void {
  const at = new Date(Date.now() - minutesAgo * 60_000);
  write(`.codeloop/state/active/${session}.json`, JSON.stringify({ session, card: cardId, startedAt: at.toISOString(), updatedAt: at.toISOString(), host: 'claude', machine: 'test-mac' }));
  utimesSync(sessionFile(session), at, at);
}
const shown = (id: string, env: Record<string, string> = {}) => JSON.parse(cli(['card', 'show', id, '--json'], env).stdout);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-one-command-'));
  write('.codeloop/config.yaml', 'project:\n  name: fixture\n');
  write('.codeloop/lanes/build.yaml', `id: build
version: 1
metric: { name: m, source: cards }
stages:
  - id: spec
    when: size >= S
    done: { cmd: "true" }
  - id: build
    done: { cmd: "true" }
`);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('start <id>', () => {
  it('starts a queued story at its first stage and leaves it the session\'s active story', () => {
    board(card('c-001', 'queued'));
    const run = cli(['start', 'c-001'], { CLAUDE_CODE_SESSION_ID: 'sess-a' });
    expect(run.status, run.out).toBe(0);
    expect(byId('c-001').stage).toBe('spec');
    expect(JSON.parse(readFileSync(sessionFile('sess-a'), 'utf-8')).card).toBe('c-001');
  });

  it('honours the stage a split child resumes at and skips stages a trivial story skips', () => {
    board(card('c-001', 'queued', { start_stage: 'build' }), card('c-002', 'queued', { size: 'trivial' }));
    expect(cli(['start', 'c-001']).status).toBe(0);
    expect(cli(['start', 'c-002']).status).toBe(0);
    expect(byId('c-001').stage).toBe('build');
    expect(byId('c-002').stage).toBe('build');
  });

  it('refuses a proposed story inside an agent run and leaves it proposed', () => {
    board(proposed('c-001'));
    const run = cli(['start', 'c-001'], AGENT);
    expect(run.status).not.toBe(0);
    expect(run.out).toMatch(/owner/);
    expect(byId('c-001').stage).toBe('proposed');
  });

  it('promotes a proposed story for the owner and makes it active', () => {
    board(proposed('c-001'));
    const run = cli(['start', 'c-001'], { CLAUDE_CODE_SESSION_ID: 'sess-a' });
    expect(run.status, run.out).toBe(0);
    expect(byId('c-001').stage).toBe('spec');
    expect(byId('c-001').gate).toBeUndefined();
    expect(existsSync(sessionFile('sess-a'))).toBe(true);
  });

  it('still makes a new story from a title', () => {
    board();
    const run = cli(['start', 'Founders can see the board', '--size', 'trivial'], { CLAUDE_CODE_SESSION_ID: 'sess-a' });
    expect(run.status, run.out).toBe(0);
    expect(cards()).toHaveLength(1);
  });
});

describe('bug', () => {
  it('files a trivial build story flagged as a bug, binds the session and prints the Card line', () => {
    board();
    const run = cli(['bug', 'Founders see the right alias when they type cards'], { CLAUDE_CODE_SESSION_ID: 'sess-a' });
    expect(run.status, run.out).toBe(0);
    const [filed] = cards();
    expect(filed).toMatchObject({ lane: 'build', size: 'trivial', bug: true, stage: 'build' });
    expect(run.stdout).toContain(`Card: ${filed.id}`);
    expect(JSON.parse(readFileSync(sessionFile('sess-a'), 'utf-8')).card).toBe(filed.id);
  });

  it('inside an agent run it is a report the owner confirms, never a flag every pick takes', () => {
    board();
    const run = cli(['bug', 'Founders see the right alias when they type cards'], AGENT);
    expect(run.status, run.out).toBe(0);
    const [filed] = cards();
    expect(filed.bug).toBeUndefined();
    expect(filed.bug_reported_by).toBeDefined();
    expect(run.stdout).toContain(`Card: ${filed.id}`);
  });
});

describe('card show and card edit --description', () => {
  it('names each blank field and the command that fills it', () => {
    board(card('c-001', 'build'));
    const out = cli(['card', 'show', 'c-001']).out;
    expect(out).toContain('story: not written');
    expect(out).toContain('description: none');
    expect(out).toMatch(/codeloop card edit c-001 --story/);
    expect(out).toMatch(/codeloop card edit c-001 --description/);
  });

  it('prints neither line once the fields are written', () => {
    board(card('c-001', 'build', { description: 'Seen on prod.', story: { as: 'founder', can: 'ship', so: 'it is live' } }));
    const out = cli(['card', 'show', 'c-001']).out;
    expect(out).not.toContain('not written');
    expect(out).not.toContain('description: none');
  });

  it('appends a dated owner line and keeps what was there, on both spellings of the command', () => {
    board(card('c-001', 'build', { description: 'Seen on prod.' }));
    expect(cli(['card', 'edit', 'c-001', '--description', 'Ship it after the fix.']).status).toBe(0);
    expect(cli(['cards', 'edit', 'c-001', '--description', 'Second decision.']).status).toBe(0);
    const text: string = byId('c-001').description;
    const lines = text.split('\n');
    expect(lines[0]).toBe('Seen on prod.');
    expect(lines[1]).toMatch(/^\d{4}-\d{2}-\d{2} owner: Ship it after the fix\.$/);
    expect(lines[2]).toMatch(/^\d{4}-\d{2}-\d{2} owner: Second decision\.$/);
  });

  it('refuses an agent run, which may not write the owner\'s decisions', () => {
    board(card('c-001', 'build', { description: 'Seen on prod.' }));
    expect(cli(['card', 'edit', 'c-001', '--description', 'x'], AGENT).status).not.toBe(0);
    expect(byId('c-001').description).toBe('Seen on prod.');
  });
});

describe('holds: release and expiry', () => {
  it('the owner releases another session\'s hold and the story records who released whose', () => {
    board(card('c-001', 'build'));
    hold('other', 'c-001');
    const run = cli(['cards', 'release', 'c-001']);
    expect(run.status, run.out).toBe(0);
    expect(existsSync(sessionFile('other'))).toBe(false);
    const released = byId('c-001').events.find((e: any) => e.action === 'release');
    expect(released.note).toMatch(/owner/);
    expect(released.note).toMatch(/claude on test-mac/);
  });

  it('an agent run releases only its own hold', () => {
    board(card('c-001', 'build'));
    hold('other', 'c-001');
    const refused = cli(['card', 'release', 'c-001'], { ...AGENT, CLAUDE_CODE_SESSION_ID: 'mine' });
    expect(refused.status).not.toBe(0);
    expect(existsSync(sessionFile('other'))).toBe(true);
    hold('mine', 'c-001');
    rmSync(sessionFile('other'));
    const own = cli(['card', 'release', 'c-001'], { ...AGENT, CLAUDE_CODE_SESSION_ID: 'mine' });
    expect(own.status, own.out).toBe(0);
    expect(existsSync(sessionFile('mine'))).toBe(false);
  });

  it('a hold quiet past monitor.stall_minutes stops showing, and the story records hold expired once', () => {
    board(card('c-001', 'build'));
    hold('gone', 'c-001', 45);
    expect(shown('c-001').session).toBeUndefined();
    const prompt = { CLAUDE_CODE_SESSION_ID: 'watcher' };
    cli(['guard', 'prompt'], prompt, JSON.stringify({ session_id: 'watcher', prompt: 'hello' }));
    cli(['guard', 'prompt'], prompt, JSON.stringify({ session_id: 'watcher', prompt: 'hello again' }));
    const expired = byId('c-001').events.filter((e: any) => e.action === 'hold-expired');
    expect(expired).toHaveLength(1);
    expect(expired[0].note).toContain('gone');
  });

  it('a hold with recent activity keeps showing', () => {
    board(card('c-001', 'build'));
    hold('busy', 'c-001', 5);
    expect(shown('c-001').session).toBe('busy');
  });

  it('a session that comes back takes its hold again on its next prompt', () => {
    board(card('c-001', 'build'));
    hold('back', 'c-001', 45);
    expect(shown('c-001').session).toBeUndefined();
    cli(['guard', 'prompt'], { CLAUDE_CODE_SESSION_ID: 'back' }, JSON.stringify({ session_id: 'back', prompt: 'hello' }));
    expect(shown('c-001').session).toBe('back');
  });

  it('an expired hold no longer blocks another session from the files its plan names', () => {
    board(card('c-001', 'build'), card('c-002', 'build'));
    write('specs/001-x/plan.md', '# plan\n\n## Files\n\n- `src/shared.ts`\n');
    write('specs/002-y/plan.md', '# plan\n\n## Files\n\n- `src/other.ts`\n');
    board(card('c-001', 'build', { spec: 'specs/001-x' }), card('c-002', 'build', { spec: 'specs/002-y' }));
    hold('gone', 'c-001', 45);
    hold('mine', 'c-002', 1);
    const edit = cli(['guard', 'edit', 'src/shared.ts'], { CLAUDE_CODE_SESSION_ID: 'mine' }, JSON.stringify({ session_id: 'mine', tool_input: { file_path: 'src/shared.ts' } }));
    expect(edit.out).not.toMatch(/belongs to c-001/);
  });
});

describe('park and move', () => {
  it('a parked story lists as parked, not as a waiting proposal, and is not a fresh proposal in the inbox', () => {
    board(card('c-001', 'build'), proposed('c-002'));
    expect(cli(['card', 'park', 'c-001', 'later']).status).toBe(0);
    const list = cli(['card', 'list']).out;
    const line = list.split('\n').find(l => l.includes('c-001'))!;
    expect(line).toContain('parked');
    expect(line).not.toContain('waiting for you: proposal');
    expect(list.split('\n').find(l => l.includes('c-002'))).toContain('waiting for you: proposal');
    const inbox = JSON.parse(cli(['inbox', '--json']).stdout);
    expect(inbox.backlog.count).toBe(1);
    expect(inbox.backlog.parked).toBe(1);
  });

  it('a parked story still returns to the stage it left when approved', () => {
    board(card('c-001', 'build'));
    cli(['card', 'park', 'c-001']);
    expect(cli(['approve', 'c-001']).status).toBe(0);
    expect(byId('c-001').stage).toBe('build');
  });

  const stuck = () => card('c-001', 'spec', { gate: 'stuck', awaiting: 'owner', events: [{ at: new Date().toISOString(), actor: 'engine', human: false, action: 'stuck', stage: 'spec', note: 'check failed' }] });

  function landCode(): void {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
    write('src/a.ts', 'export const a = 1;\n');
    execFileSync('git', ['add', 'src/a.ts'], { cwd: dir });
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'feat: a\n\nCard: c-001'], { cwd: dir });
  }

  it('moves a story stuck at a gate once its code has landed, recording who and why', () => {
    board(stuck());
    landCode();
    const run = cli(['card', 'move', 'c-001', 'build', 'code merged in a1b2c3']);
    expect(run.status, run.out).toBe(0);
    const moved = byId('c-001');
    expect(moved.stage).toBe('build');
    expect(moved.gate).toBeUndefined();
    const event = moved.events.at(-1);
    expect(event).toMatchObject({ action: 'move', actor: 'owner' });
    expect(event.note).toContain('code merged in a1b2c3');
  });

  it('keeps refusing when no code has landed, so move is not a gate bypass', () => {
    board(stuck());
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
    const run = cli(['card', 'move', 'c-001', 'build', 'trust me']);
    expect(run.status).not.toBe(0);
    expect(byId('c-001').stage).toBe('spec');
    expect(byId('c-001').gate).toBe('stuck');
  });

  it('needs a note to pass the gate', () => {
    board(stuck());
    landCode();
    expect(cli(['card', 'move', 'c-001', 'build']).status).not.toBe(0);
    expect(byId('c-001').gate).toBe('stuck');
  });
});
