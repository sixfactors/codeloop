import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { activeMs, readActivity } from '../activity.js';
import { createCard } from '../engine.js';
import { activityText, lastActivity } from '../journey.js';
import { editCard } from '../story-control.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-story-edit-'));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: draft\n    done: { cmd: "true" }\n');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("an owner's story edit in the activity stream", () => {
  it('reads "edited <fields>" on the card face and is not counted as work', () => {
    createCard(dir, { lane: 'build', title: 'I ship it', id: 'c-1' });
    editCard(dir, 'c-1', 'owner', { title: 'I ship it today', priority: 'P1' });

    const last = lastActivity(dir, 'c-1')!;
    expect(last.kind).toBe('story-edit');
    expect(activityText(last)).toBe('edited title, priority');

    // Two story edits ten seconds apart would be a work burst if they counted as work.
    editCard(dir, 'c-1', 'owner', { size: 'S' });
    const lines = readActivity(dir, 'c-1').items;
    expect(activeMs(lines, 0, Date.now() + 1000)).toBe(0);
  });
});
