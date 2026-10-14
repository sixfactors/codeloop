import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readActivity } from '../activity.js';
import { closeIndex, getIndex } from '../index/index.js';
import { doctorTick } from '../run.js';
import { homeView, stalledBuilders } from '../services.js';

let dir: string;
const MIN = 60_000;
function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}
const ago = (min: number) => new Date(Date.now() - min * MIN).toISOString();
const card = (id: string) => ({ id, title: `Card ${id}`, lane: 'build', laneVersion: 1, stage: 'draft', retries: {}, evidence: [], events: [], createdAt: ago(5000), updatedAt: ago(1), spec: `specs/${id}` });
const session = (id: string, cardId: string) => write(`.codeloop/state/active/${id}.json`, JSON.stringify({ session: id, card: cardId, startedAt: ago(120), updatedAt: ago(1), host: 'claude', machine: 'box', label: 'claude on box, since 10:00' }));
const activity = (cardId: string, minutesAgo: number, kind = 'edit') => write(`.codeloop/state/activity/${cardId}.jsonl`, `${JSON.stringify({ at: ago(minutesAgo), kind })}\n`);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-stall-'));
  write('.codeloop/lanes/build.yaml', 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: draft\n    done: { cmd: "false" }\n');
  write('.codeloop/cards.json', JSON.stringify({ version: 1, cards: [card('c-1'), card('c-2')] }, null, 2));
});
afterEach(async () => {
  await closeIndex(dir);
  rmSync(dir, { recursive: true, force: true });
});

describe('stalledBuilders', () => {
  it('does not flag a session with activity five minutes ago', () => {
    session('s1', 'c-1');
    activity('c-1', 5);
    expect(stalledBuilders(dir)).toEqual([]);
  });

  it('flags a session idle for 45 minutes with its idleMinutes', () => {
    session('s1', 'c-1');
    activity('c-1', 45);
    const [row] = stalledBuilders(dir);
    expect(row).toMatchObject({ session: 's1', card: 'c-1', stage: 'draft', idleMinutes: 45, lastKind: 'edit' });
  });

  it('ignores a session that holds no card', () => {
    write('.codeloop/state/active/s2.json', JSON.stringify({ session: 's2', card: '', startedAt: ago(120), updatedAt: ago(1) }));
    expect(stalledBuilders(dir)).toEqual([]);
  });

  it('honours monitor.stall_minutes', () => {
    write('.codeloop/config.yaml', 'monitor:\n  stall_minutes: 10\n');
    session('s1', 'c-1');
    activity('c-1', 15);
    expect(stalledBuilders(dir)).toHaveLength(1);
  });
});

describe('the doctor and a stalled builder', () => {
  it('writes exactly one doctor line across two ticks', async () => {
    session('s1', 'c-1');
    activity('c-1', 45);
    await doctorTick(dir);
    await doctorTick(dir);
    const lines = readActivity(dir, 'c-1').items.filter(l => l.kind === 'doctor');
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('builder idle 45 min on draft; asked for a hand-back');
    // The nudge is not builder activity: the session is still stalled.
    expect(stalledBuilders(dir)).toHaveLength(1);
  });
});

describe('homeView', () => {
  it('marks the stalled agent row and counts it', async () => {
    session('s1', 'c-1');
    activity('c-1', 45);
    const home = await homeView(getIndex(dir), dir);
    expect(home.agents[0]).toMatchObject({ card: 'c-1', stalled: true, idleMinutes: 45 });
    expect(home.summary.stalled).toBe(1);
  });
});
