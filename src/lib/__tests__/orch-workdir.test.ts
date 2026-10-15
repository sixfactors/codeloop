import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readCards } from '../cards.js';
import { createCard } from '../engine.js';
import { orchTurn } from '../orch.js';
import { recordHandback } from '../handback.js';
import { runGate } from '../gate.js';
import { ensureStoryWorktree, mergeStory } from '../worktree.js';
import { checkResearch } from '../research.js';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'dist', 'index.js');
const GIT = 'git -c user.email=a@b -c user.name=t';
const SPEC = 'specs/001-founders-read-the-post';
const STUB = '# Research\n\nverdict: \n';
const SOURCES = ['- source: https://acme.test/docs/export — export lives in the list toolbar', '- source: https://globex.test/changelog — shipped bulk export in March', '- source: https://example.test/forum/42 - users ask for a column picker'];

let root: string;
let dir: string;
const sh = (cmd: string, cwd = dir) => execSync(cmd, { cwd, encoding: 'utf8' }).trim();

// Writes the research file only in its own worktree; the main tree keeps the stub until the merge.
const BUILDER = `#!/bin/sh
set -e
cat > ${SPEC}/research.md <<'EOT'
# Research

${SOURCES.join('\n')}
verdict: build
EOT
git add -A
${GIT} commit -qm "docs: research

Card: $CODELOOP_CARD"
node "${CLI}" card handback "$CODELOOP_CARD" --branch "$(git rev-parse --abbrev-ref HEAD)" --head "$(git rev-parse HEAD)" --proof "node ${CLI} check research c-001 --min-sources 3" --left "${SPEC}/research.md" --worktree "$PWD"
`;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-workdir-')));
  dir = join(root, 'demo');
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  mkdirSync(join(dir, SPEC), { recursive: true });
  writeFileSync(join(dir, SPEC, 'research.md'), STUB);
  writeFileSync(join(dir, 'fake-agent.sh'), BUILDER);
  chmodSync(join(dir, 'fake-agent.sh'), 0o755);
  writeFileSync(join(dir, '.codeloop/config.yaml'), `project:\n  name: demo\nagents:\n  default: fake\n  fake:\n    cmd: "sh ${join(dir, 'fake-agent.sh')} {brief}"\n    timeout_minutes: 2\norch:\n  isolation: worktree\n`);
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), `id: build\nversion: 1\nretries: 3\nmetric: { name: m, source: cards }\nstages:\n  - id: research\n    done: { cmd: "node ${CLI} check research {id} --min-sources 3" }\n  - id: build\n    done: { cmd: "true" }\n`);
  writeFileSync(join(dir, '.gitignore'), '.codeloop/state/\n');
  sh(`git init -q -b main && git add -A && ${GIT} commit -qm init`);
  createCard(dir, { lane: 'build', title: 'Founders read the post' });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('the gate reads a builder\'s work where it is', () => {
  it('passes research that exists only in the worktree, then merges it into the main tree', async () => {
    expect(existsSync(CLI)).toBe(true);
    const turn = await orchTurn(dir, 'c-001');
    expect(turn.findings).toEqual([]);
    expect(turn.gate?.verdict).toBe('pass');
    expect(turn.outcome).toBe('merged');
    expect(readFileSync(join(dir, SPEC, 'research.md'), 'utf-8')).toContain('verdict: build');
    expect(readCards(dir).cards[0].stage).toBe('build');
  }, 60_000);
});

describe('CODELOOP_WORK_DIR', () => {
  it('points the research check at the story files in another tree while the project root stays put', () => {
    const work = join(root, 'elsewhere');
    mkdirSync(join(work, SPEC), { recursive: true });
    writeFileSync(join(work, SPEC, 'research.md'), `# R\n\n${SOURCES.join('\n')}\nverdict: build\n`);
    expect(checkResearch(dir, 'c-001', 3).errors[0]).toMatch(/no line starting with "verdict:"/);
    process.env.CODELOOP_WORK_DIR = work;
    try {
      expect(checkResearch(dir, 'c-001', 3).errors).toEqual([]);
    } finally {
      delete process.env.CODELOOP_WORK_DIR;
    }
  });
});

describe('the gate measures scope on the builder\'s branch', () => {
  it('fails an out-of-plan file at the gate and merges nothing', async () => {
    const lane = `id: build\nversion: 1\nretries: 3\nmetric: { name: m, source: cards }\nstages:\n  - id: build\n    done: { cmd: "node ${CLI} check scope {id}" }\n`;
    writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), lane);
    writeFileSync(join(dir, SPEC, 'plan.md'), '# Plan\n\n## Files\n\n- `src/a.ts`\n');
    sh(`git add -A && ${GIT} commit -qm plan`);
    const cards = readCards(dir);
    writeFileSync(join(dir, '.codeloop/cards.json'), JSON.stringify({ ...cards, cards: cards.cards.map(c => ({ ...c, stage: 'build', spec: SPEC })) }));
    const wt = ensureStoryWorktree(dir, 'c-001');
    mkdirSync(join(wt.path, 'src'), { recursive: true });
    writeFileSync(join(wt.path, 'src/a.ts'), 'a\n');
    writeFileSync(join(wt.path, 'src/unplanned.ts'), 'b\n');
    sh(`git add -A && ${GIT} commit -qm "feat: build" -m "Card: c-001"`, wt.path);
    const before = sh('git rev-parse HEAD');
    recordHandback(dir, 'c-001', { branch: wt.branch, head: sh('git rev-parse HEAD', wt.path), proof: `node ${CLI} check scope c-001`, left: 'src/a.ts', worktree: wt.path });
    const gate = runGate(dir, 'c-001');
    expect(gate.verdict).toBe('fail');
    expect(gate.findings.join(' ')).toContain('src/unplanned.ts');
    expect(() => mergeStory(dir, 'c-001')).toThrow(/gate for c-001 is fail/);
    expect(sh('git rev-parse HEAD')).toBe(before);
  }, 60_000);
});
