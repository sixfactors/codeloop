import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readCards } from '../cards.js';
import { callTools, CloudConflictError, connect, disconnect, loadSync, pull, push, status, syncBefore, type DocState } from '../cloud.js';
import { loadConfig } from '../config.js';
import { createCard, loadEngineConfig } from '../engine.js';
import { buildInbox } from '../inbox.js';
import { loadLane } from '../lane.js';
import { evalProposal, promote } from '../proposals.js';
import { scaffold } from '../scaffold.js';
import { capture, listPages } from '../wiki.js';

const FAKE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/fake-mcp.mjs');
const LANE = 'id: market\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - { id: draft, done: { cmd: "true" } }\n';
const CONFIG = 'gates:\n  mode: all\ncapacity:\n  gates_per_day: 8\n';
let server: ChildProcess;
let url: string;
let dirs: string[] = [];
let run = 0;

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'codeloop-sync-'));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/lanes/market.yaml'), LANE);
  writeFileSync(join(dir, '.codeloop/config.yaml'), CONFIG);
  dirs.push(dir);
  return dir;
}

// Each test gets its own board title and folder, so the pages of one test are invisible to the next.
const conn = () => ({ url, key: 'test-key', boardTitle: `sync board ${run}`, folder: `codeloop-sync-${run}` });
const states = (dir: string): Record<string, DocState> => Object.fromEntries(status(dir).documents.map(d => [d.path, d.state]));
const file = (dir: string, path: string) => join(dir, '.codeloop', path);
const read = (dir: string, path: string) => readFileSync(file(dir, path), 'utf-8');

/** What a teammate, or the Protobox editor, does: writes the page without going through this checkout. */
function editInCloud(dir: string, path: string, content: string): void {
  callTools(conn(), [{ name: 'KNOWLEDGE_WRITE_PAGE', args: { pageId: loadSync(dir).documents[path].pageId, content, mode: 'replace' } }]);
}

function offline<T>(dir: string, fn: () => T): T {
  const cloud = file(dir, 'cloud.json');
  const saved = readFileSync(cloud, 'utf-8');
  writeFileSync(cloud, JSON.stringify({ ...JSON.parse(saved), url: 'http://127.0.0.1:1/mcp' }));
  try {
    return fn();
  } finally {
    writeFileSync(cloud, saved);
  }
}

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

describe('local.yaml', () => {
  it('overrides config.yaml key by key on this machine', () => {
    const dir = project();
    writeFileSync(file(dir, 'local.yaml'), 'capacity:\n  gates_per_day: 2\nagents:\n  claude: { cmd: "/opt/bin/claude -p < {brief}" }\n');
    expect(loadConfig(dir)).toMatchObject({ gates: { mode: 'all' }, capacity: { gates_per_day: 2 }, agents: { claude: { cmd: '/opt/bin/claude -p < {brief}' } } });
    expect(loadEngineConfig(dir).gatesPerDay).toBe(2);
  });

  it('is gitignored by init and never uploaded', () => {
    const dir = project();
    scaffold(dir, 'generic.yaml', ['claude']);
    expect(read(dir, '.gitignore').split('\n')).toEqual(expect.arrayContaining(['local.yaml', 'state/sync.json', 'cloud.json']));
    writeFileSync(file(dir, 'local.yaml'), 'token: do-not-upload\n');
    connect(dir, conn());
    expect(Object.keys(loadSync(dir).documents)).not.toContain('local.yaml');
    expect(callTools(conn(), [{ name: 'KNOWLEDGE_SEARCH', args: { query: 'do-not-upload' } }])[0].results).toEqual([]);
  });
});

describe('cloud sync of config, lanes and wiki', () => {
  it('uploads config.yaml and each lane on connect and records page, revision and hash in sync.json', () => {
    const dir = project();
    connect(dir, conn());
    const docs = loadSync(dir).documents;
    expect(Object.keys(docs).sort()).toEqual(['cards.json', 'config.yaml', 'lanes/market.yaml']);
    expect(docs['lanes/market.yaml']).toMatchObject({ kind: 'lane', revision: 1 });
    expect(docs['lanes/market.yaml'].pageId).toBeTruthy();
    expect(docs['config.yaml'].hash).toMatch(/^[a-f0-9]{64}$/);
    expect(states(dir)).toEqual({ 'cards.json': 'in-sync', 'config.yaml': 'in-sync', 'lanes/market.yaml': 'in-sync' });
    expect(JSON.parse(read(dir, 'cloud.json'))).not.toHaveProperty('board');
  });

  it('records the revision of a page whose write reply did not carry one', () => {
    const dir = project();
    writeFileSync(file(dir, 'config.yaml'), CONFIG + '# a long starter config\n'.repeat(120));
    connect(dir, conn());
    expect(loadSync(dir).documents['config.yaml'].revision).toBe(1);
    expect(states(dir)['config.yaml']).toBe('in-sync');
  });

  it('reports each document as in-sync, local-ahead, cloud-ahead or both-changed', () => {
    const dir = project();
    capture(dir, { title: `Local page ${run}`, scope: [], body: 'one' });
    capture(dir, { title: `Both page ${run}`, scope: [], body: 'one' });
    connect(dir, conn());

    writeFileSync(file(dir, `wiki/gotchas/local-page-${run}.md`), read(dir, `wiki/gotchas/local-page-${run}.md`) + 'edited here\n');
    editInCloud(dir, 'config.yaml', CONFIG.replace('8', '5'));
    writeFileSync(file(dir, `wiki/gotchas/both-page-${run}.md`), read(dir, `wiki/gotchas/both-page-${run}.md`) + 'edited here\n');
    editInCloud(dir, `wiki/gotchas/both-page-${run}.md`, 'edited there');

    expect(states(dir)).toEqual({
      'cards.json': 'in-sync',
      'config.yaml': 'cloud-ahead',
      'lanes/market.yaml': 'in-sync',
      [`wiki/gotchas/local-page-${run}.md`]: 'local-ahead',
      [`wiki/gotchas/both-page-${run}.md`]: 'both-changed',
    });
  });

  it('before a command, pulls a config and a lane page someone else changed into unchanged local files', () => {
    const dir = project();
    connect(dir, conn());
    editInCloud(dir, 'config.yaml', CONFIG.replace('8', '5'));
    editInCloud(dir, 'lanes/market.yaml', LANE.replace('version: 1', 'version: 2'));

    syncBefore(dir);
    expect(loadEngineConfig(dir).gatesPerDay).toBe(5);
    expect(loadLane(dir, 'market').version).toBe(2);
    expect(states(dir)).toMatchObject({ 'config.yaml': 'in-sync', 'lanes/market.yaml': 'in-sync' });
  });

  it('reports a plain local edit to a lane and does not push it; lane promote pushes the lane', () => {
    const dir = project();
    connect(dir, conn());
    const page = loadSync(dir).documents['lanes/market.yaml'];
    writeFileSync(file(dir, 'lanes/market.yaml'), LANE + '# edited by hand\n');

    expect(syncBefore(dir).join('\n')).toContain('lanes/market.yaml was edited here and is not pushed');
    expect(push(dir).held).toEqual(['lanes/market.yaml']);
    expect(callTools(conn(), [{ name: 'KNOWLEDGE_READ_PAGE', args: { pageId: page.pageId } }])[0]).toMatchObject({ latestRevisionN: 1 });

    writeFileSync(file(dir, 'lanes/market.yaml'), LANE);
    const proposal = file(dir, 'proposals/p1');
    mkdirSync(proposal, { recursive: true });
    writeFileSync(join(proposal, 'lane.yaml'), LANE.replace('version: 1', 'version: 2'));
    expect(evalProposal(dir, 'p1').green).toBe(true);
    promote(dir, 'p1', 'owner');

    const remote = callTools(conn(), [{ name: 'KNOWLEDGE_READ_PAGE', args: { pageId: page.pageId } }])[0];
    expect(remote).toMatchObject({ latestRevisionN: 2 });
    expect(remote.content).toContain('version: 2');
    expect(states(dir)['lanes/market.yaml']).toBe('in-sync');
  });

  it('writes a wiki page changed on both sides beside the local one, lists it in the inbox, and pushes the merge once the copy is removed', () => {
    const dir = project();
    capture(dir, { title: `Both page ${run}`, scope: [], body: 'one' });
    connect(dir, conn());
    const path = `wiki/gotchas/both-page-${run}.md`;
    const mine = read(dir, path) + 'edited here\n';
    writeFileSync(file(dir, path), mine);
    editInCloud(dir, path, 'edited there');

    syncBefore(dir);
    const copy = path.replace(/\.md$/, '.cloud.md');
    expect(read(dir, path)).toBe(mine);
    expect(read(dir, copy)).toBe('edited there\n');
    expect(buildInbox(dir).needs_merge).toEqual([{ path: `.codeloop/${path}`, cloud: `.codeloop/${copy}` }]);
    expect(listPages(dir).map(p => p.path)).toEqual([`.codeloop/${path}`]);

    // Still held while the copy is there: a second command must not overwrite the teammate's version.
    syncBefore(dir);
    expect(states(dir)[path]).toBe('both-changed');

    writeFileSync(file(dir, path), mine + 'and merged\n');
    rmSync(file(dir, copy));
    syncBefore(dir);
    expect(states(dir)[path]).toBe('in-sync');
    expect(callTools(conn(), [{ name: 'KNOWLEDGE_READ_PAGE', args: { pageId: loadSync(dir).documents[path].pageId } }])[0].content).toContain('and merged');
  });

  it('takes a wiki page another checkout wrote, and leaves alone one that belongs to another project folder', () => {
    const a = project();
    connect(a, conn());
    const b = project();
    connect(b, conn());
    const other = project();
    connect(other, { ...conn(), boardTitle: `other board ${run}`, folder: `other-${run}` });
    capture(a, { title: `Shared page ${run}`, scope: [], body: 'from a' });

    syncBefore(b);
    syncBefore(other);
    expect(listPages(b).map(p => p.title)).toEqual([`Shared page ${run}`]);
    expect(listPages(other)).toEqual([]);
  });

  it('pulls a board that changed only in the cloud before the next command', () => {
    const a = project();
    createCard(a, { lane: 'market', title: 'one', id: 'c-1' });
    connect(a, conn());
    const b = project();
    connect(b, conn());
    pull(b);
    createCard(a, { lane: 'market', title: 'two', id: 'c-2' });

    syncBefore(b);
    expect(readCards(b).cards.map(c => c.id)).toEqual(['c-1', 'c-2']);
    createCard(b, { lane: 'market', title: 'three', id: 'c-3' });
    expect(states(b)['cards.json']).toBe('in-sync');
  });
});

describe('request budget', () => {
  const requests = (): number => callTools(conn(), [{ name: 'FAKE_REQUEST_COUNT', args: {} }])[0].requests;

  it('spends one request on a card write and one on the sync before a command', () => {
    const dir = project();
    connect(dir, conn());
    const before = requests();
    createCard(dir, { lane: 'market', title: 'one write', id: 'c-1' });
    syncBefore(dir);
    // Two for the work, one for asking the count again.
    expect(requests() - before).toBe(3);
  });
});

describe('offline', () => {
  it('keeps a write locally, marks it pending, and pushes it first on the next command', () => {
    const dir = project();
    connect(dir, conn());
    offline(dir, () => createCard(dir, { lane: 'market', title: 'offline', id: 'c-1' }));
    expect(readCards(dir).cards.map(c => c.id)).toEqual(['c-1']);
    expect(loadSync(dir).documents['cards.json']).toMatchObject({ pending: true, revision: 1 });
    expect(offline(dir, () => syncBefore(dir)).join('\n')).toContain('unreachable');

    expect(syncBefore(dir).join('\n')).toContain('pushed pending cards.json');
    expect(loadSync(dir).documents['cards.json']).toMatchObject({ revision: 2 });
    expect(loadSync(dir).documents['cards.json'].pending).toBeUndefined();
    expect(status(dir)).toMatchObject({ pageRevision: 2, inSync: true, cards: 1 });
  });

  it('refuses the pending board write when the cloud board moved meanwhile, and leaves the file alone', () => {
    const a = project();
    connect(a, conn());
    const b = project();
    connect(b, conn());
    offline(b, () => createCard(b, { lane: 'market', title: 'from b, offline', id: 'c-9' }));
    createCard(a, { lane: 'market', title: 'from a', id: 'c-1' });
    const before = read(b, 'cards.json');

    expect(() => syncBefore(b)).toThrow(CloudConflictError);
    expect(read(b, 'cards.json')).toBe(before);
    expect(states(b)['cards.json']).toBe('both-changed');

    pull(b);
    expect(readCards(b).cards.map(c => c.id)).toEqual(['c-1']);
    expect(syncBefore(b)).toEqual([]);
  });

  it('disconnect pushes pending writes, pulls everything, and removes the connection and the sync record', () => {
    const a = project();
    connect(a, conn());
    const b = project();
    connect(b, conn());
    offline(a, () => capture(a, { title: `Offline page ${run}`, scope: [], body: 'kept' }));
    expect(loadSync(a).documents[`wiki/gotchas/offline-page-${run}.md`]).toMatchObject({ pending: true });
    capture(b, { title: `Teammate page ${run}`, scope: [], body: 'theirs' });
    editInCloud(b, 'config.yaml', CONFIG.replace('8', '3'));

    disconnect(a);
    expect(existsSync(file(a, 'cloud.json'))).toBe(false);
    expect(existsSync(file(a, 'state/sync.json'))).toBe(false);
    expect(loadEngineConfig(a).gatesPerDay).toBe(3);
    expect(read(a, `wiki/gotchas/teammate-page-${run}.md`)).toContain('theirs');
    syncBefore(b);
    expect(read(b, `wiki/gotchas/offline-page-${run}.md`)).toContain('kept');
  });
});
