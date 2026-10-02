import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ConflictError, readCards } from '../cards.js';
import { CloudError, connect, disconnect, loadSync, pull, search, status } from '../cloud.js';
import { createCard } from '../engine.js';
import { capture } from '../wiki.js';

const FAKE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/fake-mcp.mjs');
const LANE = 'id: market\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - { id: draft, done: { cmd: "true" } }\n';
let server: ChildProcess;
let url: string;
let dirs: string[] = [];

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'codeloop-cloud-'));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/lanes/market.yaml'), LANE);
  dirs.push(dir);
  return dir;
}

// Each test gets its own board title, so the pages of one test are invisible to the next.
let run = 0;
const conn = () => ({ url, key: 'test-key', boardTitle: `board ${run}`, folder: `codeloop-${run}` });

beforeAll(async () => {
  server = spawn(process.execPath, [FAKE], { stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise<string>(resolve => server.stdout!.once('data', d => resolve(String(d).trim())));
  url = `http://127.0.0.1:${port}/mcp`;
});

afterAll(() => {
  server.kill();
});

beforeEach(() => {
  run++;
});

afterEach(() => {
  dirs.forEach(d => rmSync(d, { recursive: true, force: true }));
  dirs = [];
});

describe('cloud store', () => {
  it('uploads the board on connect and keeps the page in step with every card write', () => {
    const dir = project();
    createCard(dir, { lane: 'market', title: 'before connect', id: 'c-1' });

    expect(connect(dir, conn())).toMatchObject({ adopted: false, revision: 1 });
    createCard(dir, { lane: 'market', title: 'after connect', id: 'c-2' });

    expect(status(dir)).toMatchObject({ pageRevision: 2, lastSeenRevision: 2, localVersion: 2, cards: 2, inSync: true });
    expect(readFileSync(join(dir, '.codeloop/.gitignore'), 'utf-8')).toContain('cloud.json');
  });

  it('refuses a write from a checkout whose copy is stale, leaves its file alone, and accepts it after a pull', () => {
    const a = project();
    createCard(a, { lane: 'market', title: 'from a', id: 'c-1' });
    connect(a, conn());

    const b = project();
    expect(connect(b, conn())).toMatchObject({ adopted: true, revision: 1 });
    createCard(a, { lane: 'market', title: 'a again', id: 'c-2' });

    expect(() => createCard(b, { lane: 'market', title: 'from b', id: 'c-9' })).toThrow(ConflictError);
    expect(existsSync(join(b, '.codeloop/cards.json'))).toBe(false);

    pull(b);
    expect(readCards(b).cards.map(c => c.id)).toEqual(['c-1', 'c-2']);
    createCard(b, { lane: 'market', title: 'from b', id: 'c-9' });
    expect(status(a)).toMatchObject({ pageRevision: 3, lastSeenRevision: 2, inSync: false });
  });

  it('adopts an existing board page on connect instead of overwriting it', () => {
    const a = project();
    createCard(a, { lane: 'market', title: 'kept', id: 'c-1' });
    connect(a, conn());

    const empty = project();
    connect(empty, conn());
    pull(empty);
    expect(readCards(empty).cards.map(c => c.title)).toEqual(['kept']);
  });

  it('writes a captured wiki page to the cloud, where search finds it', () => {
    const dir = project();
    connect(dir, conn());
    capture(dir, { title: `Rename is not atomic ${run}`, scope: ['src/**'], body: 'Write the temp file next to the target.' });

    expect(search(dir, `Rename is not atomic ${run}`).map(r => r.title)).toEqual([`Rename is not atomic ${run} (gotchas/rename-is-not-atomic-${run}.md)`]);
    expect(Object.keys(loadSync(dir).documents)).toContain(`wiki/gotchas/rename-is-not-atomic-${run}.md`);
  });

  it('disconnect brings the board back into the repo and removes the connection file', () => {
    const a = project();
    createCard(a, { lane: 'market', title: 'one', id: 'c-1' });
    connect(a, conn());
    const b = project();
    connect(b, conn());

    disconnect(b);
    expect(readCards(b).cards.map(c => c.id)).toEqual(['c-1']);
    expect(existsSync(join(b, '.codeloop/cloud.json'))).toBe(false);
    createCard(b, { lane: 'market', title: 'local only', id: 'c-2' });
    expect(status(a).pageRevision).toBe(1);
  });

  it('reports a wrong key as an error instead of connecting', () => {
    expect(() => connect(project(), { ...conn(), key: 'wrong' })).toThrow(CloudError);
  });
});
