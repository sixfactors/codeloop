import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readActivity } from '../activity.js';
import { findCard, readCards, type Card } from '../cards.js';
import { advanceCard, approveCard, createCard, recordEvent } from '../engine.js';
import { orchBatch, readOrch } from '../orch.js';
import { formBatch, holdsLease, runningBuilders } from '../orch-isolation.js';
import { newSpec } from '../spec.js';

// c-314: several small stories build in one agent turn, each judged alone. The builder is one
// scripted agent run for the whole batch: per story it writes the story's file, commits it with
// that story's trailer and hands back through the real CLI.

const CLI = join(process.env.CODELOOP_TEST_DIST ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'dist'), 'index.js');
const GIT = 'git -c user.email=a@b -c user.name=t';

let root: string;
let dir: string;
const sh = (cmd: string, cwd = dir) => execSync(cmd, { cwd, encoding: 'utf8' }).trim();
const card = (id: string): Card => findCard(readCards(dir).cards, id);

const LANE = `id: build
version: 1
retries: 3
metric: { name: m, source: cards }
stages:
  - id: build
    done: { cmd: "node ${CLI} check scope {id}" }
  - id: verify
    done: { cmd: "true" }
    gate: { name: local, approver: owner }
  - id: ship
    done: { cmd: "false" }
`;

// Per story in $CODELOOP_BATCH: `skip-<id>` makes it hand back without its file (its proof fails);
// `mix-<id>` puts the next story's file into this story's commit as well.
const AGENT = `#!/bin/sh
echo run >> agent-runs.txt
for id in $CODELOOP_BATCH; do
  if [ ! -f "skip-$id" ]; then
    mkdir -p src && echo "$id" > "src/$id.txt"
    git add "src/$id.txt"
    if [ -f "mix-$id" ]; then other=$(cat "mix-$id"); echo "$other" > "src/$other.txt"; git add "src/$other.txt"; fi
    ${GIT} commit -qm "fix: $id

Card: $id"
  fi
  node "${CLI}" card handback "$id" --branch "$(git rev-parse --abbrev-ref HEAD)" --head "$(git rev-parse HEAD)" --proof "test -f src/$id.txt" --left "nothing"
done
`;

/** Stories at build, each planning `src/<id>.txt` (or the files given). */
function project(stories: { id: string; size?: string; files?: string[]; feature?: string }[]) {
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, 'fake-agent.sh'), AGENT);
  chmodSync(join(dir, 'fake-agent.sh'), 0o755);
  writeFileSync(join(dir, '.codeloop/config.yaml'), `project:\n  name: demo\nagents:\n  default: fake\n  fake:\n    cmd: "sh ${join(dir, 'fake-agent.sh')} {brief}"\n    timeout_minutes: 2\norch:\n  isolation: tree\n  quick_exit_seconds: 0\n`);
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), LANE);
  writeFileSync(join(dir, '.gitignore'), '.codeloop/state/\nfake-agent.sh\nagent-runs.txt\nskip-*\nmix-*\n');
  sh(`git init -q -b main && git add -A && ${GIT} commit -qm init`);
  for (const s of stories) {
    createCard(dir, { lane: 'build', title: `Fix ${s.id}`, id: s.id, fields: { size: s.size ?? 'S', ...(s.feature ? { feature: s.feature } : {}) } });
    const { dir: spec } = newSpec(dir, s.id);
    writeFileSync(join(dir, spec, 'plan.md'), `# plan\n\n## Files\n\n${(s.files ?? [`src/${s.id}.txt`]).map(f => `- ${f}`).join('\n')}\n`);
  }
  sh(`git add -A && ${GIT} commit -qm specs`);
}

const runs = () => readFileSync(join(dir, 'agent-runs.txt'), 'utf-8').trim().split('\n').length;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-batch-')));
  dir = join(root, 'demo');
  mkdirSync(dir);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('a batch of small stories', () => {
  it('three small fixes build in one agent start, and each passes or fails on its own page', async () => {
    expect(existsSync(CLI)).toBe(true);
    project([{ id: 'c-001' }, { id: 'c-002', feature: 'billing' }, { id: 'c-003', size: 'trivial' }]);
    writeFileSync(join(dir, 'skip-c-002'), '');
    const result = await orchBatch(dir);
    expect(runs()).toBe(1);
    expect(result.batch?.cards).toEqual(['c-001', 'c-002', 'c-003']);
    expect(result.turns.map(t => t.outcome)).toEqual(['merged', 'failed', 'merged']);
    expect([card('c-001').stage, card('c-002').stage, card('c-003').stage]).toEqual(['verify', 'build', 'verify']);
    for (const id of ['c-001', 'c-002', 'c-003']) {
      expect(card(id).events.filter(e => e.action === 'agent-start')).toHaveLength(1);
      expect(readOrch(dir, id).turns.at(-1)?.batch?.id).toBe(result.batch?.id);
    }
    expect(sh('git log --format=%B -3')).not.toMatch(/Card: c-002/);
  }, 60_000);

  it('uc-314-01: two stories that plan the same file never share a batch, so their commits cannot mix', async () => {
    project([{ id: 'c-001', files: ['src/c-001.txt', 'src/shared.txt'] }, { id: 'c-002', files: ['src/c-002.txt', 'src/shared.txt'] }, { id: 'c-003' }]);
    const plan = formBatch(dir);
    expect(plan.cards).toEqual(['c-001', 'c-003']);
    expect(plan.left).toEqual([{ card: 'c-002', why: expect.stringMatching(/plans src\/shared\.txt, which c-001 in this batch also changes/) }]);
    const result = await orchBatch(dir);
    expect(result.batch?.cards).toEqual(['c-001', 'c-003']);
    expect(card('c-002').events.some(e => e.action === 'agent-start')).toBe(false);
  }, 60_000);

  it("uc-314-02: a commit carrying another story's file under one id fails that story's scope check alone", async () => {
    project([{ id: 'c-001' }, { id: 'c-002' }]);
    writeFileSync(join(dir, 'mix-c-001'), 'c-002');
    const result = await orchBatch(dir);
    expect(result.turns.map(t => t.outcome)).toEqual(['failed', 'merged']);
    expect(result.turns[0].findings.join(' ')).toMatch(/src\/c-002\.txt .* is outside the plan/);
    expect(card('c-002').stage).toBe('verify');
  }, 60_000);

  it('uc-314-03: one failing story does not hold back the others', async () => {
    project([{ id: 'c-001' }, { id: 'c-002' }, { id: 'c-003' }]);
    writeFileSync(join(dir, 'skip-c-001'), '');
    await orchBatch(dir);
    expect(card('c-001').retries).toEqual({ build: 1 });
    expect([card('c-002').stage, card('c-003').stage]).toEqual(['verify', 'verify']);
  }, 60_000);

  it('uc-314-04: a failed story leaves the batch: no lease is kept, the failure is named, and it builds alone next', async () => {
    project([{ id: 'c-001' }, { id: 'c-002' }, { id: 'c-003' }]);
    writeFileSync(join(dir, 'skip-c-002'), '');
    const result = await orchBatch(dir);
    expect(['c-001', 'c-002', 'c-003'].map(id => holdsLease(dir, id))).toEqual([false, false, false]);
    expect(runningBuilders(dir)).toEqual([]);
    const lines = readActivity(dir, 'c-002', { limit: 100 }).items.filter(l => l.kind === 'orch-batch').map(l => String(l.text));
    expect(lines.join('\n')).toMatch(new RegExp(`left batch ${result.batch!.id}: .*proof "test -f src/c-002.txt" exited 1.*builds it alone`));
    createCard(dir, { lane: 'build', title: 'Fix c-004', id: 'c-004', fields: { size: 'S' } });
    const { dir: spec } = newSpec(dir, 'c-004');
    writeFileSync(join(dir, spec, 'plan.md'), '# plan\n\n## Files\n\n- src/c-004.txt\n');
    const next = formBatch(dir);
    expect(next.cards).toEqual(['c-004']);
    expect(next.left).toEqual(expect.arrayContaining([{ card: 'c-002', why: expect.stringMatching(/failed in batch .*builds it alone/) }]));
  }, 60_000);

  it('uc-314-05: a batch takes at most five stories and never an M story', () => {
    project([...Array.from({ length: 7 }, (_, i) => ({ id: `c-00${i + 1}` })), { id: 'c-008', size: 'M' }]);
    const plan = formBatch(dir);
    expect(plan.cards).toEqual(['c-001', 'c-002', 'c-003', 'c-004', 'c-005']);
    expect(plan.left.map(l => l.card)).toEqual(['c-006', 'c-007']);
    expect(formBatch(dir, ['c-008']).left[0].why).toMatch(/size M; only trivial and S/);
  });

  it("a batch counts against the lane's wip like any start: a full lane batches only trivial stories", () => {
    project([{ id: 'c-001' }, { id: 'c-002' }, { id: 'c-003', size: 'trivial' }, { id: 'c-004', size: 'M' }]);
    writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), LANE.replace('retries: 3', 'retries: 3\nwip: 2'));
    sh(`git add -A && ${GIT} commit -qm wip`);
    // c-004 is an M story another agent is working on now: it holds one of the two slots.
    recordEvent(dir, 'c-004', () => ({ action: 'agent-start', agent: 'fake', log: 'x.log' }));
    const plan = formBatch(dir);
    expect(plan.cards).toEqual(['c-001', 'c-003']);
    expect(plan.left.find(l => l.card === 'c-002')?.why).toMatch(/works on 2 cards at a time .*c-004 \(build, agent fake on build\).*1 already joined this batch/);
  });

  it('uc-314-06: each batched story is verified and approved on its own', async () => {
    project([{ id: 'c-001' }, { id: 'c-002' }]);
    await orchBatch(dir);
    expect(advanceCard(dir, 'c-001').outcome).toBe('parked');
    expect(advanceCard(dir, 'c-002').outcome).toBe('parked');
    approveCard(dir, 'c-001', 'owner');
    expect(card('c-002').gate).toBe('local');
    expect(advanceCard(dir, 'c-001').card.stage).toBe('ship');
    expect(card('c-002').stage).toBe('verify');
  }, 60_000);

  it('uc-314-07: each batched story names the batch and the stories built with it', async () => {
    project([{ id: 'c-001' }, { id: 'c-002' }, { id: 'c-003' }]);
    const result = await orchBatch(dir);
    const line = (id: string) => readActivity(dir, id, { limit: 100 }).items.find(l => l.kind === 'orch-batch')?.text;
    expect(line('c-001')).toBe(`built in batch ${result.batch!.id} with c-002, c-003; judged on its own commits, checks and approvals`);
    expect(line('c-003')).toMatch(/with c-001, c-002/);
  }, 60_000);
});
