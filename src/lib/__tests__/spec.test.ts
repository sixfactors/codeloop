import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { readCards } from '../cards.js';
import { createCard } from '../engine.js';
import { globMatches } from '../glob.js';
import { importBmad, importSpecKit } from '../import.js';
import { checkSpec, newSpec, readTasks, tickTask } from '../spec.js';

let dir: string;

function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

const BUILD_LANE = `id: build
version: 1
metric: { name: m, source: cards }
wip: 1
stages:
  - { id: research, done: { cmd: "true" } }
  - { id: spec, done: { cmd: "true" } }
  - { id: build, done: { cmd: "true" } }
  - { id: review, done: { cmd: "true" } }
`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-spec-'));
  write('.codeloop/lanes/build.yaml', BUILD_LANE);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('spec check', () => {
  const spec = (n: number) => `acceptance:\n${Array.from({ length: n }, (_, i) => `- US${i + 1} Given a, when b, then c.`).join('\n')}\n`;

  it.each([
    ['an untagged task', spec(1), '- [ ] T001 [US1] [api] tagged\n- [ ] T002 [US1] no layer\n', /untagged task.*T002/],
    ['an acceptance line with no task', spec(2), '- [ ] T001 [US1] [api] only the first\n', /acceptance line US2 has no task/],
    ['a task citing a missing acceptance line', spec(1), '- [ ] T001 [US1] [api] ok\n- [ ] T002 [US7] [ui] stray\n', /T002 cites US7/],
    ['more than five acceptance lines', spec(6), [1, 2, 3, 4, 5, 6].map(n => `- [ ] T00${n} [US${n}] [api] t`).join('\n'), /split the card/],
  ])('reports %s', (_name, specMd, tasksMd, expected) => {
    write('specs/001/spec.md', specMd);
    write('specs/001/tasks.md', tasksMd);

    const errors = checkSpec(dir, 'specs/001');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(expected);
  });

  it('fails on a freshly created spec until tasks are written, and records the folder on the card', () => {
    createCard(dir, { lane: 'build', title: 'Add CSV export', id: 'c-7' });

    const { dir: specDir } = newSpec(dir, 'c-7');
    expect(specDir).toBe('specs/007-add-csv-export');
    expect(readCards(dir).cards[0].spec).toBe(specDir);
    expect(checkSpec(dir, specDir)).toEqual(['acceptance line US1 has no task']);
  });
});

describe('tasks', () => {
  it('ticks only the named task', () => {
    write('specs/001/tasks.md', '- [ ] T001 [US1] [api] one\n- [ ] T002 [US1] [ui] two\n');

    tickTask(dir, 'specs/001', 'T002');
    expect(readTasks(dir, 'specs/001').tasks.map(t => [t.id, t.done])).toEqual([['T001', false], ['T002', true]]);
  });
});

describe('glob', () => {
  it('lets ** cross directories and keeps * inside one segment', () => {
    expect(globMatches('src/**/*.ts', 'src/lib/engine.ts')).toBe(true);
    expect(globMatches('src/**/*.ts', 'src/index.ts')).toBe(true);
    expect(globMatches('src/*.ts', 'src/lib/engine.ts')).toBe(false);
    expect(globMatches('src/lib/**', 'site/app/page.tsx')).toBe(false);
  });
});

describe('import', () => {
  it('speckit: one card per feature, layers from config scopes, unknown ones flagged, source untouched', () => {
    write('.codeloop/config.yaml', 'scopes:\n  api:\n    paths: ["src/api/**"]\n  ui:\n    paths: ["src/components/**"]\n');
    const tasks = '- [ ] T001 [P] [US1] Create model in src/api/models/user.py\n- [x] T002 [US1] Build form in src/components/Login.tsx\n- [ ] T003 [US2] Decide the retention policy\n';
    write('kit/specs/001-login/spec.md', '# Feature Specification: Login\n\n### User Story 1 - Sign in (Priority: P1)\n\n### User Story 2 - Sign out (Priority: P2)\n');
    write('kit/specs/001-login/tasks.md', tasks);
    write('kit/specs/002-export/tasks.md', '- [ ] T001 [US1] Write src/api/export.py\n');

    const result = importSpecKit(dir, 'kit');

    expect(result.cards.map(c => [c.title, c.lane, c.spec])).toEqual([
      ['Login', 'build', 'specs/c-001-login'],
      ['export', 'build', 'specs/c-002-export'],
    ]);
    expect(readFileSync(join(dir, 'specs/c-001-login/tasks.md'), 'utf-8')).toBe(
      '- [ ] T001 [P] [US1] [api] Create model in src/api/models/user.py\n- [x] T002 [US1] [ui] Build form in src/components/Login.tsx\n- [ ] T003 [US2] [?] Decide the retention policy\n',
    );
    expect(result.flagged.map(f => f.task)).toEqual(['- [ ] T003 [US2] [?] Decide the retention policy']);
    expect(checkSpec(dir, 'specs/c-001-login')[0]).toMatch(/untagged task.*T003/);
    expect(readFileSync(join(dir, 'kit/specs/001-login/tasks.md'), 'utf-8')).toBe(tasks);
  });

  it('bmad: one card per story, at the stage its status maps to', () => {
    write('bmad/docs/sprint-status.yaml', 'development_status:\n  epic-1: in-progress\n  1-1-user-auth: done\n  1-2-account: in-progress\n  1-3-billing: backlog\n  epic-1-retrospective: optional\n');
    write('bmad/docs/1-2-account.md', '# Story 1.2: Account settings\n\nStatus: in-progress\n');

    const { cards } = importBmad(dir, 'bmad');

    expect(cards.map(c => [c.title, c.stage])).toEqual([
      ['1 1 user auth', 'done'],
      ['Story 1.2: Account settings', 'build'],
      ['1 3 billing', 'research'],
    ]);
    expect(readFileSync(join(dir, cards[1].spec!, 'spec.md'), 'utf-8')).toContain('Account settings');
  });
});
