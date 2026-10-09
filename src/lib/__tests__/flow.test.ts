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

function lane(id: string, stages: string): void {
  write(`.codeloop/lanes/${id}.yaml`, `id: ${id}\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n${stages}`);
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
  it('is owner at a terminal and agent when piped; the flag and CODELOOP_ROLE override both', () => {
    delete process.env.CODELOOP_ROLE;
    expect(resolveRole(undefined, true)).toBe('owner');
    expect(resolveRole(undefined, false)).toBe('agent');
    expect(resolveRole('agent', true)).toBe('agent');
    process.env.CODELOOP_ROLE = 'reviewer';
    expect(resolveRole(undefined, true)).toBe('reviewer');
    expect(resolveRole('owner', false)).toBe('owner');
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
    expect(lines.at(-1)).toBe('Next: the check failed. The /design skill produces out/c-1.md. Then `codeloop next c-1`.');
  });
});

describe('start', () => {
  it('creates the spec folder for a lane that works in one, and not for other lanes', () => {
    lane('build', '  - id: research\n    output: "{spec}/research.md"\n    done: { cmd: "true" }\n');
    lane('market', GATED_THEN_PUBLIC);

    expect(startCard(dir, { lane: 'build', title: 'Add export' }).spec).toBe('specs/001-add-export');
    expect(existsSync(join(dir, 'specs/001-add-export/tasks.md'))).toBe(true);
    expect(startCard(dir, { lane: 'market', title: 'Launch' }).spec).toBeUndefined();
  });
});

describe('run', () => {
  it('does not count a failure again while the stage output is unchanged', () => {
    lane('market', '  - id: draft\n    output: out/{id}.md\n    done: { cmd: "grep -q claim out/{id}.md" }\n');
    createCard(dir, { lane: 'market', title: 't', id: 'c-1' });
    const retries = () => readCards(dir).cards[0].retries.draft;

    expect(runDue(dir).advanced).toEqual([{ id: 'c-1', outcome: 'failed' }]);
    expect(runDue(dir).advanced).toEqual([{ id: 'c-1', outcome: 'unchanged' }]);
    expect(retries()).toBe(1);

    write('out/c-1.md', 'still no good');
    expect(runDue(dir).advanced).toEqual([{ id: 'c-1', outcome: 'failed' }]);
    expect(retries()).toBe(2);
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

    expect(loadLanes(dir)).toHaveLength(8);
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
