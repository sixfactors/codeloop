import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readAllActivity } from '../activity.js';
import { advanceCard, createCard } from '../engine.js';
import { runDue } from '../run.js';

let dir: string;
const spawned = () => (existsSync(join(dir, 'runs.log')) ? readFileSync(join(dir, 'runs.log'), 'utf-8').split('\n').filter(Boolean).length : 0);
const skipLines = () => readAllActivity(dir, 'c-1').filter(l => l.kind === 'check-skipped');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-rerun-'));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  mkdirSync(join(dir, 'specs/001'), { recursive: true });
  writeFileSync(join(dir, 'specs/001/tasks.md'), '- [ ] T001 a\n');
  writeFileSync(join(dir, '.codeloop/lanes/market.yaml'), `id: market\nversion: 1\nmetric: { name: m, source: cards }\nretries: 9\nstages:\n  - id: draft\n    output: out.md\n    done: { cmd: "echo ran >> runs.log; exit 1" }\n`);
  createCard(dir, { lane: 'market', title: 't', id: 'c-1', fields: { spec: 'specs/001' } });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('scheduled rerun of a failed check', () => {
  it('is skipped when nothing changed, with one activity line per day', () => {
    const t = new Date();
    advanceCard(dir, 'c-1', { now: t });
    expect(spawned()).toBe(1);
    const later = new Date(t.getTime() + 3600_000);
    runDue(dir, later);
    runDue(dir, new Date(later.getTime() + 60_000));
    expect(spawned()).toBe(1);
    expect(skipLines()).toHaveLength(1);
    expect(String(skipLines()[0].text)).toMatch(/^nothing changed since the last fail at \d\d:\d\d$/);
  });

  it('runs again once tasks.md is touched', () => {
    const t = new Date();
    advanceCard(dir, 'c-1', { now: t });
    const later = new Date(t.getTime() + 3600_000);
    utimesSync(join(dir, 'specs/001/tasks.md'), later, later);
    runDue(dir, later);
    expect(spawned()).toBe(2);
  });

  it('a forced check runs regardless', () => {
    const t = new Date();
    advanceCard(dir, 'c-1', { now: t });
    advanceCard(dir, 'c-1', { now: new Date(t.getTime() + 3600_000), unattended: true, force: true });
    expect(spawned()).toBe(2);
  });
});
