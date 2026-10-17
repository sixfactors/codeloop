import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendActivity } from '../activity.js';
import { runAgent } from '../agent.js';
import { readCards } from '../cards.js';
import { advanceCard, createCard } from '../engine.js';
import { LEGACY_NOTICE } from '../paths.js';
import { doctorTick } from '../run.js';

let dir: string;
const entry = process.argv[1];
function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}
const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'pipe' });
const card = () => readCards(dir).cards[0];
// The doctor works a failing story once it has been quiet for a while.
const later = () => new Date(Date.now() + 2 * 3_600_000);
const starts = () => card().events.filter(e => e.action === 'agent-start').length;

beforeEach(() => {
  process.argv[1] = resolve('dist/index.js');
  dir = mkdtempSync(join(tmpdir(), 'codeloop-restart-'));
});
afterEach(() => {
  process.argv[1] = entry;
  rmSync(dir, { recursive: true, force: true });
});

describe('an agent restart', () => {
  beforeEach(() => {
    write('.codeloop/lanes/build.yaml', 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nretries: 9\nstages:\n  - id: draft\n    done: { cmd: "echo 2 of 4 tasks open; exit 1" }\n');
    // An agent that does nothing, as c-143's did 13 times at one commit.
    write('.codeloop/config.yaml', 'agents:\n  default: fake\n  fake:\n    cmd: "true"\n    timeout_minutes: 1\n    max_runs_per_day: 50\n');
    write('src/a.ts', 'one');
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    createCard(dir, { lane: 'build', title: 't', id: 'c-1' });
    // A person's edit before the first check, so that failure counts and the story reads failing.
    appendActivity(dir, 'c-1', { kind: 'edit', file: 'src/a.ts' });
    advanceCard(dir, 'c-1');
  });

  it('is refused while the head commit and the stage work are the same as at the last start', async () => {
    await doctorTick(dir, later());
    expect(starts()).toBe(1);
    const second = await doctorTick(dir, later());
    expect(starts()).toBe(1);
    expect(second.find(a => a.id === 'c-1')).toMatchObject({ action: 'agent-not-started', note: expect.stringMatching(/nothing changed since/) });
    // The refused turn does not spend a retry either: nobody worked.
    expect(card().retries.draft).toBe(2);
  });

  it('is allowed again once the head commit moved', async () => {
    await doctorTick(dir, later());
    await doctorTick(dir, later());
    expect(starts()).toBe(1);
    write('src/a.ts', 'two');
    git('commit', '-qam', 'a person fixed the setup');
    await doctorTick(dir, later());
    expect(starts()).toBe(2);
  });
});

describe('a check no story work can fix', () => {
  const lane = (cmd: string) => write('.codeloop/lanes/build.yaml', `id: build\nversion: 1\nmetric: { name: m, source: cards }\nretries: 3\nstages:\n  - id: draft\n    done: { cmd: ${JSON.stringify(cmd)} }\n`);
  const notice = LEGACY_NOTICE;

  it('is a check-error, once, when it printed only the legacy-layout notice', () => {
    lane(`echo '${notice}' >&2; exit 1`);
    createCard(dir, { lane: 'build', title: 't', id: 'c-1' });
    expect(advanceCard(dir, 'c-1').outcome).toBe('check-error');
    expect(advanceCard(dir, 'c-1').outcome).toBe('check-error');
    expect(card().retries.draft ?? 0).toBe(0);
    expect(card().events.filter(e => e.action === 'check-error')).toHaveLength(1);
    expect(card().events.some(e => e.action === 'fail')).toBe(false);
  });

  it('is a check-error when the card is not on the board where the check ran', () => {
    lane(`echo 'card "c-1" not found' >&2; exit 1`);
    createCard(dir, { lane: 'build', title: 't', id: 'c-1' });
    expect(advanceCard(dir, 'c-1').outcome).toBe('check-error');
    expect(card().retries.draft ?? 0).toBe(0);
    expect(card().events.find(e => e.action === 'check-error')?.note).toMatch(/c-1 is not on the board where the check ran/);
  });

  it('stays a failure, without the notice in its output, when the check also found something real', () => {
    lane(`echo '${notice}' >&2; echo '2 of 4 tasks open'; exit 1`);
    createCard(dir, { lane: 'build', title: 't', id: 'c-1' });
    const r = advanceCard(dir, 'c-1');
    expect(r.outcome).toBe('failed');
    expect(r.output).toBe('2 of 4 tasks open');
    expect(card().events.filter(e => e.action === 'fail')).toHaveLength(1);
  });
});

describe('an agent past its timeout', () => {
  it('is killed on time while this process is blocked in a synchronous check', async () => {
    const ticker = `node -e "setInterval(() => require('fs').appendFileSync('ticks', Date.now() + '\\\\n'), 50)"`;
    write('brief.md', 'Card: c-1\n');
    const started = Date.now();
    const running = runAgent(dir, { name: 'fake', cmd: ticker, timeoutMinutes: 0.005, maxRunsPerDay: 50 }, join(dir, 'brief.md'), join(dir, 'agent.log'));
    // Stands in for a doctor tick's spawnSync check: no timer of this process fires meanwhile.
    spawnSync('sleep', ['3']);
    const ran = await running;
    expect(ran.timedOut).toBe(true);
    expect(existsSync(join(dir, 'ticks'))).toBe(true);
    const last = Math.max(...readFileSync(join(dir, 'ticks'), 'utf-8').split('\n').filter(Boolean).map(Number));
    expect(last - started).toBeLessThan(1500);
  });
});
