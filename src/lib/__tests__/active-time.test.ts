import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatMinutes, phaseTime } from '../activity.js';
import { journeyOf } from '../journey.js';
import { loadLane } from '../lane.js';
import type { Card } from '../cards.js';

const T0 = Date.UTC(2026, 9, 14, 9, 0);
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
const edit = (min: number) => ({ at: at(min), kind: 'edit' });

describe('phaseTime', () => {
  it('sums bursts of work and drops the two-hour gap', () => {
    // 0, 4, 8 minutes: eight active. Two hours quiet. 128, 131: three more. Phase ends at 140.
    const lines = [edit(0), edit(4), edit(8), edit(128), edit(131)];
    expect(phaseTime(lines, at(0), T0 + 140 * 60_000)).toEqual({ wallMinutes: 140, activeMinutes: 11, idleMinutes: 129 });
  });

  it('counts a phase with no work lines as all idle, and ignores prompts and checks', () => {
    const lines = [{ at: at(1), kind: 'prompt' }, { at: at(2), kind: 'check' }, { at: at(3), kind: 'prompt' }];
    expect(phaseTime(lines, at(0), T0 + 60 * 60_000)).toEqual({ wallMinutes: 60, activeMinutes: 0, idleMinutes: 60 });
  });

  it('reads "in build 6h 04m, working 1h 12m" from minutes', () => {
    expect(`${formatMinutes(364)} ${formatMinutes(72)} ${formatMinutes(9)}`).toBe('6h 04m 1h 12m 9m');
  });
});

describe('journey steps', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'codeloop-active-'));
    mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
    mkdirSync(join(dir, '.codeloop/state/activity'), { recursive: true });
    writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: spec\n    done: { cmd: "true" }\n  - id: build\n    done: { cmd: "false" }\n');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('carries active and idle minutes on a done step and on the current step', () => {
    const lines = [edit(0), edit(5), edit(70), edit(75), edit(80)];
    writeFileSync(join(dir, '.codeloop/state/activity/c-1.jsonl'), lines.map(l => JSON.stringify(l)).join('\n') + '\n');
    const card = { id: 'c-1', title: 't', lane: 'build', laneVersion: 1, stage: 'build', evidence: [], createdAt: at(0), updatedAt: at(0), events: [
      { at: at(0), actor: 'a', human: false, action: 'create', stage: 'spec' },
      { at: at(60), actor: 'a', human: false, action: 'advance', stage: 'spec', note: 'to build' },
    ] } as unknown as Card;
    const { steps } = journeyOf(dir, card, { lane: loadLane(dir, 'build'), now: T0 + 100 * 60_000 });
    expect(steps[0]).toMatchObject({ state: 'done', activeMinutes: 5, idleMinutes: 55 });
    expect(steps[1]).toMatchObject({ state: 'current', activeMinutes: 10, idleMinutes: 30 });
  });
});
