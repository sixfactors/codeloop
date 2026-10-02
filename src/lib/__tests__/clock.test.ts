import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { approveCard, createCard } from '../engine.js';
import { advanceCard } from '../engine.js';

afterEach(() => {
  delete process.env.CODELOOP_NOW;
});

describe('CODELOOP_NOW', () => {
  it('places a command on the chosen day, and an unreadable value is refused', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codeloop-clock-'));
    mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
    writeFileSync(join(dir, '.codeloop/lanes/market.yaml'), 'id: market\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - { id: draft, done: { cmd: "true" }, gate: { name: copy, approver: owner } }\n');
    try {
      process.env.CODELOOP_NOW = '2026-10-05T08:00:00Z';
      expect(createCard(dir, { lane: 'market', title: 't', id: 'c-1' }).createdAt).toBe('2026-10-05T08:00:00.000Z');
      advanceCard(dir, 'c-1');
      process.env.CODELOOP_NOW = '2026-10-06T09:30:00Z';
      expect(approveCard(dir, 'c-1', 'owner').events.at(-1)).toMatchObject({ action: 'approve', at: '2026-10-06T09:30:00.000Z' });
      process.env.CODELOOP_NOW = 'next tuesday';
      expect(() => createCard(dir, { lane: 'market', title: 't', id: 'c-2' })).toThrow(/CODELOOP_NOW "next tuesday" is not a date/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
