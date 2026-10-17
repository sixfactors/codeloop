import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { readCards } from '../cards.js';
import { advanceCard, createCard, recordEvent, resizeTrivial } from '../engine.js';
import { lintLane, parseLane } from '../lane.js';
import { evaluateRubric } from '../rubric.js';
import { computeStats } from '../stats.js';

let dir: string;

const LANE = `id: build
version: 1
metric: { name: m, source: cards }
stages:
  - id: research
    when: "size >= M"
    done: { cmd: "test -f specs/research.md" }
  - id: spec
    when: "size >= M"
    done: { cmd: "true" }
    gate: { name: spec, approver: owner }
  - id: build
    done: { cmd: "true" }
  - id: verify
    done: { cmd: "true" }
`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-trivial-'));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), LANE);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('trivial cards skip the ceremony stages', () => {
  it('enters at build and goes build then verify then done with no research or spec file', () => {
    const card = createCard(dir, { lane: 'build', title: 'fix typo', id: 'c-1', fields: { size: 'trivial' } });
    expect(card.stage).toBe('build');
    expect(advanceCard(dir, 'c-1').card.stage).toBe('verify');
    expect(advanceCard(dir, 'c-1').card.stage).toBe('done');

    const events = readCards(dir).cards[0].events;
    expect(events.map(e => `${e.action}:${e.stage}`)).toEqual(['create:build', 'skip:research', 'skip:spec', 'advance:build', 'advance:verify']);
    expect(events[1].note).toBe('size trivial: the stage runs only when size >= M');
    expect(existsSync(join(dir, 'specs/research.md'))).toBe(false);
  });

  it('keeps research first for an S card and for a card with no size', () => {
    expect(createCard(dir, { lane: 'build', title: 'a', id: 'c-1', fields: { size: 'M' } }).stage).toBe('research');
    expect(createCard(dir, { lane: 'build', title: 'b', id: 'c-2' }).stage).toBe('research');
  });
});

describe('on the build lane codeloop ships', () => {
  beforeEach(() => writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), readFileSync(resolve('templates/lanes/build.yaml'), 'utf-8')));

  it('a trivial card enters at build, every ceremony stage is recorded as skipped, and verify still has its gate', () => {
    const card = createCard(dir, { lane: 'build', title: 'fix typo', id: 'c-1', fields: { size: 'trivial' } });
    expect(card.stage).toBe('build');
    expect(card.events.filter(e => e.action === 'skip').map(e => e.stage)).toEqual(['research', 'interview', 'mock', 'spec', 'data-model']);
    expect(parseLane(readFileSync(join(dir, '.codeloop/lanes/build.yaml'), 'utf-8')).stages.find(s => s.id === 'verify')?.gate?.name).toBe('local');
  });

  it("the build rubric does not ask a trivial card for the spec stage's tasks or plan", () => {
    createCard(dir, { lane: 'build', title: 'fix typo', id: 'c-1', fields: { size: 'trivial' } });
    const rows = evaluateRubric(dir, 'c-1', 'build').rows;
    expect(rows.filter(r => r.status === 'na').map(r => r.id)).toEqual(['B1', 'B4']);
    expect(rows.find(r => r.id === 'B2')?.status).toBe('fail');
  });

  it('a trivial card that outgrew the cap parks at the spec gate', () => {
    createCard(dir, { lane: 'build', title: 'fix typo', id: 'c-1', fields: { size: 'trivial' } });
    const card = resizeTrivial(dir, 'c-1', 'diff 9 files exceeds the trivial budget');
    expect([card.size, card.stage, card.gate, card.awaiting]).toEqual(['M', 'spec', 'spec', 'owner']);
  });
});

describe('a trivial card that outgrew the cap', () => {
  it('is re-sized to the smallest size that runs the spec gate and parked at the spec gate', () => {
    createCard(dir, { lane: 'build', title: 'fix', id: 'c-1', fields: { size: 'trivial' } });
    const card = resizeTrivial(dir, 'c-1', 'diff 9 files exceeds the trivial budget');
    expect([card.size, card.stage, card.gate, card.awaiting]).toEqual(['M', 'spec', 'spec', 'owner']);
    expect(card.events.at(-2)?.action).toBe('resize');
  });
});

describe('wip', () => {
  it('a full lane still takes a trivial story, which holds no slot', () => {
    writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), LANE.replace('stages:', 'wip: 1\nstages:'));
    createCard(dir, { lane: 'build', title: 'big', id: 'c-1', fields: { size: 'M' } });
    recordEvent(dir, 'c-1', () => ({ action: 'agent-start', agent: 'fake', log: 'x.log' }));
    expect(() => createCard(dir, { lane: 'build', title: 'another big', id: 'c-2', fields: { size: 'M' } })).toThrow(/works on 1 card/);
    expect(createCard(dir, { lane: 'build', title: 'draw the page', id: 'c-3', fields: { size: 'trivial' } }).stage).toBe('build');
    expect(createCard(dir, { lane: 'build', title: 'fix a typo', id: 'c-4', fields: { size: 'trivial' } }).stage).toBe('build');
  });
});

describe('when:', () => {
  it('lint refuses an expression that is not a size comparison', () => {
    const lane = parseLane(LANE.replace('size >= M', 'size is big'));
    expect(lintLane(lane).some(e => e.includes('not a size comparison'))).toBe(true);
    expect(lintLane(parseLane(LANE))).toEqual([]);
  });
});

describe('stats', () => {
  it('reports trivial cycle time apart from other cards', () => {
    createCard(dir, { lane: 'build', title: 'fix', id: 'c-1', fields: { size: 'trivial' } });
    advanceCard(dir, 'c-1');
    advanceCard(dir, 'c-1');
    const cards = readCards(dir).cards;
    expect(computeStats(cards, []).trivial_cycle_time_hours).not.toBeNull();
    expect(computeStats([{ ...cards[0], size: 'S' }], []).trivial_cycle_time_hours).toBeNull();
  });
});
