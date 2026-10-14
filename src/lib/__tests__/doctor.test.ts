import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readActivity } from '../activity.js';
import { readCards } from '../cards.js';
import { doctorTick } from '../run.js';

let dir: string;
const entry = process.argv[1];
function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}
const at = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const card = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: `Card ${id}`, lane: 'build', laneVersion: 1, stage: 'draft', retries: {}, evidence: [], events: [], createdAt: at(100), updatedAt: at(1), spec: `specs/${id}`, ...extra });

beforeEach(() => {
  // The agent's check calls `codeloop`; point the shim it runs through at the built CLI.
  process.argv[1] = resolve('dist/index.js');
  dir = mkdtempSync(join(tmpdir(), 'codeloop-doctor-'));
  write('.codeloop/lanes/build.yaml', 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: draft\n    done: { cmd: "test -f out/{id}.md" }\n  - id: ship\n    done: { cmd: "false" }\n');
  // A stand-in agent: writes the stage output the check looks for.
  write('.codeloop/config.yaml', 'agents:\n  default: fake\n  fake:\n    cmd: "mkdir -p out && touch out/$CODELOOP_CARD.md"\n    timeout_minutes: 1\n    max_runs_per_day: 10\n');
  write('specs/c-1/interview.md', '# Questions\n');
  write('specs/c-2/interview.md', '# Questions\n');
  write('.codeloop/cards.json', JSON.stringify({ version: 1, cards: [
    card('c-1', { retries: { draft: 2 }, updatedAt: at(3), events: [{ at: at(3), actor: 'engine', human: false, action: 'fail', stage: 'draft', note: 'out/c-1.md is missing' }] }),
    card('c-2', { updatedAt: at(72) }),
    card('c-3', { retries: { draft: 1 }, updatedAt: at(0.1) }),
  ] }, null, 2));
});

afterEach(() => {
  process.argv[1] = entry;
  rmSync(dir, { recursive: true, force: true });
});

describe('the doctor tick', () => {
  it('starts the agent on a failing story, suggests parking a stale one, leaves a working one alone, and logs each on the activity stream', async () => {
    const actions = await doctorTick(dir, new Date());
    expect(actions.map(a => [a.id, a.action])).toEqual([['c-1', 'agent-started'], ['c-2', 'suggest-park']]);
    expect(readCards(dir).cards.find(c => c.id === 'c-1')!.stage).toBe('ship');
    expect(readActivity(dir, 'c-1').items.some(l => l.kind === 'doctor')).toBe(true);
    expect(readActivity(dir, 'c-2').items.find(l => l.kind === 'doctor')?.text).toMatch(/park/);
    expect(readFileSync(join(dir, 'specs/c-2/interview.md'), 'utf-8')).toMatch(/Park it\?/);
    // A second tick does not ask again.
    await doctorTick(dir, new Date());
    expect(readFileSync(join(dir, 'specs/c-2/interview.md'), 'utf-8').match(/Park it\?/g)).toHaveLength(1);
  });

  it('does nothing with monitor: off', async () => {
    write('.codeloop/config.yaml', 'monitor: off\nagents:\n  default: fake\n  fake:\n    cmd: "true"\n');
    expect(await doctorTick(dir, new Date())).toEqual([]);
  });
});
