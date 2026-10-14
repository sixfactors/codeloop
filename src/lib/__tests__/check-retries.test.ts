import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendActivity } from '../activity.js';
import { advanceCard, createCard } from '../engine.js';

let dir: string;
const lane = (cmd: string) => {
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/lanes/market.yaml'), `id: market\nversion: 1\nmetric: { name: m, source: cards }\nretries: 2\nstages:\n  - id: draft\n    output: out.md\n    done: { cmd: "${cmd}" }\n`);
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-retries-'));
  lane('echo no tasks >&2; exit 1');
  createCard(dir, { lane: 'market', title: 't', id: 'c-1' });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('a repeated check', () => {
  it('does not count when nothing happened since the last identical failure', () => {
    advanceCard(dir, 'c-1');
    advanceCard(dir, 'c-1');
    const third = advanceCard(dir, 'c-1');
    expect(third.card.retries.draft).toBe(1);
    expect(third.outcome).toBe('failed');
    expect(third.card.gate).toBeUndefined();
    expect(third.card.events.filter(e => e.action === 'fail')).toHaveLength(3);
  });

  it('counts when an activity line sits between the two checks', () => {
    advanceCard(dir, 'c-1');
    appendActivity(dir, 'c-1', { kind: 'edit', file: 'a.md' });
    const second = advanceCard(dir, 'c-1');
    expect(second.card.retries.draft).toBe(2);
    expect(second.outcome).toBe('stuck');
  });

  it('counts when the failing output file changed', () => {
    advanceCard(dir, 'c-1');
    writeFileSync(join(dir, 'out.md'), 'now something');
    expect(advanceCard(dir, 'c-1').card.retries.draft).toBe(2);
  });
});
