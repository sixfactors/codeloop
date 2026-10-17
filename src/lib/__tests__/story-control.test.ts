import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { setActiveCard } from '../active-card.js';
import { DONE, readCards, writeCards } from '../cards.js';
import { closeCard, createCard, placeCard, RefusalError } from '../engine.js';
import { editCard, moveCard, reopenCard } from '../story-control.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-control-'));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(
    join(dir, '.codeloop/lanes/build.yaml'),
    `id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: draft\n    done: { cmd: "true" }\n    gate: { name: spec, approver: owner }\n  - id: build\n    done: { cmd: "true" }\n  - id: ship\n    done: { cmd: "true" }\n`,
  );
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const card = (id: string) => readCards(dir).cards.find(c => c.id === id)!;

describe('place', () => {
  it('is refused at a gate and lands the card with a clean slate at its new stage', () => {
    createCard(dir, { lane: 'build', title: 'I ship it', id: 'c-1' });
    const set = (extra: object) => { const file = readCards(dir); writeCards(dir, file, file.cards.map(c => ({ ...c, ...extra }))); };
    set({ gate: 'stuck', awaiting: 'owner' });
    expect(() => placeCard(dir, 'c-1', 'build', 'owner')).toThrow('c-1 is stuck at draft; `codeloop approve c-1` retries it, `codeloop reject c-1 "<why>"` parks it');
    set({ gate: 'spec', awaiting: 'owner' });
    expect(() => placeCard(dir, 'c-1', 'build', 'owner')).toThrow('c-1 is waiting at the spec gate at draft; `codeloop approve c-1` or `codeloop reject c-1 "<why>"` decides it');
    expect(card('c-1')).toMatchObject({ stage: 'draft', gate: 'spec' });
    const { gate: _g, awaiting: _a, ...clean } = card('c-1');
    writeCards(dir, readCards(dir), [{ ...clean, retries: { build: 2 }, failures: { build: 'old' } }]);
    placeCard(dir, 'c-1', 'build', 'owner');
    expect(card('c-1').stage).toBe('build');
    expect(card('c-1').retries.build).toBeUndefined();
    expect(card('c-1').failures?.build).toBeUndefined();
  });
});

describe('place on a lane whose first stage is outward', () => {
  it('places a just-created card past the entry gate it parked at, and parks it again at an outward target', () => {
    writeFileSync(
      join(dir, '.codeloop/lanes/post.yaml'),
      `id: post\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: announce\n    done: { cmd: "true" }\n    gate: { name: publish, approver: owner, outward: true }\n  - id: build\n    done: { cmd: "true" }\n  - id: release\n    done: { cmd: "true" }\n    gate: { name: prod, approver: owner, outward: true }\n`,
    );
    createCard(dir, { lane: 'post', title: 'Already drafted', id: 'c-1' });
    expect(card('c-1')).toMatchObject({ stage: 'announce', gate: 'publish' });
    placeCard(dir, 'c-1', 'build', 'owner');
    expect(card('c-1').stage).toBe('build');
    expect(card('c-1').gate).toBeUndefined();
    createCard(dir, { lane: 'post', title: 'Ready to release', id: 'c-2' });
    placeCard(dir, 'c-2', 'release', 'owner');
    expect(card('c-2')).toMatchObject({ stage: 'release', gate: 'prod', awaiting: 'owner' });
  });
});

describe('start --stage on an outward-first lane that writes specs', () => {
  it('places past the entry gate although start wrote a spec event first, and refuses once a decision is on record', async () => {
    const { runCli } = await import('../../__tests__/cli.js');
    writeFileSync(
      join(dir, '.codeloop/lanes/post.yaml'),
      `id: post\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: announce\n    output: "{spec}/announce.md"\n    done: { cmd: "true" }\n    gate: { name: publish, approver: owner, outward: true }\n  - id: build\n    done: { cmd: "true" }\n`,
    );
    const env = { ...process.env, CODELOOP_CARD: '', CODELOOP_ROLE: 'owner' };
    const started = runCli(['start', 'Already drafted', '--lane', 'post', '--stage', 'build'], { cwd: dir, encoding: 'utf-8', env });
    expect(started.stderr).not.toMatch(/waiting at the publish gate/);
    const c = readCards(dir).cards.find(x => x.title === 'Already drafted')!;
    expect(c.events.map(e => e.action)).toContain('spec');
    expect(c.stage).toBe('build');
    createCard(dir, { lane: 'post', title: 'Already rejected once', id: 'c-9' });
    const file = readCards(dir);
    writeCards(dir, file, file.cards.map(x => (x.id === 'c-9' ? { ...x, events: [...x.events, { at: new Date().toISOString(), actor: 'owner', human: true, action: 'reject', stage: 'announce', note: 'no' }] } : x)));
    expect(() => placeCard(dir, 'c-9', 'build', 'owner')).toThrow(/waiting at the publish gate/);
  });
});

describe('reopen', () => {
  it('returns a done card to the first stage with the gate and failure marks cleared', () => {
    createCard(dir, { lane: 'build', title: 'I ship it', id: 'c-1' });
    placeCard(dir, 'c-1', 'ship', 'owner');
    const file = readCards(dir);
    writeCards(dir, file, file.cards.map(c => ({ ...c, retries: { draft: 3 }, gate: 'stuck' })));
    closeCard(dir, 'c-1', 'owner', 'done');
    expect(card('c-1').stage).toBe(DONE);

    reopenCard(dir, 'c-1', 'owner', { note: 'no output was ever produced' });

    const after = card('c-1');
    expect(after.stage).toBe('draft');
    expect(after.retries.draft).toBeUndefined();
    expect(after.events.at(-1)).toMatchObject({ action: 'reopen', note: 'from done: no output was ever produced' });
  });

  it('parks the card as a proposal with --to backlog', () => {
    createCard(dir, { lane: 'build', title: 'I ship it', id: 'c-1' });
    closeCard(dir, 'c-1', 'owner', 'done');

    reopenCard(dir, 'c-1', 'owner', { to: 'backlog' });

    expect(card('c-1')).toMatchObject({ stage: 'proposed', gate: 'proposal', awaiting: 'owner' });
  });

  it('is refused while a builder holds the card', () => {
    createCard(dir, { lane: 'build', title: 'I ship it', id: 'c-1' });
    closeCard(dir, 'c-1', 'owner', 'done');
    setActiveCard(dir, 'c-1', 'orch-c-1');

    expect(() => reopenCard(dir, 'c-1', 'owner')).toThrow(/held by/);
    expect(card('c-1').stage).toBe(DONE);
  });
});

describe('move', () => {
  it('refuses to go back past a passed gate without a note, and with one resets the target stage retries', () => {
    createCard(dir, { lane: 'build', title: 'I ship it', id: 'c-1' });
    placeCard(dir, 'c-1', 'ship', 'owner');
    const file = readCards(dir);
    writeCards(dir, file, file.cards.map(c => ({ ...c, retries: { build: 2 } })));

    expect(() => moveCard(dir, 'c-1', 'build', 'owner')).not.toThrow(); // build sits after the gate: nothing undone
    placeCard(dir, 'c-1', 'ship', 'owner');
    expect(() => moveCard(dir, 'c-1', 'draft', 'owner')).toThrow(RefusalError);
    expect(card('c-1').stage).toBe('ship');

    const file2 = readCards(dir);
    writeCards(dir, file2, file2.cards.map(c => ({ ...c, retries: { draft: 2 } })));
    moveCard(dir, 'c-1', 'draft', 'owner', { note: 'the spec was wrong' });

    expect(card('c-1').stage).toBe('draft');
    expect(card('c-1').retries.draft).toBeUndefined();
    expect(card('c-1').events.at(-1)).toMatchObject({ action: 'move', note: 'from ship: the spec was wrong' });
  });

  it('is refused while a builder holds the card', () => {
    createCard(dir, { lane: 'build', title: 'I ship it', id: 'c-1' });
    setActiveCard(dir, 'c-1', 'orch-c-1');

    expect(() => moveCard(dir, 'c-1', 'build', 'owner')).toThrow(/held by/);
    expect(card('c-1').stage).toBe('draft');
  });
});

describe('the session that holds the card', () => {
  it('moves its own card on, and is refused a forward move while the card waits at a gate', () => {
    const saved = process.env.CLAUDE_CODE_SESSION_ID;
    process.env.CLAUDE_CODE_SESSION_ID = 'me';
    try {
      createCard(dir, { lane: 'build', title: 'I ship it', id: 'c-1' });
      setActiveCard(dir, 'c-1', 'me');
      moveCard(dir, 'c-1', 'build', 'owner', { note: 'resized by mistake' });
      expect(card('c-1').stage).toBe('build');
      const file = readCards(dir);
      writeCards(dir, file, file.cards.map(c => ({ ...c, gate: 'spec', awaiting: 'owner' })));
      const events = card('c-1').events.length;
      expect(() => moveCard(dir, 'c-1', 'ship', 'owner', { note: 'skip it' })).toThrow(/waiting at the spec gate .*approve c-1/);
      expect([card('c-1').stage, card('c-1').gate, card('c-1').events.length]).toEqual(['build', 'spec', events]);
    } finally {
      if (saved === undefined) delete process.env.CLAUDE_CODE_SESSION_ID;
      else process.env.CLAUDE_CODE_SESSION_ID = saved;
    }
  });
});

describe('move to the stage it is at', () => {
  it('is refused, and a card waiting at a gate keeps waiting for approve or reject', () => {
    createCard(dir, { lane: 'build', title: 'I ship it', id: 'c-1' });
    placeCard(dir, 'c-1', 'build', 'owner');
    expect(() => moveCard(dir, 'c-1', 'build', 'owner')).toThrow(/already at build/);
    const file = readCards(dir);
    writeCards(dir, file, file.cards.map(c => ({ ...c, gate: 'spec', awaiting: 'owner' })));
    const events = card('c-1').events.length;
    expect(() => moveCard(dir, 'c-1', 'build', 'owner', { note: 'parked by mistake' })).toThrow(/waiting at the spec gate .*approve c-1/);
    expect([card('c-1').stage, card('c-1').gate, card('c-1').events.length]).toEqual(['build', 'spec', events]);
  });
});

describe('edit', () => {
  it('sets the size back to trivial', () => {
    createCard(dir, { lane: 'build', title: 'I ship it', id: 'c-1', fields: { size: 'M' } });
    editCard(dir, 'c-1', 'owner', { size: 'trivial' });
    expect(card('c-1').size).toBe('trivial');
  });

  it('changes the title and the story line in spec.md', () => {
    createCard(dir, { lane: 'build', title: 'I ship it', id: 'c-1' });
    mkdirSync(join(dir, 'specs/001-ship'), { recursive: true });
    writeFileSync(join(dir, 'specs/001-ship/spec.md'), '# c-1 spec\n\nStory: As a dev, I can ship, so that it is out.\n\nsize: S\n');
    const file = readCards(dir);
    writeCards(dir, file, file.cards.map(c => ({ ...c, spec: 'specs/001-ship' })));

    editCard(dir, 'c-1', 'owner', { title: 'I ship it faster', story: 'As a founder, I can ship fast, so that it is out today' });

    expect(card('c-1')).toMatchObject({ title: 'I ship it faster', persona: 'founder', story: { as: 'founder', can: 'ship fast', so: 'it is out today' } });
    expect(readFileSync(join(dir, 'specs/001-ship/spec.md'), 'utf-8')).toContain('Story: As a founder, I can ship fast, so that it is out today.');
    expect(card('c-1').events.at(-1)).toMatchObject({ action: 'edit', note: 'title, story' });
    expect(() => editCard(dir, 'c-1', 'owner', { title: 'ship via `--force`' })).toThrow(RefusalError);
  });
});
