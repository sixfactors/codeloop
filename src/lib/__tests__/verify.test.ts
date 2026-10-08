import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readCards, type Card } from '../cards.js';
import { createCard } from '../engine.js';
import { computeStats } from '../stats.js';
import { verify } from '../verify.js';

let dir: string;

function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

function useCase(id: string, accept: string, layers: string): void {
  write(`usecases/001/${id}.yaml`, `id: ${id}\naccept: ${accept}\nfailure_mode: x\nlayers:\n  ${layers}\n`);
}

const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'pipe' }).toString();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-verify-'));
  write('specs/001/spec.md', 'acceptance:\n- US1 Given a, when b, then c.\n- US2 Given d, when e, then f.\n');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('verify', () => {
  it('exits 2 naming an acceptance line that has no use case', async () => {
    useCase('uc-1', 'US1', 'cli: { run: "true" }');

    const result = await verify(dir, '001');
    expect(result.exitCode).toBe(2);
    expect(result.missing).toEqual(['US2']);
    expect(existsSync(join(dir, 'evidence/001/verify.md'))).toBe(false);
  });

  it('records a failing use case as evidence on the card and exits 1', async () => {
    write('.codeloop/lanes/build.yaml', 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - { id: verify, done: { cmd: "true" } }\n');
    createCard(dir, { lane: 'build', title: 't', id: 'c-1' });
    useCase('uc-1', 'US1', 'cli: { run: "echo conflict", expect: { exit: 0, stdout: conflict } }');
    useCase('uc-2', 'US2', 'cli: { run: "echo fine", expect: { exit: 0, stdout: conflict } }');

    const result = await verify(dir, '001');

    expect(result.exitCode).toBe(1);
    expect(result.cases.map(c => [c.id, c.pass])).toEqual([['uc-1', true], ['uc-2', false]]);
    expect(readFileSync(join(dir, 'evidence/001/verify.md'), 'utf-8')).toContain('result: fail');
    expect(JSON.parse(readFileSync(join(dir, 'evidence/001/uc-2.json'), 'utf-8'))).toMatchObject({ accept: 'US2', pass: false, layers: [{ layer: 'cli', pass: false }] });
    const card = readCards(dir).cards[0];
    expect(card.evidence).toEqual(['evidence/001/verify.md']);
    expect(card.events.at(-1)).toMatchObject({ action: 'verify', stage: 'verify' });
  });

  it('fails an api use case whose status differs from the expected one', async () => {
    const server = createServer((req, res) => res.writeHead(req.url === '/locked' ? 403 : 200).end()).listen(0);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    useCase('uc-1', 'US1', `api: { base_url: "${base}", request: { method: PATCH, path: /locked, body: { stage: live } }, expect: { status: 403 } }`);
    useCase('uc-2', 'US2', `api: { base_url: "${base}", request: { path: /open }, expect: { status: 403 } }`);

    const result = await verify(dir, '001');
    server.close();

    expect(result.cases.map(c => c.pass)).toEqual([true, false]);
    expect(result.exitCode).toBe(1);
  });

  it('does not count a use case with no runnable layer as a pass', async () => {
    useCase('uc-1', 'US1', 'cli: { run: "true" }');
    useCase('uc-2', 'US2', 'ui: { url: /board }');

    const result = await verify(dir, '001');
    expect(result.cases[1]).toMatchObject({ pass: false, layers: [] });
    expect(result.exitCode).toBe(1);
  });

  it('--mutate exits 4 for a use case that still passes on the commit before the feature', async () => {
    useCase('uc-1', 'US1', 'cli: { run: "test -f feature.txt" }');
    useCase('uc-2', 'US2', 'cli: { run: "true" }');
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    write('feature.txt', 'x');
    git('add', '-A');
    git('commit', '-q', '-m', 'feat: add it', '-m', 'Feature: c-1');

    const result = await verify(dir, 'c-1', { mutate: true });

    expect(result.exitCode).toBe(4);
    expect(result.vacuous).toEqual(['uc-2']);
    expect(git('worktree', 'list').trim().split('\n')).toHaveLength(1);
  });
});

describe('verify cannot pass on nothing', () => {
  it('exits 2 when the spec has no acceptance lines, or there are no use cases at all', async () => {
    useCase('uc-1', 'US1', 'cli: { run: "true" }');
    write('specs/001/spec.md', '# A spec nobody finished\n');
    expect(await verify(dir, '001')).toMatchObject({ exitCode: 2, problem: expect.stringMatching(/no acceptance lines/) });

    write('specs/001/spec.md', 'acceptance:\n- US1 Given a, when b, then c.\n');
    rmSync(join(dir, 'usecases'), { recursive: true });
    expect(await verify(dir, '001')).toMatchObject({ exitCode: 2, missing: ['US1'] });
  });

  function repoWithFeature(): void {
    write('specs/001/spec.md', 'acceptance:\n- US1 Given a, when b, then c.\n');
    // Passes whenever the build marker is absent, so it is only a real check if the setup ran.
    useCase('uc-1', 'US1', 'cli: { run: "test ! -f built.marker || test -f feature.txt" }');
    git('init', '-q');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    write('feature.txt', 'x');
    write('built.marker', 'x');
    git('add', 'feature.txt');
    git('commit', '-q', '-m', 'feat: add it', '-m', 'Feature: c-1');
  }

  it('--mutate exits 5 when no commit carries the Feature trailer, instead of passing', async () => {
    repoWithFeature();
    const result = await verify(dir, 'x-1', { mutate: true });
    expect(result.exitCode).toBe(5);
    expect(result.mutate).toMatch(/cannot run: no commit carries the trailer "Feature: x-1"/);
  });

  it('--mutate runs the configured setup in the worktree, so a use case fails there only for want of the feature', async () => {
    repoWithFeature();
    write('.codeloop/config.yaml', 'verify:\n  setup: "touch built.marker"\n');
    expect(await verify(dir, 'c-1', { mutate: true })).toMatchObject({ exitCode: 0, vacuous: [] });
  });

  it('--mutate exits 5 with "environment differs" when the setup fails, and gives no verdict', async () => {
    repoWithFeature();
    write('.codeloop/config.yaml', 'verify:\n  setup: "echo no toolchain >&2; exit 1"\n');
    const result = await verify(dir, 'c-1', { mutate: true });
    expect(result.exitCode).toBe(5);
    expect(result.vacuous).toEqual([]);
    expect(result.mutate).toMatch(/environment differs.*no toolchain/s);
  });
});

describe('commit-msg hook', () => {
  it('adds the Feature trailer from a branch name that contains a card id', () => {
    const hook = join(dirname(fileURLToPath(import.meta.url)), '../../../templates/hooks/commit-msg');
    git('init', '-q');
    copyFileSync(hook, join(dir, '.git/hooks/commit-msg'));
    chmodSync(join(dir, '.git/hooks/commit-msg'), 0o755);
    git('checkout', '-q', '-b', 'feat/CL-001-lane-engine');
    git('commit', '-q', '--allow-empty', '-m', 'feat: one');

    expect(git('log', '-1', '--format=%(trailers:key=Feature,valueonly)').trim()).toBe('CL-001');
  });
});

describe('stats', () => {
  it('matches a hand count over a card event log', () => {
    const at = (h: number) => new Date(Date.UTC(2026, 9, 1, h)).toISOString();
    const ev = (h: number, action: string, human: boolean, stage = 'draft') => ({ at: at(h), actor: human ? 'owner' : 'engine', human, action, stage });
    const base = { title: 't', lane: 'market', laneVersion: 1, retries: {}, evidence: [] };
    const cards: Card[] = [
      // rejected once, then approved; finished 10h after creation; longest gap with no human is 0h→4h
      { ...base, id: 'c-1', stage: 'done', createdAt: at(0), updatedAt: at(10), events: [ev(0, 'create', false), ev(4, 'reject', true), ev(6, 'approve', true), ev(10, 'advance', false)] },
      // approved first time, got stuck once, still open
      { ...base, id: 'c-2', stage: 'draft', createdAt: at(0), updatedAt: at(3), events: [ev(0, 'create', false), ev(1, 'stuck', false), ev(2, 'unstick', true), ev(3, 'approve', true)] },
    ];
    const lanes = [{ id: 'market', version: 1, metric: { name: 'm', source: 's' }, retries: 3, stages: [{ id: 'draft', gate: { name: 'copy', approver: 'owner' as const } }] }];

    expect(computeStats(cards, lanes)).toEqual({
      metrics: [{ lane: 'market', name: 'm', source: 's', value: null }],
      cards: 2,
      done: 1,
      human_turns_per_card: 2,
      unattended_span_hours: 4,
      cycle_time_hours: 10,
      rework: 0.5,
      stuck_rate: 0.5,
      first_pass_rate_by_gate: { 'market/copy': 0.5 },
    });
  });
});
