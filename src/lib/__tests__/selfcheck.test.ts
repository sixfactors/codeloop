import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { runSelfcheck } from '../selfcheck.js';
import { readActivity } from '../activity.js';
import { recordHandback } from '../handback.js';
import { runGate } from '../gate.js';

let dir: string;
const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'pipe' }).toString().trim();
function put(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}
const TEN = 'the helper is shared with a and the split would double the work';
const scopeRow = `# Review c-001\n\n## Scope\n\n| File | Verdict | Reason |\n|---|---|---|\n| src/b.ts | keep | ${TEN} |\n\nverdict: approve\n`;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-selfcheck-')));
  git('init', '-q');
  put('.codeloop/config.yaml', 'project:\n  name: demo\n');
  put('.codeloop/lanes/build.yaml', 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: code\n    done: { cmd: "true" }\n');
  put('.codeloop/cards.json', JSON.stringify({ version: 1, cards: [{ id: 'c-001', title: 't', lane: 'build', stage: 'code', spec: 'specs/001', events: [] }] }));
  put('.gitignore', '.codeloop/state/\n');
  put('specs/001/plan.md', '# Plan\n\n## Files\n\n- `src/a.ts`\n');
  put('seed.txt', 'x\n');
  git('add', '-A'); git('commit', '-q', '-m', 'chore: seed');
  put('src/a.ts', 'a\n'); put('src/b.ts', '1\n2\n3\n');
  git('add', '-A'); git('commit', '-q', '-m', 'feat: story', '-m', 'Card: c-001');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('runSelfcheck', () => {
  it('fails naming scope for an out-of-plan file, passes once the Scope row exists', () => {
    const red = runSelfcheck(dir, 'c-001', dir);
    expect(red.pass).toBe(false);
    expect(red.failing).toEqual(['scope']);
    expect(red.steps.find(s => s.name === 'scope')!.detail).toContain('src/b.ts');

    put('evidence/001/review.md', scopeRow);
    const green = runSelfcheck(dir, 'c-001', dir);
    expect(green.pass).toBe(true);
    expect(green.failing).toEqual([]);
  });

  it('carries the result into the hand-back at the same head, and the gate skips the stage check only then', () => {
    put('evidence/001/review.md', scopeRow);
    const head = git('rev-parse', 'HEAD');
    runSelfcheck(dir, 'c-001', dir);
    expect(readActivity(dir, 'c-001').items.some(l => l.kind === 'selfcheck' && l.pass === true && l.head === head)).toBe(true);

    const hb = recordHandback(dir, 'c-001', { branch: 'main', head, proof: 'true' });
    expect(hb.selfcheck).toEqual({ pass: true, failing: [] });
    const rec = runGate(dir, 'c-001');
    expect(rec.verdict).toBe('pass');
    expect(rec.check.output).toContain('skipped: selfcheck passed');

    // A hand-back at another head has no selfcheck line, so the gate runs the check itself.
    put('src/c.ts', 'c\n'); git('add', '-A'); git('commit', '-q', '-m', 'more', '-m', 'Card: c-001');
    const later = recordHandback(dir, 'c-001', { branch: 'main', head: git('rev-parse', 'HEAD'), proof: 'true' });
    expect(later.selfcheck).toBeUndefined();
    expect(runGate(dir, 'c-001').check.output).not.toContain('skipped');
  });
});
