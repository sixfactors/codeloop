import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { buildBrief, loadAgents, resolveAgent } from '../agent.js';
import { findCard, readCards, type Card } from '../cards.js';
import { advanceCard, approveCard, createCard, recordEvent, rejectCard } from '../engine.js';
import { nextHint } from '../flow.js';
import { planRun, runDue, runDueWithAgent } from '../run.js';
import { everyToCron, installSchedule, removeSchedule, scheduleLine, scheduleStatus } from '../schedule.js';
import { capture } from '../wiki.js';

const CLI = resolve('dist/index.js');
let dir: string;

function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

function lane(id: string, stages: string, extra = ''): void {
  write(`.codeloop/lanes/${id}.yaml`, `id: ${id}\nversion: 1\nmetric: { name: m, source: cards }\n${extra}stages:\n${stages}`);
}

function agents(cmd: string, extra = ''): void {
  write('.codeloop/config.yaml', `agents:\n  default: fake\n  fake: { cmd: ${JSON.stringify(cmd)}${extra} }\n`);
}

const card = (id: string): Card => findCard(readCards(dir).cards, id);
const run = (now?: Date) => runDueWithAgent(dir, resolveAgent(dir), now);

const TWO_STAGES = `  - id: draft
    skill: design
    output: out/{id}.md
    done: { cmd: "test -f out/{id}.md" }
  - id: polish
    output: out/{id}.polished
    done: { cmd: "test -f out/{id}.polished" }
`;
const GATED_THEN_PUBLIC = `  - id: draft
    skill: design
    output: out/{id}.md
    done: { cmd: "test -f out/{id}.md" }
    gate: { name: copy, approver: owner }
  - id: publish
    done: { cmd: "test -f out/{id}.url" }
    gate: { name: publish, approver: owner, outward: true }
`;
// Reads the brief on stdin and writes the file its Output line names.
const WRITES_OUTPUT = `sh -c 'out=$(sed -n "s/^Output: //p" | head -1); mkdir -p "$(dirname "$out")"; echo written > "$out"' < {brief}`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-agent-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('no agent configured', () => {
  it('run does what it did before, and --agent is refused', () => {
    lane('build', TWO_STAGES);
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });
    expect(loadAgents(dir).agents).toEqual({});
    expect(runDue(dir)).toEqual({ created: [], skipped: [], advanced: [{ id: 'c-001', outcome: 'failed' }], lanes: [{ lane: 'build', trigger: 'none', status: 'manual' }] });
    expect(existsSync(join(dir, '.codeloop/state/briefs'))).toBe(false);
    expect(() => resolveAgent(dir)).toThrow(/no agent is configured/);
    const cli = spawnSync('node', [CLI, 'run', '--agent'], { cwd: dir, encoding: 'utf-8' });
    expect(cli.status).toBe(2);
  });
});

describe('brief', () => {
  it('carries the skill body, the check, the latest rejection note and the wiki pages in scope', () => {
    lane('market', GATED_THEN_PUBLIC);
    write('.claude/commands/design.md', '---\ndescription: drafts\n---\nLead with the claim, then the proof.\n');
    write('.codeloop/skills.index.yaml', '- { name: design, source: .claude/commands/design.md, kind: command, description: drafts }\n');
    capture(dir, { title: 'Drafts need a source', scope: ['out/**'], body: 'Cite the page each number came from.' });
    createCard(dir, { lane: 'market', title: 'Launch post', id: 'c-001' });
    write('out/c-001.md', 'draft');
    for (const note of ['too salesy', 'no proof for the claim']) {
      advanceCard(dir, 'c-001');
      rejectCard(dir, 'c-001', 'owner', note);
    }

    const brief = buildBrief(dir, card('c-001'));
    expect(brief).toMatch(/^Card: c-001$/m);
    expect(brief).toMatch(/^Stage: draft$/m);
    expect(brief).toMatch(/^Output: out\/c-001\.md$/m);
    expect(brief).toContain('Lead with the claim, then the proof.');
    expect(brief).toContain('test -f out/c-001.md');
    expect(brief).toContain('Latest rejection: no proof for the claim');
    expect(brief).toContain('Cite the page each number came from.');
    expect(brief).toContain('Do not run `codeloop approve`');
  });
});

describe('run --agent', () => {
  it('starts the agent on each stage whose check fails, moving the card until it is done', async () => {
    lane('build', TWO_STAGES);
    agents(WRITES_OUTPUT);
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });

    const result = await run();
    expect(result.advanced).toEqual([{ id: 'c-001', outcome: 'done' }]);
    expect(card('c-001').stage).toBe('done');
    const runs = card('c-001').events.filter(e => e.action === 'agent-run');
    expect(runs).toMatchObject([{ agent: 'fake', exit: 0, stage: 'draft' }, { agent: 'fake', exit: 0, stage: 'polish' }]);
    expect(runs[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(existsSync(join(dir, runs[0].log!))).toBe(true);
    expect(readFileSync(join(dir, '.codeloop/state/briefs/c-001-draft.md'), 'utf-8')).toContain('Stage: draft');
  });

  it('does not start the agent on a stage whose check already passes, but still advances past it', async () => {
    lane('build', TWO_STAGES);
    agents('touch agent-ran');
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });
    write('out/c-001.md', 'by hand');
    write('out/c-001.polished', 'by hand');

    expect((await run()).advanced).toEqual([{ id: 'c-001', outcome: 'done' }]);
    expect(existsSync(join(dir, 'agent-ran'))).toBe(false);
  });

  it('a card with three passing stages reaches the gate in one run', async () => {
    lane('market', `  - id: draft
    output: out/{id}.md
    done: { cmd: "true" }
  - id: review
    output: out/{id}.review
    done: { cmd: "true" }
  - id: polish
    done: { cmd: "true" }
    gate: { name: copy, approver: owner }
`);
    agents('touch agent-ran');
    createCard(dir, { lane: 'market', title: 'a', id: 'c-001' });

    const result = await run();
    expect(result.advanced).toEqual([{ id: 'c-001', outcome: 'parked' }]);
    expect(card('c-001')).toMatchObject({ stage: 'polish', gate: 'copy' });
    // Every stage's check is `true`, so the agent is never needed.
    expect(existsSync(join(dir, 'agent-ran'))).toBe(false);
  });

  it('a failing check stops the loop and counts one retry, even after an earlier stage moved', async () => {
    lane('build', `  - id: draft
    output: out/{id}.md
    done: { cmd: "true" }
  - id: polish
    done: { cmd: "false" }
`);
    agents('touch agent-ran');
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });

    const result = await run();
    expect(result.advanced).toEqual([{ id: 'c-001', outcome: 'failed', next: expect.any(String) }]);
    expect(card('c-001')).toMatchObject({ stage: 'polish', retries: { polish: 1 } });
  });

  it('counts a retry and keeps the log when the agent exits non-zero, even with nothing changed since', async () => {
    lane('build', TWO_STAGES);
    agents('echo boom; exit 3');
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });

    const first = await run();
    expect(first.advanced[0]).toMatchObject({ id: 'c-001', outcome: 'failed' });
    expect(first.advanced[0].next).toContain('Agent fake exited 3; its output is in .codeloop/state/agent-runs/c-001-draft-1.log');
    expect(card('c-001')).toMatchObject({ stage: 'draft', retries: { draft: 1 } });
    expect(readFileSync(join(dir, '.codeloop/state/agent-runs/c-001-draft-1.log'), 'utf-8')).toContain('boom');
    expect(nextHint(dir, card('c-001'))).toContain('c-001-draft-1.log');

    await run();
    expect(card('c-001').retries.draft).toBe(2);
    expect(card('c-001').events.filter(e => e.action === 'agent-run').map(e => e.exit)).toEqual([3, 3]);
  });

  it('kills an agent that runs past its timeout, with its children, and counts a retry', async () => {
    lane('build', TWO_STAGES);
    agents('sleep 30 & echo $! > child.pid; wait', ', timeout_minutes: 0.005');
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });

    const started = Date.now();
    const result = await run();
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(result.advanced[0].outcome).toBe('failed');
    expect(card('c-001')).toMatchObject({ stage: 'draft', retries: { draft: 1 } });
    const ran = card('c-001').events.find(e => e.action === 'agent-run')!;
    expect(ran.exit).toBeNull();
    expect(ran.note).toMatch(/timed out/);
    const child = parseInt(readFileSync(join(dir, 'child.pid'), 'utf-8'), 10);
    await new Promise(r => setTimeout(r, 200));
    expect(() => process.kill(child, 0)).toThrow();
  });

  it('gives a rejected stage back to the agent with the note, although its check still passes', async () => {
    lane('market', GATED_THEN_PUBLIC);
    // Writes the output with the rejection note from the brief, or "first draft" when there is none.
    agents(`sh -c 'b=$(cat); out=$(printf "%s\\n" "$b" | sed -n "s/^Output: //p" | head -1); mkdir -p "$(dirname "$out")"; printf "%s\\n" "$b" | grep "rejection:" > "$out" || echo "first draft" > "$out"' < {brief}`);
    createCard(dir, { lane: 'market', title: 'Launch post', id: 'c-1' });
    await run();
    expect(card('c-1').gate).toBe('copy');
    expect(readFileSync(join(dir, 'out/c-1.md'), 'utf-8')).toBe('first draft\n');

    rejectCard(dir, 'c-1', 'owner', 'cite the measured number');
    const again = await run();
    expect(again.agents).toMatchObject([{ id: 'c-1', stage: 'draft', started: true }]);
    expect(readFileSync(join(dir, 'out/c-1.md'), 'utf-8')).toBe('- Latest rejection: cite the measured number\n');
    expect(card('c-1')).toMatchObject({ stage: 'draft', gate: 'copy' });

    // Redone once per rejection: the card is waiting again, so nothing starts.
    expect((await run()).agents).toEqual([]);
  });

  it('does not start an agent for a card that is waiting on a person', async () => {
    lane('market', GATED_THEN_PUBLIC);
    agents('touch agent-ran');
    createCard(dir, { lane: 'market', title: 'a', id: 'c-001' });
    write('out/c-001.md', 'draft');
    advanceCard(dir, 'c-001');
    expect(card('c-001').gate).toBe('copy');

    const result = await run();
    expect(result).toMatchObject({ advanced: [], agents: [] });
    expect(existsSync(join(dir, 'agent-ran'))).toBe(false);
  });

  it('does not start an agent for a public step that has not been approved', async () => {
    lane('market', GATED_THEN_PUBLIC);
    agents('touch agent-ran');
    createCard(dir, { lane: 'market', title: 'a', id: 'c-001' });
    write('out/c-001.md', 'draft');
    advanceCard(dir, 'c-001');
    approveCard(dir, 'c-001', 'owner');
    advanceCard(dir, 'c-001');
    // Entering the public step parks the card before anything runs.
    expect(card('c-001')).toMatchObject({ stage: 'publish', gate: 'publish' });
    expect((await run()).agents).toEqual([]);

    // A rejection at the entry gate judges the stage before it: the card goes back to draft with
    // the note, and the next run gives draft to the agent again although its check still passes.
    rejectCard(dir, 'c-001', 'owner', 'not this week');
    expect(card('c-001').stage).toBe('draft');
    expect(card('c-001').gate).toBeUndefined();
    expect(buildBrief(dir, card('c-001'))).toContain('Latest return from publish: not this week');
    const result = await run();
    expect(result.agents).toEqual([expect.objectContaining({ id: 'c-001', stage: 'draft', agent: 'fake', started: true })]);
    expect(existsSync(join(dir, 'agent-ran'))).toBe(true);
    // The unchanged draft passes its gate again on the approval it already holds and parks on entry to publish.
    expect(card('c-001')).toMatchObject({ stage: 'publish', gate: 'publish' });
    rmSync(join(dir, 'agent-ran'));
    expect((await run()).agents).toEqual([]);
    expect(existsSync(join(dir, 'agent-ran'))).toBe(false);

    approveCard(dir, 'c-001', 'owner');
    await run();
    expect(existsSync(join(dir, 'agent-ran'))).toBe(true);
  });

  it('stops starting agents once max_runs_per_day is reached, and says why', async () => {
    lane('build', TWO_STAGES);
    agents('echo ran >> agent-ran', ', max_runs_per_day: 1');
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });
    createCard(dir, { lane: 'build', title: 'b', id: 'c-002' });

    const result = await run();
    expect(result.agents!.map(a => a.started)).toEqual([true, false]);
    expect(result.agents![1].reason).toBe('agent fake has started 1 time in the last 24 hours (max_runs_per_day is 1)');
    expect(readFileSync(join(dir, 'agent-ran'), 'utf-8')).toBe('ran\n');
    expect(card('c-002').events.some(e => e.action.startsWith('agent-'))).toBe(false);

    // The count is taken from events, so it holds across runs until the day has passed.
    expect((await run()).agents!.every(a => !a.started)).toBe(true);
    expect((await run(new Date(Date.now() + 25 * 3_600_000))).agents![0].started).toBe(true);
  });

  it('works on at most `wip` cards of a lane and none while capacity.gates_per_day cards are waiting', async () => {
    lane('build', TWO_STAGES, 'wip: 2\n');
    lane('market', GATED_THEN_PUBLIC);
    agents('echo ran >> agent-ran');
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });
    createCard(dir, { lane: 'build', title: 'b', id: 'c-002' });
    lane('build', TWO_STAGES, 'wip: 1\n');

    const limited = await run();
    expect(limited.agents!.map(a => a.started)).toEqual([true, false]);
    expect(limited.agents![1].reason).toMatch(/lane build works on 1 card at a time \(wip\)/);

    createCard(dir, { lane: 'market', title: 'c', id: 'c-003' });
    write('out/c-003.md', 'draft');
    advanceCard(dir, 'c-003');
    writeFileSync(join(dir, '.codeloop/config.yaml'), readFileSync(join(dir, '.codeloop/config.yaml'), 'utf-8') + 'capacity: { gates_per_day: 1 }\n');
    const full = await run();
    expect(full.agents!.map(a => a.started)).toEqual([false, false]);
    expect(full.agents![0].reason).toMatch(/1 card is waiting on you \(capacity.gates_per_day is 1\)/);
  });

  it('leaves a card alone while an earlier run is still working on it', async () => {
    lane('build', TWO_STAGES);
    agents('touch agent-ran');
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });
    recordEvent(dir, 'c-001', () => ({ action: 'agent-start', agent: 'fake', log: 'x.log' }));

    const result = await run();
    expect(result.agents![0]).toMatchObject({ started: false, reason: expect.stringMatching(/still running/) });
    expect(result.advanced).toEqual([]);
    expect(card('c-001').retries).toEqual({});
    expect(existsSync(join(dir, 'agent-ran'))).toBe(false);
  });

  it('runs the agent as CODELOOP_ROLE=agent, and an approve from inside it is refused even with --as owner', async () => {
    lane('market', GATED_THEN_PUBLIC);
    lane('build', TWO_STAGES);
    agents(`echo "$CODELOOP_ROLE" > role.txt; node ${CLI} approve c-001 --as owner > approve.out 2>&1; echo $? > approve.exit`);
    createCard(dir, { lane: 'market', title: 'gated', id: 'c-001' });
    write('out/c-001.md', 'draft');
    advanceCard(dir, 'c-001');
    createCard(dir, { lane: 'build', title: 'worked on', id: 'c-002' });

    await run();
    expect(readFileSync(join(dir, 'role.txt'), 'utf-8').trim()).toBe('agent');
    expect(readFileSync(join(dir, 'approve.exit'), 'utf-8').trim()).toBe('2');
    expect(readFileSync(join(dir, 'approve.out'), 'utf-8')).toMatch(/refused: .*acts as agent/);
    expect(card('c-001').gate).toBe('copy');
  });

  it('--dry-run names what would run and starts nothing', () => {
    lane('build', TWO_STAGES);
    agents('touch agent-ran < {brief}');
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });
    const before = readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8');

    const lines = planRun(dir, resolveAgent(dir));
    expect(lines.join('\n')).toMatch(/c-001: would start agent fake on draft unless its check already passes: touch agent-ran < .*c-001-draft\.md/);
    expect(existsSync(join(dir, 'agent-ran'))).toBe(false);
    expect(existsSync(join(dir, '.codeloop/state'))).toBe(false);
    expect(readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8')).toBe(before);
  });
});

describe('schedule', () => {
  // Stands in for crontab(1): `-l` prints the stored table, `-` replaces it from stdin.
  function fakeCrontab(initial: string): string {
    const bin = join(dir, 'crontab');
    writeFileSync(join(dir, 'crontab.txt'), initial);
    writeFileSync(bin, `#!/bin/sh\nif [ "$1" = "-l" ]; then cat "${dir}/crontab.txt"; else cat > "${dir}/crontab.txt"; fi\n`);
    chmodSync(bin, 0o755);
    return bin;
  }
  const line = (cron: string) => scheduleLine(dir, { cron, agent: 'fake', entry: '/opt/codeloop/dist/index.js', path: '/usr/bin:/bin' });

  it('turns --every into a cron expression and refuses an interval cron cannot express', () => {
    expect(everyToCron('30m')).toBe('*/30 * * * *');
    expect(everyToCron('1h')).toBe('0 * * * *');
    expect(everyToCron('6h')).toBe('0 */6 * * *');
    expect(() => everyToCron('45m')).toThrow(/--cron/);
    expect(() => everyToCron('soon')).toThrow(/--cron/);
  });

  it('writes a line that runs `run --agent` in this repo and logs to state/run.log', () => {
    expect(line('*/30 * * * *')).toBe(
      `*/30 * * * * cd '${dir}' && PATH='/usr/bin:/bin' '${process.execPath}' '/opt/codeloop/dist/index.js' run --agent fake >> .codeloop/state/run.log 2>&1 # codeloop:${dir}`,
    );
  });

  it('install keeps other crontab entries and replaces its own; remove takes only its own', () => {
    const crontab = fakeCrontab('0 9 * * * /usr/bin/backup\n');
    installSchedule(dir, line('*/30 * * * *'), crontab);
    installSchedule(dir, line('0 * * * *'), crontab);
    const table = readFileSync(join(dir, 'crontab.txt'), 'utf-8');
    expect(table.split('\n').filter(Boolean)).toEqual(['0 9 * * * /usr/bin/backup', line('0 * * * *')]);
    expect(scheduleStatus(dir, crontab).line).toBe(line('0 * * * *'));

    expect(removeSchedule(dir, crontab)).toBe(true);
    expect(readFileSync(join(dir, 'crontab.txt'), 'utf-8')).toBe('0 9 * * * /usr/bin/backup\n');
    expect(scheduleStatus(dir, crontab).line).toBeUndefined();
    expect(removeSchedule(dir, crontab)).toBe(false);
  });
});
