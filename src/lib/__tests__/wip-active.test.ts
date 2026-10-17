import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { setActiveCard } from '../active-card.js';
import { appendActivity } from '../activity.js';
import { resolveAgent } from '../agent.js';
import { approveCard, createCard, placeCard, proposeCard, recordEvent } from '../engine.js';
import { takeBatch } from '../orch-isolation.js';
import { planRun } from '../run.js';

// The owner's rule for the lane limit: only stories an agent is working on hold a slot. A story
// parked at a gate, waiting for answers or sitting between turns holds none, and every start path
// (card new, approve of a proposal, place, the scheduler) counts it the same way.

let dir: string;
const LANE = 'id: build\nversion: 1\nwip: 1\nretries: 3\nmetric: { name: m, source: cards }\nstages:\n  - id: one\n    done: { cmd: "false" }\n  - id: two\n    done: { cmd: "false" }\n';

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-wip-')));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), LANE);
  writeFileSync(join(dir, '.codeloop/config.yaml'), 'project:\n  name: demo\nagents:\n  default: fake\n  fake:\n    cmd: "true {brief}"\n    timeout_minutes: 5\n');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const inFlight = (id: string) => recordEvent(dir, id, () => ({ action: 'agent-start', agent: 'fake', log: 'x.log' }));

describe('the lane limit counts only stories an agent is working on', () => {
  it('a story nobody is working on holds no slot, so card new still starts another', () => {
    createCard(dir, { lane: 'build', title: 'See my todos sorted by date', id: 'c-001' });
    expect(createCard(dir, { lane: 'build', title: 'Export my todos as a file', id: 'c-002' }).stage).toBe('one');
  });

  it('a story with an agent run in flight holds the slot, and card new names it and why', () => {
    createCard(dir, { lane: 'build', title: 'See my todos sorted by date', id: 'c-001' });
    inFlight('c-001');
    expect(() => createCard(dir, { lane: 'build', title: 'Export my todos as a file', id: 'c-002' })).toThrow(/c-001 \(one, agent fake on one\) See my todos/);
  });

  it('an agent run that handed back frees the slot', () => {
    createCard(dir, { lane: 'build', title: 'See my todos sorted by date', id: 'c-001' });
    inFlight('c-001');
    recordEvent(dir, 'c-001', () => ({ action: 'agent-run', agent: 'fake', exit: 0, log: 'x.log' }));
    expect(createCard(dir, { lane: 'build', title: 'Export my todos as a file', id: 'c-002' }).stage).toBe('one');
  });

  it('a builder session holds the slot while it is active and frees it once it goes quiet', () => {
    createCard(dir, { lane: 'build', title: 'See my todos sorted by date', id: 'c-001' });
    setActiveCard(dir, 'c-001', 'sess-1', undefined);
    appendActivity(dir, 'c-001', { kind: 'edit', text: 'src/a.ts' });
    expect(() => createCard(dir, { lane: 'build', title: 'Export my todos as a file', id: 'c-002' })).toThrow(/c-001 \(one, session .* active 0 min ago\)/);
    writeFileSync(join(dir, '.codeloop/state/activity/c-001.jsonl'), `${JSON.stringify({ at: new Date(Date.now() - 3 * 3_600_000).toISOString(), kind: 'edit', text: 'src/a.ts' })}\n`);
    expect(createCard(dir, { lane: 'build', title: 'Export my todos as a file', id: 'c-002' }).stage).toBe('one');
  });

  it('approving a proposal into a full lane is refused, naming the story that holds the slot', () => {
    createCard(dir, { lane: 'build', title: 'See my todos sorted by date', id: 'c-001' });
    inFlight('c-001');
    proposeCard(dir, { lane: 'build', title: 'Export my todos as a file', id: 'c-002' });
    expect(() => approveCard(dir, 'c-002', 'owner')).toThrow(/works on 1 card at a time .* c-001 \(one, agent fake/);
  });

  it('placing a story into a full lane is refused the same way', () => {
    createCard(dir, { lane: 'build', title: 'Export my todos as a file', id: 'c-002' });
    createCard(dir, { lane: 'build', title: 'See my todos sorted by date', id: 'c-001' });
    inFlight('c-001');
    expect(() => placeCard(dir, 'c-002', 'two', 'owner')).toThrow(/c-001 \(one, agent fake/);
  });

  it('the scheduler starts a story beside one that waits, and holds it back beside one being worked on', () => {
    createCard(dir, { lane: 'build', title: 'See my todos sorted by date', id: 'c-001' });
    createCard(dir, { lane: 'build', title: 'Export my todos as a file', id: 'c-002' });
    expect(planRun(dir, resolveAgent(dir), new Date(), { lane: 'build' }).filter(l => /would start agent/.test(l))).toHaveLength(1);
    inFlight('c-001');
    const lines = planRun(dir, resolveAgent(dir));
    expect(lines.find(l => l.startsWith('c-002'))).toMatch(/would not start .* c-001 \(one, agent fake on one\)/);
  });

  it('a trivial story never holds a slot, even with an agent on it', () => {
    createCard(dir, { lane: 'build', title: 'Fix a typo', id: 'c-001', fields: { size: 'trivial' } });
    inFlight('c-001');
    expect(createCard(dir, { lane: 'build', title: 'See my todos sorted by date', id: 'c-002' }).stage).toBe('one');
  });

  it('a batch lease taken before its agent-start holds the slot, until stall_minutes pass with no activity', () => {
    createCard(dir, { lane: 'build', title: 'See my todos sorted by date', id: 'c-001' });
    takeBatch(dir, { id: 'b-1', cards: ['c-001'] });
    expect(() => createCard(dir, { lane: 'build', title: 'Export my todos as a file', id: 'c-002' })).toThrow(/c-001 \(one, lease taken 0 min ago\)/);
    const lease = join(dir, '.codeloop/state/active/orch-c-001.json');
    const old = new Date(Date.now() - 45 * 60_000).toISOString();
    writeFileSync(lease, JSON.stringify({ ...JSON.parse(readFileSync(lease, 'utf-8')), startedAt: old, updatedAt: old }));
    expect(createCard(dir, { lane: 'build', title: 'Export my todos as a file', id: 'c-002' }).stage).toBe('one');
  });

  it('a carried or batched turn holds its slot for its own time limit, not the agent preset', () => {
    createCard(dir, { lane: 'build', title: 'See my todos sorted by date', id: 'c-001' });
    recordEvent(dir, 'c-001', () => ({ action: 'agent-start', agent: 'fake', log: 'x.log', timeoutMinutes: 20 }), new Date(Date.now() - 10 * 60_000));
    expect(planRun(dir, resolveAgent(dir)).find(l => l.startsWith('c-001'))).toMatch(/still running on one/);
    expect(() => createCard(dir, { lane: 'build', title: 'Export my todos as a file', id: 'c-002' })).toThrow(/c-001 \(one, agent fake on one\)/);
  });
});
