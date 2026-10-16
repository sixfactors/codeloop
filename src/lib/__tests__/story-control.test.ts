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
  it('moves its own card on, and the move clears a gate the card was waiting at', () => {
    const saved = process.env.CLAUDE_CODE_SESSION_ID;
    process.env.CLAUDE_CODE_SESSION_ID = 'me';
    try {
      createCard(dir, { lane: 'build', title: 'I ship it', id: 'c-1' });
      const file = readCards(dir);
      writeCards(dir, file, file.cards.map(c => ({ ...c, gate: 'spec', awaiting: 'owner' })));
      setActiveCard(dir, 'c-1', 'me');
      moveCard(dir, 'c-1', 'build', 'owner', { note: 'resized by mistake' });
      expect([card('c-1').stage, card('c-1').gate, card('c-1').awaiting]).toEqual(['build', undefined, undefined]);
    } finally {
      if (saved === undefined) delete process.env.CLAUDE_CODE_SESSION_ID;
      else process.env.CLAUDE_CODE_SESSION_ID = saved;
    }
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
