import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { projectHealth } from '../health.js';
import { verify } from '../verify.js';

let dir: string;
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
};
const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'pipe' }).toString().trim();
const commit = (msg: string) => { git('add', '-A'); git('commit', '-q', '-m', msg); return git('rev-parse', 'HEAD'); };

const TEST_FILE = "import { it } from 'vitest';\nit('a', () => {});\nit('b', () => {});\n";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-health-'));
  git('init', '-q');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('projectHealth', () => {
  it('scores two test files and one TODO above one test file and three TODOs', () => {
    write('src/a.ts', '// TODO one\nexport const a = 1;\n');
    write('src/a.test.ts', TEST_FILE);
    write('src/b.test.ts', TEST_FILE);
    const good = projectHealth(dir);
    expect(good.tests).toEqual({ files: 2, cases: 4 });
    expect(good.todo).toBe(1);

    write('src/a.ts', '// TODO one\n// TODO two\n// FIXME three\nexport const a = 1;\n');
    rmSync(join(dir, 'src/b.test.ts'));
    const worse = projectHealth(dir);
    expect(worse.tests).toEqual({ files: 1, cases: 2 });
    expect(worse.todo).toBe(3);
    expect(good.score).toBeGreaterThan(worse.score);
  });

  it('ref scores the older commit, not the working tree', () => {
    write('src/a.ts', '// TODO x\n');
    write('src/a.test.ts', TEST_FILE);
    const old = commit('old');
    write('src/a.ts', '// TODO x\n// TODO y\n// TODO z\n');
    rmSync(join(dir, 'src/a.test.ts'));
    commit('new');
    const then = projectHealth(dir, { ref: old });
    expect(then.todo).toBe(1);
    expect(then.tests.files).toBe(1);
    expect(projectHealth(dir).todo).toBe(3);
  });

  it('counts type errors from health.types_cmd and critical gotchas, and skips lint without a command', () => {
    write('.codeloop/config.yaml', 'health:\n  types_cmd: "echo \'x.ts(1,1): error TS1 bad\'"\n');
    write('.codeloop/wiki/gotchas/g.md', '---\ntitle: g\nseverity: critical\nfreq: 3\n---\nbody\n');
    const h = projectHealth(dir);
    expect(h.types).toBe(1);
    expect(h.gotchas).toBe(1);
    expect(h.lint).toBeNull();
  });
});

describe('verify health gate', () => {
  function story(): void {
    write('specs/001/spec.md', 'acceptance:\n- US1 Given a, when b, then c.\n');
    write('usecases/001/uc-1.yaml', 'id: uc-1\naccept: US1\nfailure_mode: x\nlayers:\n  cli: { run: "true" }\n');
    write('src/a.test.ts', TEST_FILE);
    write('src/a.ts', 'export const a = 1;\n');
    commit('base');
    write('src/a.ts', '// TODO 1\n// TODO 2\n// TODO 3\n// TODO 4\n// TODO 5\n// TODO 6\nexport const a = 1;\n');
    write('src/b.ts', 'export const b = 1;\n');
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', 'commit', '-q', '-am', 'story', '-m', 'Card: 001'], { cwd: dir });
    git('add', '-A');
    git('-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'wip');
    write('evidence/001/verify.md', '## Live walk\nstack: make up\nurl: http://localhost:3000/\nsteps:\n- a\n- b\nnetwork:\n- GET http://localhost:3000/api 200\nexternal: none: the feature calls nothing outside\n');
  }

  it('writes a health line and fails when HEAD scores below the story base', async () => {
    story();
    const r = await verify(dir, '001');
    expect(r.exitCode).toBe(1);
    expect(r.problem).toMatch(/health score fell/);
    expect(readFileSync(join(dir, 'evidence/001/verify.md'), 'utf-8')).toMatch(/health: before [\d.]+, after [\d.]+, delta -[\d.]+, fail/);
  });

  it('passes inside health.tolerance', async () => {
    story();
    write('.codeloop/config.yaml', 'health:\n  tolerance: 100\n');
    expect((await verify(dir, '001')).exitCode).toBe(0);
  });

  it('health: off skips the measurement', async () => {
    story();
    write('.codeloop/config.yaml', 'health: off\n');
    const r = await verify(dir, '001');
    expect(r.exitCode).toBe(0);
    expect(readFileSync(join(dir, 'evidence/001/verify.md'), 'utf-8')).toMatch(/^health: off$/m);
  });
});
