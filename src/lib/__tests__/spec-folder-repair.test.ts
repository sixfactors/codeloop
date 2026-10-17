import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { findCard, readCards } from '../cards.js';
import { annotateCard, createCard } from '../engine.js';
import { specsDir } from '../paths.js';
import { resolveSpecDir } from '../spec.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-spec-repair-'));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: draft\n    done: { cmd: "true" }\n');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("a story's spec folder", () => {
  it('when the folder on the card is missing and one numbered folder exists, resolves to it and repairs the card', () => {
    createCard(dir, { lane: 'build', title: 'I edit, move and reopen a story from its page', id: 'c-299' });
    const root = specsDir(dir);
    annotateCard(dir, 'c-299', { spec: `${root}/299-i-edit-move-and-reopen-a-story-from-its` }, 'spec');
    mkdirSync(join(dir, root, '299-i-edit-move-and-reopen-a-story'), { recursive: true });

    expect(resolveSpecDir(dir, 'c-299')).toBe(`${root}/299-i-edit-move-and-reopen-a-story`);
    expect(findCard(readCards(dir).cards, 'c-299').spec).toBe(`${root}/299-i-edit-move-and-reopen-a-story`);
  });
});
