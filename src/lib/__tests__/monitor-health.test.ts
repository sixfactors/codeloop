import { describe, expect, it } from 'vitest';
import { storyState } from '../states.js';

const NOW = Date.parse('2026-10-14T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const card = (extra: Record<string, unknown> = {}) => ({ stage: 'build', retries: {}, events: [], updatedAt: ago(5 * MIN), ...extra });

describe('one derived state per story', () => {
  it('a first failed check with recent activity is working, not failing', () => {
    const s = storyState(card({ retries: { build: 1 }, updatedAt: ago(3 * HOUR) }), 0, { now: NOW, lastActivityAt: NOW - 10 * MIN });
    expect(s?.health).toBe('working');
    expect(s?.flags).not.toContain('failing');
  });

  it('one failed check, quiet for an hour, with nobody holding it is failing; held, it is working', () => {
    const quiet = card({ retries: { build: 1 }, updatedAt: ago(2 * HOUR) });
    expect(storyState(quiet, 0, { now: NOW, lastActivityAt: NOW - 2 * HOUR })?.health).toBe('failing');
    expect(storyState(quiet, 0, { now: NOW, lastActivityAt: NOW - 2 * HOUR, held: true })?.health).toBe('working');
  });

  it('two failed checks and no activity for an hour is failing', () => {
    expect(storyState(card({ retries: { build: 2 }, updatedAt: ago(2 * HOUR) }), 0, { now: NOW, lastActivityAt: NOW - 2 * HOUR })?.health).toBe('failing');
  });

  it('an agent run that ended on a failed check is failing at once', () => {
    const events = [{ at: ago(20 * MIN), actor: 'agent', human: false, action: 'agent-run', exit: 0 }, { at: ago(19 * MIN), actor: 'engine', human: false, action: 'fail', stage: 'build' }];
    expect(storyState(card({ retries: { build: 1 }, events }), 0, { now: NOW, lastActivityAt: NOW - 19 * MIN })?.health).toBe('failing');
  });

  it('parked at a gate with two fails is needs-you; three fails parked stuck is stuck', () => {
    expect(storyState(card({ gate: 'local', retries: { build: 2 } }), 0, { now: NOW })).toMatchObject({ state: 'needs-you', health: 'needs-you' });
    expect(storyState(card({ gate: 'stuck', retries: { build: 3 } }), 0, { now: NOW })).toMatchObject({ state: 'needs-you', health: 'stuck' });
  });

  it('untouched for two days is stale, whatever the stage', () => {
    expect(storyState(card({ updatedAt: ago(3 * DAY) }), 0, { now: NOW, lastActivityAt: NOW - 3 * DAY })?.health).toBe('stale');
    expect(storyState(card({ updatedAt: ago(3 * DAY) }), 0, { now: NOW, lastActivityAt: NOW - 10 * MIN })?.health).toBe('working');
  });
});
