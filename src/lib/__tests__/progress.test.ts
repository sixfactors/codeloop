import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { computeProgress, parseWindow, renderProgress } from '../story-progress.js';

const NOW = Date.parse('2026-10-15T12:00:00Z');
const ev = (at: string, action: string, stage: string, note?: string, actor = 'engine') => ({ at, actor, human: false, action, stage, ...(note ? { note } : {}) });
const FAIL_LINE = 'FAIL src/lib/__tests__/x.test.ts > parses the thing';

function card(id: string, stage: string, events: ReturnType<typeof ev>[], extra: Record<string, unknown> = {}) {
  return { id, title: `story ${id}`, lane: 'build', laneVersion: 1, stage, retries: {}, evidence: [], events, createdAt: events[0].at, updatedAt: events[events.length - 1].at, ...extra };
}

let dir: string;
const activity = (id: string, lines: object[]) => {
  mkdirSync(join(dir, '.codeloop/state/activity'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/state/activity', `${id}.jsonl`), lines.map(l => JSON.stringify(l)).join('\n') + '\n');
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-progress-'));
  mkdirSync(join(dir, '.codeloop'), { recursive: true });
  const cards = [
    // research 2h, spec 24h, now in build
    card('c-001', 'build', [ev('2026-10-10T00:00:00Z', 'create', 'research'), ev('2026-10-10T02:00:00Z', 'advance', 'research', 'to spec'), ev('2026-10-11T02:00:00Z', 'advance', 'spec', 'to build')]),
    // research 6h, then waiting at the spec gate for the owner
    card('c-002', 'spec', [ev('2026-10-10T00:00:00Z', 'create', 'research'), ev('2026-10-10T06:00:00Z', 'advance', 'research', 'to spec'), ev('2026-10-10T06:00:01Z', 'park', 'spec', 'gate spec')], { gate: 'spec', awaiting: 'owner' }),
    // research 4h
    card('c-003', 'spec', [ev('2026-10-12T00:00:00Z', 'create', 'research'), ev('2026-10-12T04:00:00Z', 'advance', 'research', 'to spec')]),
    // old stories with no move in the window, both failing the same check
    card('c-004', 'build', [ev('2026-10-01T00:00:00Z', 'create', 'build'), ev('2026-10-14T00:00:00Z', 'fail', 'build', FAIL_LINE)]),
    card('c-005', 'build', [ev('2026-10-01T00:00:00Z', 'create', 'build'), ev('2026-10-14T00:00:00Z', 'fail', 'build', 'tsc: error TS2304')]),
  ];
  writeFileSync(join(dir, '.codeloop/cards.json'), JSON.stringify({ version: 1, cards }));
  const fail = (at: string, out: string) => ({ at, kind: 'check', stage: 'build', pass: false, output: out });
  activity('c-001', [fail('2026-10-12T09:00:00Z', `${FAIL_LINE}\n  expected 1`), fail('2026-10-12T10:00:00Z', `${FAIL_LINE}\n  expected 2`)]);
  activity('c-004', [fail('2026-10-14T00:00:00Z', `${FAIL_LINE}\n  expected 3`)]);
  activity('c-005', [fail('2026-10-14T00:00:00Z', 'tsc: error TS2304\n  more')]);
  mkdirSync(join(dir, '.codeloop/state/orch'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/state/orch/c-001.json'), JSON.stringify({ card: 'c-001', turns: [{ n: 1, stage: 'build', startedAt: '2026-10-12T08:00:00Z' }, { n: 2, stage: 'build', startedAt: '2026-09-01T08:00:00Z' }] }));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('computeProgress', () => {
  const report = () => computeProgress(dir, { windowMs: parseWindow('7d'), now: NOW });

  it('counts the stage moves in the window and splits stories into moved and unmoved', () => {
    const r = report();
    expect(r.stories.find(s => s.card === 'c-001')!.moves.map(m => `${m.from ?? '-'}>${m.to}`)).toEqual(['->research', 'research>spec', 'spec>build']);
    expect(r.stories.reduce((n, s) => n + s.moves.length, 0)).toBe(7);
    expect([r.moved, r.unmoved]).toEqual([3, 2]);
    expect(r.stories.find(s => s.card === 'c-001')!.builderTurns).toBe(1);
  });

  it('takes the median hours of the stories that passed each stage', () => {
    const r = report();
    expect(r.medianHoursPerStage.find(s => s.stage === 'research')).toEqual({ stage: 'research', hours: 4, stories: 3 });
    expect(r.medianHoursPerStage.find(s => s.stage === 'spec')).toEqual({ stage: 'spec', hours: 24, stories: 1 });
  });

  it('lists the gate waiting on the owner with how long it has waited', () => {
    const g = report().gatesWaitingLongest;
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ card: 'c-002', gate: 'spec', by: 'owner', hours: 126 });
  });

  it('counts a failure shared by two cards once, with both cards listed', () => {
    const groups = report().failingChecks;
    const shared = groups.filter(f => f.line === FAIL_LINE);
    expect(shared).toHaveLength(1);
    expect(shared[0]).toMatchObject({ count: 3, cards: ['c-001', 'c-004'] });
    expect(groups.find(f => f.line.startsWith('tsc:'))!.cards).toEqual(['c-005']);
  });

  it('prints the report and the same data as json-able fields', () => {
    const text = renderProgress(report());
    expect(text).toContain('3 stories moved a stage and 2 did not');
    expect(text).toContain('c-001 c-004');
    expect(() => JSON.stringify(report())).not.toThrow();
  });
});

describe('parseWindow', () => {
  it('reads hours and days and refuses anything else', () => {
    expect(parseWindow('24h')).toBe(86_400_000);
    expect(parseWindow('7d')).toBe(7 * 86_400_000);
    expect(() => parseWindow('soon')).toThrow(/not a window/);
  });
});
