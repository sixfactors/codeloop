import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendActivity } from '../activity.js';
import { runAgent } from '../agent.js';
import { readCards, stuckReason } from '../cards.js';
import { advanceCard, approveCard, createCard } from '../engine.js';
import { journeyOf, storyLiveLine } from '../journey.js';
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
const later = (h = 2) => new Date(Date.now() + h * 3_600_000);
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
  let outside: string;
  // Outside the repo, so counting the check's runs is not itself a change to the tree.
  const checks = () => (existsSync(join(outside, 'checks')) ? readFileSync(join(outside, 'checks'), 'utf-8').split('\n').filter(Boolean).length : 0);
  beforeEach(() => {
    outside = mkdtempSync(join(tmpdir(), 'codeloop-restart-out-'));
    write('.codeloop/lanes/build.yaml', `id: build\nversion: 1\nmetric: { name: m, source: cards }\nretries: 3\nstages:\n  - id: draft\n    done: { cmd: ${JSON.stringify(`echo x >> ${join(outside, 'checks')}; echo 2 of 4 tasks open; exit 1`)} }\n`);
    // An agent that exits 0 and changes nothing.
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
  afterEach(() => rmSync(outside, { recursive: true, force: true }));

  it('parks the story stuck once the agent ran and changed nothing, and the doctor stops checking it', async () => {
    await doctorTick(dir, later(2));
    expect(starts()).toBe(1);
    const afterRun = checks();
    const second = await doctorTick(dir, later(3));
    // The check already failed on this head and work after the start, so it is not run again.
    expect(checks()).toBe(afterRun);
    expect(second.find(a => a.id === 'c-1')).toMatchObject({ action: 'agent-not-started', note: expect.stringMatching(/the agent ran and changed nothing; a person needs to look/) });
    expect(card().gate).toBe('stuck');
    expect(stuckReason(card())).toBe('the agent ran and changed nothing; a person needs to look');
    const seen = checks();
    for (let h = 4; h < 8; h++) await doctorTick(dir, later(h));
    expect(checks()).toBe(seen);
    expect(starts()).toBe(1);
    expect(card().gate).toBe('stuck');
  });

  it('is allowed again once the head commit moved', async () => {
    await doctorTick(dir, later(2));
    expect(starts()).toBe(1);
    write('src/a.ts', 'two');
    git('commit', '-qam', 'a person fixed the setup');
    await doctorTick(dir, later(3));
    expect(starts()).toBe(2);
  });
});

describe('an agent restart on a check that writes into the repo', () => {
  it('parks on unchanged work though the check rewrote an untracked report file', async () => {
    write('.codeloop/lanes/build.yaml', 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nretries: 3\nstages:\n  - id: draft\n    done: { cmd: "date +%s%N >> junit.xml; echo 2 of 4 tasks open; exit 1" }\n');
    write('.codeloop/config.yaml', 'agents:\n  default: fake\n  fake:\n    cmd: "true"\n    timeout_minutes: 1\n    max_runs_per_day: 50\n');
    write('src/a.ts', 'one');
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    createCard(dir, { lane: 'build', title: 't', id: 'c-1' });
    appendActivity(dir, 'c-1', { kind: 'edit', file: 'src/a.ts' });
    advanceCard(dir, 'c-1');
    for (let h = 2; h < 6; h++) await doctorTick(dir, later(h));
    expect(starts()).toBe(1);
    expect(card().gate).toBe('stuck');
    expect(stuckReason(card())).toBe('the agent ran and changed nothing; a person needs to look');
  });
});

describe('a failing story under the retry model', () => {
  const NOTHING = 'the agent ran and changed nothing; a person needs to look';
  beforeEach(() => {
    write('.codeloop/lanes/build.yaml', 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nretries: 3\nstages:\n  - id: draft\n    done: { cmd: "echo 2 of 4 tasks open; exit 1" }\n');
    write('.codeloop/config.yaml', 'agents:\n  default: fake\n  fake:\n    cmd: "true"\n    timeout_minutes: 1\n    max_runs_per_day: 50\n');
    write('src/a.ts', 'one');
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    createCard(dir, { lane: 'build', title: 't', id: 'c-1' });
  });
  // Three failures, each with a person's work line before it: parked stuck at the retry limit, no agent ever started.
  const stuckOnCount = () => {
    for (let i = 0; i < 3; i++) {
      appendActivity(dir, 'c-1', { kind: 'edit', file: 'src/a.ts' });
      advanceCard(dir, 'c-1');
    }
    expect(card()).toMatchObject({ gate: 'stuck', retries: { draft: 3 } });
  };

  it('gets its first agent from the doctor though no failure counted yet', async () => {
    expect(advanceCard(dir, 'c-1').outcome).toBe('failed');
    expect(card().retries.draft ?? 0).toBe(0);
    await doctorTick(dir, later(2));
    expect(starts()).toBe(1);
  });

  it('gets exactly one more start from the doctor after approve on stuck, then parks on unchanged work', async () => {
    stuckOnCount();
    approveCard(dir, 'c-1', 'owner');
    expect(card().gate).toBeUndefined();
    expect(card().retries.draft).toBe(0);
    await doctorTick(dir, later(2));
    expect(starts()).toBe(1);
    await doctorTick(dir, later(3));
    expect(starts()).toBe(1);
    expect(card().gate).toBe('stuck');
    expect(stuckReason(card())).toBe(NOTHING);
  });

  it('says on the story which rule parked it', async () => {
    stuckOnCount();
    const counted = 'the check failed 3 times with work tried before each; a person needs to look';
    expect(storyLiveLine(dir, card(), 'stuck')?.text).toBe(`stuck: ${counted}`);
    expect(journeyOf(dir, card()).holder.stuckReason).toBe(counted);
    approveCard(dir, 'c-1', 'owner');
    await doctorTick(dir, later(2));
    await doctorTick(dir, later(3));
    expect(storyLiveLine(dir, card(), 'stuck')?.text).toBe(`stuck: ${NOTHING}`);
    expect(journeyOf(dir, card()).holder.stuckReason).toBe(NOTHING);
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

describe('an agent run', () => {
  it('registers its timeout watchdog beside the agent, and ends it when the agent exits', async () => {
    write('brief.md', 'Card: c-1\n');
    const ran = await runAgent(dir, { name: 'fake', cmd: 'sleep 0.3; cat .codeloop/state/procs/*.json > seen.txt', timeoutMinutes: 1, maxRunsPerDay: 50 }, join(dir, 'brief.md'), join(dir, 'agent.log'));
    expect(ran.exit).toBe(0);
    const seen = readFileSync(join(dir, 'seen.txt'), 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l) as { pid: number; purpose: string });
    const watchdog = seen.find(r => /watchdog/.test(r.purpose));
    expect(seen.map(r => r.purpose).sort()).toEqual(['agent fake', 'agent fake watchdog']);
    expect(readdirSync(join(dir, '.codeloop/state/procs'))).toEqual([]);
    const alive = () => { try { process.kill(watchdog!.pid, 0); return true; } catch { return false; } };
    for (let i = 0; i < 20 && alive(); i++) await new Promise(r => setTimeout(r, 50));
    expect(alive()).toBe(false);
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
