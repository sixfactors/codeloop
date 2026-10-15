import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { findCard, readCards, RefusalError } from '../cards.js';
import { advanceCard, createCard, resolveRole } from '../engine.js';
import { approveFlow, describeAdvance, startCard } from '../flow.js';
import { buildInbox } from '../inbox.js';
import { lintLane, loadLanes } from '../lane.js';
import { buildPack } from '../pack.js';
import { runDue } from '../run.js';
import { scaffold } from '../scaffold.js';
import { scanSkills, writeSkillsIndex } from '../skills.js';

let dir: string;

function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

function lane(id: string, stages: string, extra = ''): void {
  write(`.codeloop/lanes/${id}.yaml`, `id: ${id}\nversion: 1\nmetric: { name: m, source: cards }\n${extra}stages:\n${stages}`);
}

const GATED_THEN_PUBLIC = `  - id: draft
    skill: design
    output: out/{id}.md
    done: { cmd: "test -f out/{id}.md" }
    gate: { name: copy, approver: owner }
  - id: publish
    done: { cmd: "touch ran.marker" }
    gate: { name: publish, approver: owner, outward: true }
`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-flow-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.CODELOOP_ROLE;
});

describe('role default', () => {
  it('is the person by default, with or without a terminal; the flag and CODELOOP_ROLE override it', () => {
    delete process.env.CODELOOP_ROLE;
    expect(resolveRole(undefined)).toBe('owner');
    expect(resolveRole('agent')).toBe('agent');
    process.env.CODELOOP_ROLE = 'reviewer';
    expect(resolveRole(undefined)).toBe('reviewer');
    expect(resolveRole('owner')).toBe('owner');
  });

  it('is agent in a process `run --agent` started, and refuses owner there', () => {
    delete process.env.CODELOOP_ROLE;
    process.env.CODELOOP_AGENT_RUN = 'claude';
    try {
      expect(resolveRole(undefined)).toBe('agent');
      expect(() => resolveRole('owner')).toThrow(/acts as agent/);
    } finally {
      delete process.env.CODELOOP_AGENT_RUN;
    }
  });
});

describe('card ids', () => {
  it('accepts the number alone, zero-padded, and the id in any case; refuses an ambiguous number', () => {
    lane('market', GATED_THEN_PUBLIC);
    createCard(dir, { lane: 'market', title: 'a', id: 'CL-001' });
    const one = readCards(dir).cards;
    for (const ref of ['1', '001', 'cl-001', 'CL-1', 'CL-001']) expect(findCard(one, ref).id).toBe('CL-001');
    expect(() => findCard(one, 'c-001')).toThrow(/not found/);

    createCard(dir, { lane: 'market', title: 'b', id: 'c-001' });
    const two = readCards(dir).cards;
    expect(findCard(two, 'c-1').id).toBe('c-001');
    expect(() => findCard(two, '1')).toThrow(/matches CL-001, c-001/);
  });
});

describe('approve', () => {
  it('advances the card once after a normal gate, and does not run a public step', () => {
    lane('market', GATED_THEN_PUBLIC);
    write('out/c-1.md', 'x');
    createCard(dir, { lane: 'market', title: 't', id: 'c-1' });
    advanceCard(dir, 'c-1');

    const copy = approveFlow(dir, '1', 'owner');
    expect(copy.advanced?.card).toMatchObject({ stage: 'publish', gate: 'publish' });

    const publish = approveFlow(dir, '1', 'owner');
    expect(publish.advanced).toBeUndefined();
    expect(existsSync(join(dir, 'ran.marker'))).toBe(false);
    expect(readCards(dir).cards[0].retries).toEqual({});
  });
});

describe('next line', () => {
  it('after a failed check names what is missing, the skill that produces it and the retry command', () => {
    lane('market', GATED_THEN_PUBLIC);
    createCard(dir, { lane: 'market', title: 't', id: 'c-1' });

    const { lines, exitCode } = describeAdvance(dir, advanceCard(dir, 'c-1'));
    expect(exitCode).toBe(2);
    expect(lines.at(-1)).toBe('Next: the check failed. The design skill produces out/c-1.md. Then `codeloop next c-1`.');
  });
});

describe('start', () => {
  it('creates the spec folder for a lane that works in one, and not for other lanes', () => {
    lane('build', '  - id: research\n    output: "{spec}/research.md"\n    done: { cmd: "true" }\n');
    lane('market', GATED_THEN_PUBLIC);

    expect(startCard(dir, { lane: 'build', title: 'Add export' }).spec).toBe('.codeloop/specs/001-add-export');
    expect(existsSync(join(dir, '.codeloop/specs/001-add-export/tasks.md'))).toBe(true);
    expect(startCard(dir, { lane: 'market', title: 'Launch' }).spec).toBeUndefined();
  });
});

describe('run', () => {
  it('reports unchanged and counts nothing on a rerun when nothing under the story moved, even after an edit outside it', () => {
    lane('market', '  - id: draft\n    output: out/{id}.md\n    done: { cmd: "grep -q claim out/{id}.md" }\n');
    createCard(dir, { lane: 'market', title: 't', id: 'c-1' });
    const retries = () => readCards(dir).cards[0].retries.draft;

    expect(runDue(dir).advanced).toEqual([{ id: 'c-1', outcome: 'failed' }]);
    expect(runDue(dir).advanced).toEqual([{ id: 'c-1', outcome: 'unchanged' }]);
    expect(retries()).toBe(1);

    // out/ is outside the story's spec, evidence and use-case folders, so the check is not rerun.
    write('out/c-1.md', 'still no good');
    expect(runDue(dir).advanced).toEqual([{ id: 'c-1', outcome: 'unchanged' }]);
    expect(retries()).toBe(1);
  });
});

describe('inbox', () => {
  it('says how many are waiting and since when, and names the file to read', () => {
    lane('market', GATED_THEN_PUBLIC);
    write('out/c-1.md', 'x');
    createCard(dir, { lane: 'market', title: 't', id: 'c-1', now: new Date('2026-10-01T09:00:00Z') });
    advanceCard(dir, 'c-1', { now: new Date('2026-10-01T10:00:00Z') });

    const inbox = buildInbox(dir, new Date('2026-10-03T12:00:00Z'));
    expect(inbox.summary).toBe('0 shipped this week, 1 waiting on you, oldest 2 days');
    expect(inbox.needs_you[0]).toMatchObject({ id: 'c-1', read: 'out/c-1.md', last_check: 'passed' });
  });
});

describe('shipped lanes', () => {
  it('lint clean and pack against only the skills init installs; a skill with no description gets one', () => {
    scaffold(dir, 'generic.yaml', ['claude']);
    write('.claude/commands/design.md', '# Design\n\nNo frontmatter, so no description.\n');
    const index = scanSkills(dir, [join(dir, '.claude/commands'), join(dir, '.claude/skills')]);
    writeSkillsIndex(dir, index);

    expect(loadLanes(dir)).toHaveLength(10);
    expect(loadLanes(dir).flatMap(l => lintLane(l, index))).toEqual([]);
    const pack = buildPack(dir);
    expect(pack.skills.filter(s => !s.description)).toEqual([]);
    expect(pack.skills.find(s => s.skillId === 'design')?.description).toBe('Design');
  });
});

describe('refusals', () => {
  it('uses "waiting for you" when a card at a gate is advanced', () => {
    lane('market', GATED_THEN_PUBLIC);
    write('out/c-1.md', 'x');
    createCard(dir, { lane: 'market', title: 't', id: 'c-1' });
    advanceCard(dir, 'c-1');

    expect(() => advanceCard(dir, 'c-1')).toThrow(RefusalError);
    expect(() => advanceCard(dir, 'c-1')).toThrow(/waiting for you at gate "copy"/);
  });
});

describe('split, done and drop free lane slots without leaving duplicates', () => {
  const STAGES = `  - id: one\n    done: { cmd: "false" }\n`;

  it('split never asks for more slots: the first child takes the parent\'s, the rest wait in Up next', async () => {
    const { splitCard } = await import('../services.js');
    lane('build', STAGES, 'wip: 2\n');
    createCard(dir, { lane: 'build', title: 'See my todos sorted by date', id: 'c-001' });
    createCard(dir, { lane: 'build', title: 'Export my todos as a file', id: 'c-002' });
    const { cards } = splitCard(dir, 'c-002', ['Export my todos as a CSV file', 'Export my todos as a JSON file', 'Export my todos as a PDF file'], 'owner');
    expect(cards.map(c => c.stage)).toEqual(['one', 'queued', 'queued']);
    expect(cards.every(c => c.split_from === 'c-002')).toBe(true);
    expect(readCards(dir).cards.find(c => c.id === 'c-002')?.stage).toBe('done');
    // Run again from the start: no duplicates, because the parent is already done.
    expect(() => splitCard(dir, 'c-002', ['Export my todos as a CSV file'], 'owner')).toThrow();
    expect(readCards(dir).cards).toHaveLength(5);
  });

  it('split children resume at the parent\'s stage, and a queued child is promoted there when a slot opens', async () => {
    const { splitCard } = await import('../services.js');
    const { promoteQueued, closeCard } = await import('../engine.js');
    lane('build', `  - id: one\n    done: { cmd: "true" }\n  - id: two\n    done: { cmd: "false" }\n`, 'wip: 1\n');
    createCard(dir, { lane: 'build', title: 'Export my todos as a file', id: 'c-001' });
    advanceCard(dir, 'c-001');
    const { cards } = splitCard(dir, 'c-001', ['Export my todos as a CSV file', 'Export my todos as a JSON file'], 'owner');
    expect(cards.map(c => c.stage)).toEqual(['two', 'queued']);
    expect(promoteQueued(dir)).toEqual([]);
    closeCard(dir, cards[0].id, 'owner', 'done');
    expect(promoteQueued(dir).map(c => [c.id, c.stage])).toEqual([[cards[1].id, 'two']]);
  });

  it('a story waiting at a gate does not keep a queued story out', async () => {
    const { queueCard, promoteQueued } = await import('../engine.js');
    lane('build', `  - id: one\n    done: { cmd: "true" }\n    gate: { name: copy, approver: owner }\n  - id: two\n    done: { cmd: "false" }\n`, 'wip: 1\n');
    createCard(dir, { lane: 'build', title: 'See my todos sorted by date', id: 'c-001' });
    advanceCard(dir, 'c-001');
    expect(readCards(dir).cards[0].gate).toBe('copy');
    queueCard(dir, { lane: 'build', title: 'Export my todos as a file', id: 'c-002' });
    expect(promoteQueued(dir).map(c => c.id)).toEqual(['c-002']);
  });

  it('done and drop are the owner\'s, free the slot, and drop needs a reason', async () => {
    const { closeCard } = await import('../engine.js');
    lane('build', STAGES, 'wip: 1\n');
    createCard(dir, { lane: 'build', title: 'See my todos sorted by date', id: 'c-001' });
    expect(() => closeCard(dir, 'c-001', 'agent', 'done')).toThrow(/owner's decision/);
    expect(() => closeCard(dir, 'c-001', 'owner', 'dropped')).toThrow(/say why/);
    expect(() => createCard(dir, { lane: 'build', title: 'Export my todos as a file', id: 'c-002' })).toThrow(/c-001/);
    closeCard(dir, 'c-001', 'owner', 'done');
    expect(createCard(dir, { lane: 'build', title: 'Export my todos as a file', id: 'c-002' }).stage).toBe('one');
  });
});

describe('park', () => {
  it('park frees the slot and approving returns the story to the stage it left', async () => {
    const { parkCard, approveCard } = await import('../engine.js');
    lane('build', `  - id: one\n    done: { cmd: "true" }\n  - id: two\n    done: { cmd: "false" }\n`, 'wip: 1\n');
    createCard(dir, { lane: 'build', title: 'See my todos sorted by date', id: 'c-001' });
    advanceCard(dir, 'c-001');
    expect(readCards(dir).cards[0].stage).toBe('two');
    expect(() => parkCard(dir, 'c-001', 'agent')).toThrow(/owner's decision/);
    parkCard(dir, 'c-001', 'owner', 'stuck on research');
    expect(createCard(dir, { lane: 'build', title: 'Export my todos as a file', id: 'c-002' }).stage).toBe('one');
    const back = approveCard(dir, 'c-001', 'owner');
    expect(back.stage).toBe('two');
    expect(back.events.at(-1)?.action).toBe('unpark');
  });
});

describe('what the lane limit counts', () => {
  it('a story stuck or waiting at a gate does not hold a slot', () => {
    lane('build', `  - id: one\n    done: { cmd: "false" }\n`, 'wip: 1\n');
    createCard(dir, { lane: 'build', title: 'See my todos sorted by date', id: 'c-001' });
    const file = readCards(dir);
    writeFileSync(join(dir, '.codeloop/cards.json'), JSON.stringify({ ...file, cards: file.cards.map(c => ({ ...c, gate: 'stuck', awaiting: 'owner' })) }, null, 2));
    expect(createCard(dir, { lane: 'build', title: 'Export my todos as a file', id: 'c-002' }).stage).toBe('one');
    expect(() => createCard(dir, { lane: 'build', title: 'Share a todo list', id: 'c-003' })).toThrow(/c-002/);
  });

  it('a run parks a story stuck longer than capacity.park_stuck_after_days, and not a newer one', async () => {
    const { parkStuck } = await import('../engine.js');
    write('.codeloop/config.yaml', 'capacity:\n  park_stuck_after_days: 2\n');
    lane('build', `  - id: one\n    done: { cmd: "false" }\n`);
    createCard(dir, { lane: 'build', title: 'See my todos sorted by date', id: 'c-001' });
    createCard(dir, { lane: 'build', title: 'Export my todos as a file', id: 'c-002' });
    const file = readCards(dir);
    const stuckAt = (iso: string) => ({ at: iso, actor: 'engine', human: false, action: 'stuck', stage: 'one' });
    writeFileSync(join(dir, '.codeloop/cards.json'), JSON.stringify({ ...file, cards: [
      { ...file.cards[0], gate: 'stuck', awaiting: 'owner', events: [...file.cards[0].events, stuckAt('2026-10-01T00:00:00.000Z')] },
      { ...file.cards[1], gate: 'stuck', awaiting: 'owner', events: [...file.cards[1].events, stuckAt('2026-10-09T12:00:00.000Z')] },
    ] }, null, 2));
    expect(parkStuck(dir, { now: new Date('2026-10-10T00:00:00.000Z') })).toEqual(['c-001']);
    const [a, b] = readCards(dir).cards;
    expect(a.stage).toBe('proposed');
    expect(a.parked_from).toBe('one');
    expect(b.gate).toBe('stuck');
  });
});

describe('a promoted proposal', () => {
  it('gets its spec folder, the same as a story started directly', async () => {
    const { proposeCard } = await import('../engine.js');
    lane('build', `  - id: research\n    output: "{spec}/research.md"\n    done: { cmd: "codeloop check file {spec}/research.md --has 'verdict:'" }\n`);
    const { card } = proposeCard(dir, { lane: 'build', title: 'Export my todos as a file' });
    approveFlow(dir, card.id, 'owner');
    const promoted = readCards(dir).cards.find(c => c.id === card.id)!;
    expect(promoted.stage).toBe('research');
    expect(promoted.spec).toMatch(/^\.codeloop\/specs\//);
    expect(existsSync(join(dir, promoted.spec!, 'research.md'))).toBe(true);
  });
});
