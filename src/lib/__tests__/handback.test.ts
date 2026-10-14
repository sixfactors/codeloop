import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { cardActivity, listHandbacks, recordHandback } from '../services.js';
import { RefusalError, readCards } from '../cards.js';
import { createCard } from '../engine.js';

let dir: string;
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-handback-')));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/config.yaml'), 'project:\n  name: demo\n');
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: code\n    done: { cmd: "true" }\n');
  createCard(dir, { lane: 'build', title: 'Founders can read the launch post' });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const input = (proof: string) => ({ branch: 'feat/x', head: 'abc123', proof, left: 'nothing', blocked: '' });

describe('recordHandback', () => {
  it('runs a passing proof, stores exit 0, lists it, and writes an activity line and a card event', () => {
    const rec = recordHandback(dir, 'c-001', input('true'));
    expect(rec.proof.exit).toBe(0);
    expect(rec.stage).toBe('code');
    expect(listHandbacks(dir, 'c-001').map(h => h.head)).toEqual(['abc123']);
    expect(cardActivity(dir, 'c-001').lines.some(l => l.kind === 'handback')).toBe(true);
    expect(readCards(dir).cards[0].events.some(e => e.action === 'handback')).toBe(true);
  });

  it('records a failing proof with its exit code and does not refuse', () => {
    const rec = recordHandback(dir, 'c-001', input('echo boom; false'));
    expect(rec.proof.exit).toBe(1);
    expect(rec.proof.output).toContain('boom');
    expect(listHandbacks(dir, 'c-001')).toHaveLength(1);
  });

  it('refuses an empty proof and writes nothing', () => {
    expect(() => recordHandback(dir, 'c-001', input('  '))).toThrow(RefusalError);
    expect(() => recordHandback(dir, 'c-001', input('  '))).toThrow('a hand-back needs a proof command');
    expect(listHandbacks(dir, 'c-001')).toEqual([]);
  });

  it('lists newest first', () => {
    recordHandback(dir, 'c-001', { ...input('true'), head: 'one' });
    recordHandback(dir, 'c-001', { ...input('true'), head: 'two' });
    expect(listHandbacks(dir, 'c-001').map(h => h.head)).toEqual(['two', 'one']);
  });
});
