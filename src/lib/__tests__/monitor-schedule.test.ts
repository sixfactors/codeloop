import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureMonitorSchedule, scheduleScriptPath } from '../schedule.js';

let fake: string;
let table: string;
let noSchedule: string | undefined;
// Outside the temp folder on purpose: the guard skips anything under it.
const project = resolve('.vitest-monitor-fixture');

beforeEach(() => {
  // vitest.setup.ts sets CODELOOP_NO_SCHEDULE=1 for every test; this file tests the install path,
  // against a stand-in crontab, so it clears the variable for its own run.
  noSchedule = process.env.CODELOOP_NO_SCHEDULE;
  delete process.env.CODELOOP_NO_SCHEDULE;
  const bin = mkdtempSync(join(tmpdir(), 'codeloop-crontab-'));
  table = join(bin, 'table');
  fake = join(bin, 'crontab');
  // A stand-in crontab: `-l` prints the table, `-` replaces it from stdin.
  writeFileSync(fake, `#!/bin/sh\nif [ "$1" = "-l" ]; then cat "${table}" 2>/dev/null || exit 1; else cat > "${table}"; fi\n`);
  chmodSync(fake, 0o755);
  mkdirSync(project, { recursive: true });
});

afterEach(() => {
  if (noSchedule === undefined) delete process.env.CODELOOP_NO_SCHEDULE;
  else process.env.CODELOOP_NO_SCHEDULE = noSchedule;
  rmSync(project, { recursive: true, force: true });
});

describe('the monitor keeps itself running', () => {
  it('installs one hourly run --agent when agents are configured and none is scheduled, and only once', () => {
    expect(ensureMonitorSchedule(project, { crontab: fake, hasAgents: true, monitorOn: true })).toMatch(/installed an hourly/);
    expect(readFileSync(table, 'utf-8')).toMatch(/^0 \* \* \* \* '[^']+\.sh' # codeloop:/m);
    expect(readFileSync(scheduleScriptPath(project), 'utf-8')).toMatch(/ run --agent >> /);
    expect(ensureMonitorSchedule(project, { crontab: fake, hasAgents: true, monitorOn: true })).toBeUndefined();
    expect(readFileSync(table, 'utf-8').trim().split('\n')).toHaveLength(1);
  });

  it('does nothing with monitor off, with no agents, or for a project in the temp folder', () => {
    expect(ensureMonitorSchedule(project, { crontab: fake, hasAgents: true, monitorOn: false })).toBeUndefined();
    expect(ensureMonitorSchedule(project, { crontab: fake, hasAgents: false, monitorOn: true })).toBeUndefined();
    const temp = mkdtempSync(join(tmpdir(), 'codeloop-proj-'));
    expect(ensureMonitorSchedule(temp, { crontab: fake, hasAgents: true, monitorOn: true })).toBeUndefined();
    expect(() => readFileSync(table, 'utf-8')).toThrow();
  });
});
