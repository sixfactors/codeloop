import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readCards, stageEntryIndex as fromCards, type Card } from '../cards.js';
import { advanceCard, approveCard, closeCard, createCard, parkCard, placeCard } from '../engine.js';
import { stageEntryIndex } from '../stage-entry.js';
import { moveCard, reopenCard } from '../story-control.js';
import { stageEntryIndex as fromSdk } from '../../sdk/index.js';

const STAGES = ['draft', 'build', 'ship'];
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-stage-entry-'));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(
    join(dir, '.codeloop/lanes/build.yaml'),
    'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: draft\n    done: { cmd: "true" }\n  - id: build\n    done: { cmd: "exit 1" }\n  - id: ship\n    done: { cmd: "true" }\n',
  );
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('stage entry, shared by the server and the workspace', () => {
  it('is one function for the server and the browser-safe SDK the workspace imports', () => {
    expect(fromCards).toBe(stageEntryIndex);
    expect(fromSdk).toBe(stageEntryIndex);
  });

  it('points at the engine step that last brought the card into its stage, across advance, move, place, reopen and approve-back', () => {
    const card = (): Card => readCards(dir).cards.find(c => c.id === 'c-1')!;
    // The expected entry is the first event written by the last step that changed the card's stage;
    // a step that leaves the stage alone (a failed check) keeps it where it was.
    let entry = -1;
    const step = (name: string, act: () => unknown) => {
      const before = card();
      act();
      const after = card();
      if (after.stage !== before.stage) entry = before.events.length;
      // Done and the backlog are not lane stages; nothing counts retries there.
      if (STAGES.includes(after.stage)) expect(stageEntryIndex(after.events, after.stage), `${name}, at ${after.stage}`).toBe(entry);
    };

    createCard(dir, { lane: 'build', title: 'one', id: 'c-1' });
    expect(stageEntryIndex(card().events, 'draft'), 'at draft since it was made').toBe(-1);
    step('advance', () => advanceCard(dir, 'c-1'));
    expect(card().stage).toBe('build');
    step('failed check', () => advanceCard(dir, 'c-1'));
    step('move back', () => moveCard(dir, 'c-1', 'draft', 'owner'));
    step('place', () => placeCard(dir, 'c-1', 'build', 'owner'));
    step('close', () => closeCard(dir, 'c-1', 'owner', 'done'));
    step('reopen', () => reopenCard(dir, 'c-1', 'owner', { to: 'build' }));
    step('park', () => parkCard(dir, 'c-1', 'owner', 'later'));
    step('approve back', () => approveCard(dir, 'c-1', 'owner'));
    expect(card().stage).toBe('build');
    expect(card().events[entry].action).toBe('unpark');
  });
});
