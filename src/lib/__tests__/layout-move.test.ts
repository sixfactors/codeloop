import { execSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readCards } from '../cards.js';
import { moveLayout } from '../layout-move.js';
import { evidenceDir, layout, specsDir } from '../paths.js';
import { resolveSpecDir } from '../spec.js';

const GIT = 'git -c user.email=a@b -c user.name=t';
let dir: string;
const sh = (cmd: string) => execSync(cmd, { cwd: dir, encoding: 'utf8' }).trim();
function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-layout-')));
  write('.codeloop/config.yaml', 'project:\n  name: demo\n');
  write('.codeloop/lanes/build.yaml', 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: verify\n    output: evidence/{nnn}/verify.md\n    done: { cmd: "codeloop check file evidence/{nnn}/verify.md --has pass" }\n');
  write('.codeloop/cards.json', JSON.stringify({ version: 1, cards: [{ id: 'c-001', title: 'Export', lane: 'build', laneVersion: 1, stage: 'verify', retries: {}, evidence: ['evidence/001/verify.md'], events: [], createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z', spec: 'specs/001-export' }] }, null, 2));
  write('specs/001-export/spec.md', '# Export\n');
  write('evidence/001/verify.md', 'result: pass\n');
  write('src/app.ts', 'export {};\n');
  sh(`git init -q -b main && ${GIT} add -A && ${GIT} commit -qm init`);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('store move --layout dotfolder', () => {
  it('a project with root folders reads as the root layout until it moves', () => {
    expect(layout(dir)).toBe('root');
    expect(specsDir(dir)).toBe('specs');
  });

  it('a dry run reports the plan and changes nothing', () => {
    const before = sh('git status --porcelain');
    const plan = moveLayout(dir, 'dotfolder', { dryRun: true });
    expect(plan.moved).toEqual([
      { from: 'specs', to: '.codeloop/specs', tracked: true },
      { from: 'evidence', to: '.codeloop/evidence', tracked: true },
    ]);
    expect(plan.cards).toBe(1);
    expect(plan.lanes).toEqual(['.codeloop/lanes/build.yaml']);
    expect(sh('git status --porcelain')).toBe(before);
    expect(existsSync(join(dir, '.codeloop/specs'))).toBe(false);
  });

  it('moves the tracked folders with git mv, rewrites the board and lanes, and leaves a pointer', () => {
    moveLayout(dir, 'dotfolder');
    expect(layout(dir)).toBe('dotfolder');
    expect([specsDir(dir), evidenceDir(dir)]).toEqual(['.codeloop/specs', '.codeloop/evidence']);
    // git records renames, so the history follows.
    expect(sh('git status --porcelain')).toMatch(/^R {2}specs\/001-export\/spec\.md -> \.codeloop\/specs\/001-export\/spec\.md$/m);
    const card = readCards(dir).cards[0];
    expect(card.spec).toBe('.codeloop/specs/001-export');
    expect(card.evidence).toEqual(['.codeloop/evidence/001/verify.md']);
    expect(resolveSpecDir(dir, 'c-001')).toBe('.codeloop/specs/001-export');
    const lane = readFileSync(join(dir, '.codeloop/lanes/build.yaml'), 'utf-8');
    expect(lane).toContain('output: "{evidence}/verify.md"');
    expect(lane).toContain('codeloop check file {evidence}/verify.md');
    expect(readFileSync(join(dir, '.codeloop/config.yaml'), 'utf-8')).toMatch(/^store:\n {2}layout: dotfolder$/m);
    expect(readFileSync(join(dir, '.gitignore'), 'utf-8')).toMatch(/^\.codeloop\/state\/$/m);
    expect(readFileSync(join(dir, 'specs/README.md'), 'utf-8')).toMatch(/\.codeloop\/specs\//);
    expect(existsSync(join(dir, 'evidence'))).toBe(false);
    expect(readFileSync(join(dir, 'src/app.ts'), 'utf-8')).toBe('export {};\n');
  });
});
