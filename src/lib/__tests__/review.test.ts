import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { readCards } from '../cards.js';
import { advanceCard, approveCard, createCard, RefusalError } from '../engine.js';
import { approveFlow, gateApproval } from '../flow.js';
import { fileProblem } from '../../commands/check.js';
import { evalProposal, rollback } from '../proposals.js';
import { cronError, cronMatches } from '../cron.js';
import { lintLane, loadLane } from '../lane.js';
import { runDue } from '../run.js';
import { checkEnv } from '../shell.js';
import { newSpec } from '../spec.js';
import { verify } from '../verify.js';

let dir: string;

function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

function lane(id: string, body: string): void {
  write(`.codeloop/lanes/${id}.yaml`, `id: ${id}\nversion: 1\nmetric: { name: m, source: cards }\n${body}`);
}

const DRAFT = (check: string) => `stages:
  - id: draft
    output: out/{id}.md
    done: { cmd: "${check}" }
    gate: { name: copy, approver: owner }
  - id: ship
    done: { cmd: "true" }
`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-review-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('an approval covers what was approved', () => {
  function parkedAndApproved(): void {
    lane('market', DRAFT('test -s out/{id}.md'));
    write('out/c-1.md', 'the copy the owner read');
    createCard(dir, { lane: 'market', title: 't', id: 'c-1' });
    advanceCard(dir, 'c-1');
    approveCard(dir, 'c-1', 'owner');
  }

  it('asks again when the stage output changed after the approval', () => {
    parkedAndApproved();
    write('out/c-1.md', 'different copy, never seen by the owner');

    const result = advanceCard(dir, 'c-1');
    expect(result.outcome).toBe('parked');
    expect(result.card).toMatchObject({ stage: 'draft', gate: 'copy' });
    expect(result.card.events.at(-1)?.note).toMatch(/changed since it was approved/);

    approveCard(dir, 'c-1', 'owner');
    expect(advanceCard(dir, 'c-1').card.stage).toBe('ship');
  });

  it('asks again when the check itself changed after the approval', () => {
    parkedAndApproved();
    lane('market', DRAFT('true'));

    expect(advanceCard(dir, 'c-1').card).toMatchObject({ stage: 'draft', gate: 'copy' });
  });

  it('moves on when nothing changed', () => {
    parkedAndApproved();
    expect(advanceCard(dir, 'c-1').card.stage).toBe('ship');
    expect(readCards(dir).cards[0].gate).toBeUndefined();
  });
});

describe('roles', () => {
  it('refuses a lane rollback from anyone but the owner', () => {
    lane('market', DRAFT('true'));
    write('.codeloop/lanes/.history/market.v0.yaml', 'id: market\nversion: 0\nmetric: { name: m, source: cards }\nstages: []\n');

    expect(() => rollback(dir, 'market', 'agent')).toThrow(RefusalError);
    expect(() => rollback(dir, 'market', 'reviewer')).toThrow(/needs the owner/);
    expect(rollback(dir, 'market', 'owner')).toMatchObject({ from: 1, to: 0 });
  });

  it('reports a local approval as unauthenticated, and refuses when there is none', () => {
    lane('market', DRAFT('true'));
    write('out/c-1.md', 'x');
    createCard(dir, { lane: 'market', title: 't', id: 'c-1' });
    advanceCard(dir, 'c-1');
    expect(() => gateApproval(dir, 'c-1', 'copy')).toThrow(/no approval for gate "copy"/);

    approveCard(dir, 'c-1', 'owner');
    expect(gateApproval(dir, '1', 'copy')).toMatchObject({ actor: 'owner', authenticated: false });
  });
});

describe('cron', () => {
  const at = (day: number, hour: number, minute: number) => new Date(2026, 9, day, hour, minute); // October 2026; the 5th is a Monday

  it('matches ranges, steps, stepped ranges and lists of those', () => {
    expect(cronMatches('*/15 * * * *', at(5, 9, 30))).toBe(true);
    expect(cronMatches('*/15 * * * *', at(5, 9, 31))).toBe(false);
    expect(cronMatches('0 9-17 * * MON-FRI', at(5, 17, 0))).toBe(true);
    expect(cronMatches('0 9-17 * * MON-FRI', at(5, 18, 0))).toBe(false);
    expect(cronMatches('0 9-17 * * MON-FRI', at(4, 12, 0))).toBe(false);
    expect(cronMatches('0 8-20/4 * * *', at(5, 16, 0))).toBe(true);
    expect(cronMatches('0 8-20/4 * * *', at(5, 18, 0))).toBe(false);
    expect(cronMatches('0,30 6,9-10 * * *', at(5, 10, 30))).toBe(true);
  });

  it('rejects what it cannot parse, in lint, before a run meets it', () => {
    for (const bad of ['*/0 * * * *', '70 * * * *', '5-1 * * * *', 'every day', '0 9 * *']) expect(cronError(bad), bad).not.toBeNull();
    lane('nightly', 'trigger: { cron: "0 25 * * *" }\nstages:\n  - { id: s, done: { cmd: "true" } }\n');
    expect(lintLane(loadLane(dir, 'nightly'))[0]).toMatch(/unsupported cron field "25"/);
  });

  it('reports a lane whose cron cannot be parsed and still runs the others', () => {
    lane('broken', 'trigger: { cron: "0 25 * * *" }\nstages:\n  - { id: s, done: { cmd: "true" } }\n');
    lane('nightly', 'trigger: { cron: "*/5 * * * *" }\nstages:\n  - { id: s, done: { cmd: "false" } }\n');

    const result = runDue(dir, at(5, 9, 0));
    expect(result.created.map(c => c.lane)).toEqual(['nightly']);
    expect(result.skipped).toEqual([{ lane: 'broken', reason: expect.stringMatching(/unsupported cron field "25"/) }]);
  });
});

describe('a missing lane', () => {
  it('does not strand a finishing card when on_done names a lane that does not exist', () => {
    lane('build', 'on_done: { start: marketing }\nstages:\n  - { id: ship, done: { cmd: "true" } }\n');
    createCard(dir, { lane: 'build', title: 't', id: 'c-1' });

    const result = advanceCard(dir, 'c-1');
    expect(result.outcome).toBe('done');
    expect(result.started).toEqual([]);
    expect(readCards(dir).cards).toHaveLength(1);
    expect(result.card.events.at(-1)).toMatchObject({ action: 'on_done-failed', note: expect.stringMatching(/lane "marketing" not found/) });
  });

  it('reports a card whose lane file is gone and still advances the rest', () => {
    lane('gone', 'stages:\n  - { id: s, done: { cmd: "true" } }\n');
    lane('market', 'stages:\n  - { id: s, done: { cmd: "true" } }\n');
    createCard(dir, { lane: 'gone', title: 'a', id: 'c-1' });
    createCard(dir, { lane: 'market', title: 'b', id: 'c-2' });
    rmSync(join(dir, '.codeloop/lanes/gone.yaml'));

    expect(runDue(dir).advanced).toEqual([
      { id: 'c-1', outcome: 'refused', note: expect.stringMatching(/lane "gone" not found/) },
      { id: 'c-2', outcome: 'done' },
    ]);
  });
});

describe('lane eval refuses a weaker lane', () => {
  const LIVE = `retries: 3
stages:
  - id: draft
    done: { cmd: "true" }
    gate: { name: copy, approver: owner }
  - id: publish
    done: { cmd: "true" }
    gate: { name: publish, approver: owner, outward: true }
`;
  const propose = (body: string, evalYaml = '') => {
    write('.codeloop/proposals/p/lane.yaml', `id: market\nversion: 2\nmetric: { name: m, source: cards }\n${body}`);
    write('.codeloop/proposals/p/eval.yaml', evalYaml);
    return evalProposal(dir, 'p');
  };

  beforeEach(() => lane('market', LIVE));

  it.each([
    ['removes a gate', LIVE.replace('    gate: { name: copy, approver: owner }\n', ''), 'remove-gate:draft'],
    ['changes who approves', LIVE.replace('name: copy, approver: owner', 'name: copy, approver: reviewer'), 'approver:draft'],
    ['drops the public-step marking', LIVE.replace(', outward: true', ''), 'remove-outward:publish'],
    ['lowers retries to 0', LIVE.replace('retries: 3', 'retries: 0'), 'retries-0'],
  ])('fails a proposal that %s', (_name, body, change) => {
    const result = propose(body);
    expect(result.exitCode).toBe(1);
    expect(result.weakening).toEqual([expect.objectContaining({ change, accepted: false })]);
  });

  it('fails a proposal that removes a stage finished cards passed, gate or not', () => {
    lane('market', 'stages:\n  - { id: brief, done: { cmd: "true" } }\n  - { id: draft, done: { cmd: "true" } }\n');
    createCard(dir, { lane: 'market', title: 't', id: 'c-1' });
    advanceCard(dir, 'c-1');
    advanceCard(dir, 'c-1');

    const result = propose('stages:\n  - { id: draft, done: { cmd: "true" } }\n');
    expect(result.exitCode).toBe(1);
    expect(result.weakening.map(w => w.change)).toEqual(['remove-stage:brief']);
  });

  it('goes green when eval.yaml accepts the weakening with a reason, and records the reason', () => {
    const body = LIVE.replace('    gate: { name: copy, approver: owner }\n', '');
    expect(propose(body, 'accept_weakening:\n  - change: remove-gate:draft\n').exitCode).toBe(1);

    const result = propose(body, 'accept_weakening:\n  - change: remove-gate:draft\n    reason: copy is reviewed in the pull request now\n');
    expect(result.green).toBe(true);
    expect(result.weakening).toEqual([expect.objectContaining({ change: 'remove-gate:draft', accepted: true, reason: 'copy is reviewed in the pull request now' })]);
  });
});

describe('check file', () => {
  it('fails on an empty or whitespace-only file when no --has is given', () => {
    write('empty.md', '');
    write('blank.md', '  \n\n\t\n');
    write('real.md', 'verdict: build\n');

    expect(fileProblem(join(dir, 'empty.md'), [])).toMatch(/is empty/);
    expect(fileProblem(join(dir, 'blank.md'), [])).toMatch(/is empty/);
    expect(fileProblem(join(dir, 'real.md'), [])).toBeNull();
    expect(fileProblem(join(dir, 'real.md'), ['verdict:', 'proof:'])).toMatch(/missing: "proof:"/);
    expect(fileProblem(join(dir, 'nope.md'), [])).toMatch(/missing file/);
  });
});

describe('approving a stage that waits for an event', () => {
  it('moves the card on when the event had already arrived, without asking for it again', () => {
    lane('build', 'stages:\n  - id: review\n    done: { event: pr.merged }\n    gate: { name: pr, approver: reviewer }\n  - { id: ship, done: { cmd: "true" } }\n');
    createCard(dir, { lane: 'build', title: 't', id: 'c-1' });
    expect(advanceCard(dir, 'c-1', { event: 'pr.merged' }).card.gate).toBe('pr');

    const result = approveFlow(dir, 'c-1', 'reviewer');
    expect(result.advanced?.card.stage).toBe('ship');
  });

  it('approves a public step that waits for an event and leaves it waiting, without an error', () => {
    lane('build', 'stages:\n  - id: live\n    done: { event: deploy.prod.ok }\n    gate: { name: prod, approver: owner, outward: true }\n');
    createCard(dir, { lane: 'build', title: 't', id: 'c-1' });

    const result = approveFlow(dir, 'c-1', 'owner');
    expect(result.advanced).toBeUndefined();
    expect(readCards(dir).cards[0]).toMatchObject({ stage: 'live' });
    expect(readCards(dir).cards[0].gate).toBeUndefined();
    expect(advanceCard(dir, 'c-1', { event: 'deploy.prod.ok' }).outcome).toBe('done');
  });
});

describe('two cards with the same number', () => {
  it('get separate spec, use-case and evidence folders, and a bare number is refused as ambiguous', async () => {
    lane('build', 'stages:\n  - { id: s, output: "{spec}/out.md", done: { cmd: "true" } }\n');
    createCard(dir, { lane: 'build', title: 'First', id: 'CL-001' });
    createCard(dir, { lane: 'build', title: 'Second', id: 'c-001' });

    expect(newSpec(dir, 'CL-001').dir).toBe('specs/001-first');
    expect(newSpec(dir, 'c-001').dir).toBe('specs/c-001-second');

    write('specs/c-001-second/spec.md', 'acceptance:\n- US1 Given a, when b, then c.\n');
    write('usecases/c-001/uc.yaml', 'id: uc-1\naccept: US1\nlayers:\n  cli: { run: "true" }\n');
    expect((await verify(dir, 'C-001')).exitCode).toBe(0);
    expect(existsSync(join(dir, 'evidence/c-001/verify.md'))).toBe(true);
    expect(existsSync(join(dir, 'evidence/001'))).toBe(false);
    await expect(verify(dir, '1')).rejects.toThrow(/matches CL-001, c-001/);
  });
});

describe('unattended retries on a stage with no output file', () => {
  it('does not count a failure again while the working tree is unchanged, even though the check output differs each time', () => {
    const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'pipe' });
    lane('build', 'stages:\n  - { id: build, done: { cmd: "echo took $RANDOM$RANDOM ms; exit 1" } }\n');
    write('src/a.ts', 'one');
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    createCard(dir, { lane: 'build', title: 't', id: 'c-1' });
    const retries = () => readCards(dir).cards[0].retries.build;

    runDue(dir);
    runDue(dir);
    runDue(dir);
    expect(retries()).toBe(1);

    write('src/a.ts', 'two');
    expect(runDue(dir).advanced).toEqual([{ id: 'c-1', outcome: 'failed' }]);
    write('src/a.ts', 'three');
    runDue(dir);
    expect(retries()).toBe(3);
  });
});

describe('small rules', () => {
  it('refuses a new card once the number waiting equals gates_per_day', () => {
    write('.codeloop/config.yaml', 'capacity:\n  gates_per_day: 1\n');
    lane('market', DRAFT('true'));
    createCard(dir, { lane: 'market', title: 'a', id: 'c-1' });
    advanceCard(dir, 'c-1');

    expect(() => createCard(dir, { lane: 'market', title: 'b', id: 'c-2' })).toThrow(/1 cards? (is|are) waiting/);
  });

  it('titles a cron card with the local date of its slot', () => {
    process.env.TZ = 'America/Los_Angeles';
    lane('nightly', 'trigger: { cron: "30 23 * * *" }\nstages:\n  - { id: s, done: { cmd: "false" } }\n');
    // 23:31 on 5 October in Los Angeles is already 6 October in UTC.
    runDue(dir, new Date(2026, 9, 5, 23, 31));
    expect(readCards(dir).cards[0].title).toBe('nightly 2026-10-05');
    delete process.env.TZ;
  });

  it('keeps the codeloop shim in a private directory', () => {
    const shimDir = checkEnv(join(dir, 'entry.js')).PATH!.split(':')[0];
    expect(statSync(shimDir).mode & 0o777).toBe(0o700);
    expect(shimDir).not.toContain(String(process.pid));
  });
});
