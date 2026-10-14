import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { journeyOf } from '../journey.js';
import { loadLane } from '../lane.js';
import type { Card } from '../cards.js';

let dir: string;
const write = (path: string, text: string) => {
  mkdirSync(join(dir, path, '..'), { recursive: true });
  writeFileSync(join(dir, path), text);
};
const failAt = new Date(2026, 9, 14, 17, 50).toISOString();
const card = (): Card => ({ id: 'c-1', title: 't', lane: 'build', laneVersion: 1, stage: 'spec', gate: 'stuck', awaiting: 'owner', retries: { spec: 3 }, evidence: [], createdAt: failAt, updatedAt: failAt, events: [{ at: failAt, actor: 'engine', human: false, action: 'fail', stage: 'spec', note: '20 of 20 tasks open' }] } as unknown as Card);
const tasks = (done: number, total: number) => Array.from({ length: total }, (_, i) => ({ done: i < done }));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-journey-'));
  write('.codeloop/lanes/build.yaml', 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: spec\n    done: { cmd: "false" }\n');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('the check sentence', () => {
  it('says what changed after the check when later activity exists', () => {
    write('.codeloop/state/activity/c-1.jsonl', `${JSON.stringify({ at: new Date(2026, 9, 14, 18, 30).toISOString(), kind: 'edit', file: 'tasks.md' })}\n`);
    const { check } = journeyOf(dir, card(), { lane: loadLane(dir, 'build'), tasks: tasks(3, 16) });
    expect(check?.stale).toBe(true);
    expect(check?.sentence).toBe('The check failed at 17:50: 20 of 20 tasks open. Changed since: 3 of 16 tasks done; run Check now.');
  });

  it('is not stale when nothing happened after the check', () => {
    const { check } = journeyOf(dir, card(), { lane: loadLane(dir, 'build'), tasks: tasks(0, 20) });
    expect(check?.stale).toBeUndefined();
  });
});

describe('the holder', () => {
  it('is the agent when a session points at a stuck card', () => {
    write('.codeloop/state/active/s1.json', JSON.stringify({ session: 's1', card: 'c-1', startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), host: 'claude', label: 'claude on box' }));
    const { holder } = journeyOf(dir, card(), { lane: loadLane(dir, 'build'), health: 'stuck' });
    expect(holder).toMatchObject({ kind: 'agent', agent: 'claude on box' });
  });

  it('is you when nobody holds a stuck card', () => {
    expect(journeyOf(dir, card(), { lane: loadLane(dir, 'build'), health: 'stuck' }).holder.kind).toBe('you');
  });
});
