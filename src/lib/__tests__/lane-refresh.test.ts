import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { findCard, readCards } from '../cards.js';
import { createCard } from '../engine.js';
import { installMissingLane, laneDrift, loadLane, refreshLane, templateLaneFiles } from '../lane.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-lane-refresh-'));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/cards.json'), JSON.stringify({ version: 1, cards: [] }));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('lane refresh', () => {
  it('keeps a card at spec after refresh and adds interview and mock from the template', () => {
    // Installed build is the old shape: no interview/mock, research check is the word verdict.
    writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), `id: build
version: 1
metric: { name: cycle_time_days, source: cards, target: "<5" }
trigger: { manual: true }
wip: 3
retries: 3
stages:
  - id: research
    skill: design
    output: "{spec}/research.md"
    done: { cmd: "codeloop check file {spec}/research.md --has 'verdict:'" }
  - id: spec
    skill: plan
    output: "{spec}/tasks.md"
    done: { cmd: "codeloop spec check {id}" }
    gate: { name: spec, approver: owner }
  - id: build
    skill: test
    done: { cmd: "true" }
  - id: verify
    skill: qa
    done: { cmd: "true" }
    gate: { name: local, approver: owner }
  - id: review
    skill: qa
    done: { cmd: "true" }
  - id: staging
    skill: deploy
    done: { cmd: "true" }
  - id: live
    skill: ship
    done: { cmd: "true" }
`);
    createCard(dir, { lane: 'build', title: 'At spec', id: 'c-1' });
    // Move the card to spec without running checks: write the stage directly.
    const file = readCards(dir);
    const at = findCard(file.cards, 'c-1');
    at.stage = 'spec';
    at.gate = 'spec';
    at.awaiting = 'owner';
    writeFileSync(join(dir, '.codeloop/cards.json'), JSON.stringify({ version: file.version, cards: file.cards }, null, 2));

    const r = refreshLane(dir, 'build');
    expect(r).toMatchObject({ id: 'build', from: 1, to: 2 });
    expect(r.addedStages).toEqual(expect.arrayContaining(['interview', 'mock']));
    expect(r.keptWip).toBeUndefined();

    expect(loadLane(dir, 'build').stages.map(s => s.id)).toEqual([
      'research', 'interview', 'mock', 'spec', 'data-model', 'build', 'verify', 'review', 'staging', 'live',
    ]);
    expect(loadLane(dir, 'build').version).toBe(2);
    expect(findCard(readCards(dir).cards, 'c-1')).toMatchObject({ stage: 'spec', gate: 'spec' });
    expect(loadLane(dir, 'build').stages.find(s => s.id === 'research')?.done?.cmd).toContain('check research');
  });

  it('refuses when a card sits on a stage the template removed', () => {
    writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), `id: build
version: 1
metric: { name: m, source: cards }
wip: 2
stages:
  - id: research
    done: { cmd: "true" }
  - id: legacy-only
    done: { cmd: "true" }
  - id: spec
    done: { cmd: "true" }
  - id: build
    done: { cmd: "true" }
  - id: verify
    done: { cmd: "true" }
  - id: review
    done: { cmd: "true" }
  - id: staging
    done: { cmd: "true" }
  - id: live
    done: { cmd: "true" }
`);
    createCard(dir, { lane: 'build', title: 'Old stage', id: 'c-1' });
    const file = readCards(dir);
    const at = findCard(file.cards, 'c-1');
    at.stage = 'legacy-only';
    writeFileSync(join(dir, '.codeloop/cards.json'), JSON.stringify({ version: file.version, cards: file.cards }, null, 2));

    expect(() => refreshLane(dir, 'build')).toThrow(/legacy-only/);
    expect(loadLane(dir, 'build').version).toBe(1);
  });

  it('keeps the installed wip when workable cards exceed the template wip', () => {
    writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), `id: build
version: 1
metric: { name: m, source: cards }
wip: 5
retries: 3
stages:
  - id: research
    done: { cmd: "true" }
  - id: interview
    done: { cmd: "true" }
  - id: mock
    done: { cmd: "true" }
  - id: spec
    done: { cmd: "true" }
  - id: build
    done: { cmd: "true" }
  - id: verify
    done: { cmd: "true" }
  - id: review
    done: { cmd: "true" }
  - id: staging
    done: { cmd: "true" }
  - id: live
    done: { cmd: "true" }
`);
    for (let n = 1; n <= 3; n++) createCard(dir, { lane: 'build', title: `Card ${n}`, id: `c-${n}` });
    const r = refreshLane(dir, 'build');
    expect(r.keptWip).toBe(5);
    expect(loadLane(dir, 'build').wip).toBe(5);
  });

  it('installMissingLane copies a template once and never overwrites', () => {
    expect(templateLaneFiles()).toContain('shape.yaml');
    expect(installMissingLane(dir, 'shape.yaml')).toMatch(/shape\.yaml$/);
    expect(existsSync(join(dir, '.codeloop/lanes/shape.yaml'))).toBe(true);
    expect(installMissingLane(dir, 'shape.yaml')).toBeUndefined();
    const before = readFileSync(join(dir, '.codeloop/lanes/shape.yaml'), 'utf-8');
    writeFileSync(join(dir, '.codeloop/lanes/shape.yaml'), before + '\n# touch\n');
    expect(installMissingLane(dir, 'shape.yaml')).toBeUndefined();
    expect(readFileSync(join(dir, '.codeloop/lanes/shape.yaml'), 'utf-8')).toContain('# touch');
  });

  it('laneDrift names an installed lane whose stages differ', () => {
    writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), `id: build
version: 1
metric: { name: m, source: cards }
stages:
  - id: research
    done: { cmd: "true" }
`);
    expect(laneDrift(dir).some(d => d.id === 'build' && d.reason.includes('stages'))).toBe(true);
  });
});
