import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readCards } from '../cards.js';
import { doctorTick } from '../run.js';

let dir: string;
function write(path: string, text: string, old = false): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
  // Written before the check failed, as on a real board, so it is not work that landed since.
  if (old) utimesSync(join(dir, path), new Date(Date.now() - 10 * 3_600_000), new Date(Date.now() - 10 * 3_600_000));
}
const at = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const stuck = (id: string) => ({
  id, title: `Card ${id}`, lane: 'build', laneVersion: 1, stage: 'research', gate: 'stuck', awaiting: 'owner', retries: { research: 3 }, evidence: [],
  events: [{ at: at(2), actor: 'engine', human: false, action: 'stuck', stage: 'research', note: 'no verdict' }], createdAt: at(100), updatedAt: at(2), spec: `specs/${id}`,
});
const config = (cap: number) => write('.codeloop/config.yaml', `doctor:\n  scaffold_starts: ${cap}\nagents:\n  default: fake\n  fake:\n    cmd: "printf 'verdict: build\\\\n' >> specs/$CODELOOP_CARD/research.md"\n    timeout_minutes: 1\n    max_runs_per_day: 10\norch:\n  quick_exit_seconds: 0\n`);
const starts = (id: string) => readCards(dir).cards.find(c => c.id === id)!.events.filter(e => e.action === 'doctor-start' || e.action === 'agent-start').map(e => e.action);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-doctor-scaffold-'));
  write('.codeloop/lanes/build.yaml', 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: research\n    output: "{spec}/research.md"\n    done: { cmd: "grep -q \'^verdict:\' {spec}/research.md" }\n  - id: ship\n    done: { cmd: "false" }\n');
  // c-1's research.md is the template spec new writes; c-2's has real content.
  write('specs/c-1/research.md', readFileSync(resolve('templates/spec/research.md'), 'utf-8').replaceAll('{{id}}', 'c-1').replaceAll('{{title}}', 'Card c-1'), true);
  write('specs/c-2/research.md', '# Research\n\nThree sources compared; the check fails on something else.\n\nverdict: build\n', true);
  write('.codeloop/cards.json', JSON.stringify({ version: 1, cards: [stuck('c-1'), stuck('c-2')] }, null, 2));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('the doctor on a stuck story whose stage output was never written', () => {
  it('with doctor.scaffold_starts 1 starts the stage agent once, records doctor-start, and a second tick starts none', async () => {
    config(1);
    const first = await doctorTick(dir, new Date());
    expect(first.filter(a => a.action === 'agent-started').map(a => a.id)).toEqual(['c-1']);
    expect(first.find(a => a.id === 'c-1')?.note).toMatch(/^doctor started fake on c-1 research \(scaffold, 1 of 1\): specs\/c-1\/research\.md is the template$/);
    expect(starts('c-1')).toEqual(['doctor-start', 'agent-start']);
    expect(readFileSync(join(dir, 'specs/c-1/research.md'), 'utf-8')).toMatch(/^verdict: build$/m);
    const second = await doctorTick(dir, new Date());
    expect(second.filter(a => a.action === 'agent-started')).toEqual([]);
    expect(starts('c-1')).toEqual(['doctor-start', 'agent-start']);
  });

  it('with the default cap of 0 lists it in dry-run and starts nothing', async () => {
    config(0);
    const before = readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8');
    const dry = await doctorTick(dir, new Date(), { dryRun: true });
    expect(dry.filter(a => a.action === 'agent-started').map(a => a.note)).toEqual(['would start fake on c-1 research (scaffold, 1 of 1); doctor.scaffold_starts is 0: specs/c-1/research.md is the template']);
    expect(readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8')).toBe(before);
    await doctorTick(dir, new Date());
    expect(starts('c-1')).toEqual([]);
  });

  it('a stuck story whose output has real content gets no start', async () => {
    config(5);
    await doctorTick(dir, new Date());
    expect(starts('c-2')).toEqual([]);
  });
});
