import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { stageEntryIndex as fromCards } from '../cards.js';
import { stageEntryIndex } from '../stage-entry.js';
import { stageEntryIndex as fromSdk } from '../../sdk/index.js';

describe('stage entry, shared by the server and the workspace', () => {
  it('is one function for the server, the browser-safe SDK the workspace imports, and the workspace itself, with no node import', () => {
    expect(fromCards).toBe(stageEntryIndex);
    expect(fromSdk).toBe(stageEntryIndex);
    const workspace = readFileSync('workspace/lib/cards.ts', 'utf-8');
    expect(workspace).toMatch(/import \{ stageEntryIndex \} from '@protoboxai\/codeloop\/sdk'/);
    expect(workspace).not.toMatch(/const ENTERS/);
    expect(readFileSync('src/lib/stage-entry.ts', 'utf-8')).not.toMatch(/^import /m);
    const events = [{ action: 'create', stage: 'draft' }, { action: 'advance', note: 'to build' }, { action: 'fail', stage: 'build' }, { action: 'move', stage: 'draft' }, { action: 'move', stage: 'build' }];
    expect(stageEntryIndex(events, 'build')).toBe(4);
    expect(stageEntryIndex(events, 'draft')).toBe(3);
    expect(stageEntryIndex(events.slice(0, 3), 'build')).toBe(1);
    expect(stageEntryIndex(undefined, 'draft')).toBe(-1);
  });
});
