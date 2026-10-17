import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { appendActivity, phaseTime, readAllActivity } from '../activity.js';
import { createCard, recordEvent } from '../engine.js';

let dir: string;
const T0 = Date.UTC(2026, 9, 17, 9, 0);
const at = (min: number) => new Date(T0 + min * 60_000);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-working-'));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: draft\n    done: { cmd: "true" }\n');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('working time in a phase', () => {
  it('counts an agent run by its duration, a lone edit as a minute, and the run\'s own edits once', () => {
    createCard(dir, { lane: 'build', title: 'I ship it', id: 'c-1' });
    // A headless run from minute 10 to 30, recorded once at its end; its hooks wrote two edits inside it.
    appendActivity(dir, 'c-1', { at: at(12).toISOString(), kind: 'edit', file: 'a.ts' });
    appendActivity(dir, 'c-1', { at: at(15).toISOString(), kind: 'edit', file: 'b.ts' });
    recordEvent(dir, 'c-1', () => ({ action: 'agent-run', agent: 'claude', exit: 0, durationMs: 20 * 60_000 }), at(30));
    // A person's single edit an hour later.
    appendActivity(dir, 'c-1', { at: at(90).toISOString(), kind: 'edit', file: 'c.ts' });

    const t = phaseTime(readAllActivity(dir, 'c-1'), at(0).toISOString(), at(120).getTime());
    expect(t).toEqual({ wallMinutes: 120, activeMinutes: 21, idleMinutes: 99 });
  });
});
