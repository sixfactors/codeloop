import { describe, expect, it } from 'vitest';
import { storyState } from '../states.js';

const card = (stage: string, extra: Record<string, unknown> = {}) => ({ stage, retries: {}, ...extra });

describe('the six states a person sees', () => {
  it('maps each lane position to one state', () => {
    expect(storyState(card('proposed'))?.state).toBe('backlog');
    expect(storyState(card('queued'))?.state).toBe('up-next');
    expect(storyState(card('build'))).toEqual({ state: 'in-progress', stage: 'build', health: 'working', flags: [] });
    expect(storyState(card('done'))?.state).toBe('done');
    expect(storyState(card('done', { release: 'v0.5.0' }))?.state).toBe('shipped');
    expect(storyState(card('dropped'))).toBeUndefined();
  });

  it('a gate, a stuck check or an open question makes it Needs you, keeping the stage', () => {
    expect(storyState(card('verify', { gate: 'local' }))).toEqual({ state: 'needs-you', stage: 'verify', waitingOn: 'local', health: 'needs-you', flags: [] });
    expect(storyState(card('build', { gate: 'stuck' }))).toEqual({ state: 'needs-you', stage: 'build', waitingOn: 'stuck', health: 'stuck', flags: [] });
    expect(storyState(card('spec'), 2)).toEqual({ state: 'needs-you', stage: 'spec', waitingOn: 'questions', health: 'needs-you', flags: [] });
  });

  it('one failed check is still working: the stage is being worked, not failing', () => {
    expect(storyState(card('build', { retries: { build: 1 } }))).toEqual({ state: 'in-progress', stage: 'build', health: 'working', flags: [] });
  });
});
