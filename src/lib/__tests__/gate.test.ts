import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { cardActivity, listGates, recordHandback, runGate } from '../services.js';
import { RefusalError, readCards } from '../cards.js';
import { createCard } from '../engine.js';

let dir: string;
let head: string;
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-gate-')));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/config.yaml'), 'project:\n  name: demo\n');
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: code\n    done: { cmd: "true" }\n');
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src/real.ts'), 'export {};\n');
  execSync('git init -q && git add -A && git -c user.email=a@b -c user.name=t commit -qm init', { cwd: dir });
  head = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf8' }).trim();
  createCard(dir, { lane: 'build', title: 'Founders can read the launch post' });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const handback = (proof: string, left: string) => recordHandback(dir, 'c-001', { branch: 'main', head, proof, left });

describe('runGate', () => {
  it('passes when the proof exits 0, the stage check passes and the claimed file is on the branch', () => {
    handback('true', 'wired in src/real.ts');
    const rec = runGate(dir, 'c-001');
    expect(rec.verdict).toBe('pass');
    expect(rec.claim).toEqual({ path: 'src/real.ts', found: true });
    expect(listGates(dir, 'c-001')).toHaveLength(1);
    expect(cardActivity(dir, 'c-001').lines.some(l => l.kind === 'gate' && l.verdict === 'pass')).toBe(true);
    expect(readCards(dir).cards[0].events.some(e => e.action === 'gate')).toBe(true);
  });

  it('fails with a finding naming the proof when the proof exits non-zero', () => {
    handback('false', 'wired in src/real.ts');
    const rec = runGate(dir, 'c-001');
    expect(rec.verdict).toBe('fail');
    expect(rec.findings.join('\n')).toContain('proof "false" exited 1');
  });

  it('fails with a claim finding when the left text names a file the branch does not have', () => {
    handback('true', 'still need src/missing.ts');
    const rec = runGate(dir, 'c-001');
    expect(rec.verdict).toBe('fail');
    expect(rec.claim).toEqual({ path: 'src/missing.ts', found: false });
    expect(rec.findings.join('\n')).toContain('src/missing.ts');
  });

  it('takes a bare file name as a claim only when it resolves under the spec folder', () => {
    mkdirSync(join(dir, 'specs/001-launch'), { recursive: true });
    writeFileSync(join(dir, 'specs/001-launch/research.md'), 'x\n');
    execSync('git add -A && git -c user.email=a@b -c user.name=t commit -qm spec', { cwd: dir });
    head = execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf8' }).trim();
    const file = readCards(dir);
    writeFileSync(join(dir, '.codeloop/cards.json'), JSON.stringify({ ...file, cards: file.cards.map(c => ({ ...c, spec: 'specs/001-launch' })) }));
    handback('true', 'research.md written');
    const found = runGate(dir, 'c-001');
    expect(found.claim).toEqual({ path: 'specs/001-launch/research.md', found: true });
    expect(found.verdict).toBe('pass');
    handback('true', 'also notes.md updated');
    const none = runGate(dir, 'c-001');
    expect(none.claim).toBeNull();
    expect(none.verdict).toBe('pass');
  });

  it('reruns the proof in the hand-back worktree', () => {
    const wt = join(dir, 'wt');
    mkdirSync(wt);
    writeFileSync(join(wt, 'marker'), '');
    recordHandback(dir, 'c-001', { branch: 'main', head, proof: 'test -f marker', worktree: wt });
    expect(runGate(dir, 'c-001').proof.exit).toBe(0);
  });

  it('refuses when the card has no hand-back', () => {
    expect(() => runGate(dir, 'c-001')).toThrow(RefusalError);
    expect(() => runGate(dir, 'c-001')).toThrow('no hand-back to gate');
  });
});
