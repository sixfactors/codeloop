import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readCards } from '../cards.js';
import { createCard } from '../engine.js';
import { addQuestions } from '../interview.js';
import { newMock } from '../mock.js';
import { createApp } from '../server.js';
import { newSpec } from '../spec.js';
import { FileDriver } from '../store/index.js';

let dir: string;

const post = ({ app, token }: ReturnType<typeof createApp>, path: string, body: object, withToken = true) =>
  app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(withToken ? { 'x-codeloop-token': token } : {}) }, body: JSON.stringify(body) });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-workspace-api-'));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  mkdirSync(join(dir, '.codeloop/wiki/initiatives'), { recursive: true });
  mkdirSync(join(dir, '.codeloop/wiki/cards'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/config.yaml'), 'project:\n  name: demo\ncloud:\n  key: hush\n  url: https://x\n');
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), `id: build
version: 1
metric: { name: m, source: cards }
stages:
  - id: draft
    output: out/{id}.md
    done: { cmd: "true" }
  - id: ship
    done: { cmd: "true" }
`);
  writeFileSync(join(dir, '.codeloop/wiki/initiatives/fast-loop.md'), '---\ntitle: Fast loop\nstatus: active\n---\nWe believe a founder keeps using a loop that sizes its ceremony to the work.\n');
  createCard(dir, { lane: 'build', title: 'Ship the thing', id: 'c-1' });
  newSpec(dir, 'c-1');
  writeFileSync(join(dir, 'specs/001-ship-the-thing/spec.md'), '# Spec\n\nscreens:\n  - inbox\n');
  addQuestions(dir, 'c-1', [{ question: 'Which colour?', recommended: 'blue' }]);
  newMock(dir, 'c-1', 'board');
  writeFileSync(join(dir, '.codeloop/wiki/cards/c-1.md'), '---\ntitle: Ship the thing\ncard: c-1\n---\nStory: as a founder.\n');
  mkdirSync(join(dir, 'evidence/001'), { recursive: true });
  writeFileSync(join(dir, 'evidence/001/verify.md'), '# verify\npass\n');
  writeFileSync(join(dir, 'evidence/001/shot.png'), Buffer.from([0x89, 0x50]));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('workspace API reads', () => {
  it('serves lanes, initiatives, stats and config without secrets, all as JSON', async () => {
    const { app } = createApp(dir);
    const lanes = await (await app.request('/api/lanes')).json();
    expect(lanes.lanes.map((l: { id: string; stages: unknown[] }) => [l.id, l.stages.length])).toEqual([['build', 2]]);

    const initiatives = await (await app.request('/api/initiatives')).json();
    expect(initiatives.initiatives[0]).toMatchObject({ id: 'fast-loop', title: 'Fast loop', status: 'active' });

    const stats = await (await app.request('/api/stats')).json();
    expect(stats).toMatchObject({ cards: 1, done: 0 });

    const res = await app.request('/api/config');
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ config: { project: { name: 'demo' }, cloud: { url: 'https://x' } } });
  });

  it('searches pages by title and body, case-insensitively, and finds an initiative by its hypothesis', async () => {
    const { app } = createApp(dir);
    const found = await (await app.request('/api/pages?q=SIZES ITS CEREMONY')).json();
    expect(found.pages.map((p: { id: string }) => p.id)).toEqual(['.codeloop/wiki/initiatives/fast-loop.md']);
    expect(found.pages[0]).not.toHaveProperty('body');

    const byFolder = await (await app.request('/api/pages?folder=cards')).json();
    expect(byFolder.pages.map((p: { id: string; title: string }) => [p.id, p.title])).toEqual([['.codeloop/wiki/cards/c-1.md', 'Ship the thing']]);
  });

  it('serves one page with its body and answers 404 JSON for one that is not there', async () => {
    const { app } = createApp(dir);
    const page = await (await app.request('/api/pages/.codeloop/wiki/initiatives/fast-loop.md')).json();
    expect(page.page).toMatchObject({ folder: 'initiatives', title: 'Fast loop', frontmatter: { title: 'Fast loop', status: 'active' } });
    expect(page.page.body).toContain('We believe');
    expect(page.page.version).toMatch(/^[0-9a-f]{40}$/);

    const missing = await app.request('/api/pages/.codeloop/wiki/initiatives/nope.md');
    expect(missing.status).toBe(404);
    expect(missing.headers.get('content-type')).toContain('application/json');
    expect(await missing.json()).toEqual({ error: 'page .codeloop/wiki/initiatives/nope.md not found' });
  });

  it('full card carries spec, tasks, questions, evidence, mock and the wiki card page', async () => {
    const { app } = createApp(dir);
    const full = await (await app.request('/api/cards/c-1/full')).json();
    expect(full.card).toMatchObject({ id: 'c-1', mock: '/mocks/demo/board/c-1.html', openQuestions: 1 });
    expect(full.spec.dir).toBe('specs/001-ship-the-thing');
    expect(full.spec.text).toContain('screens:');
    expect(Array.isArray(full.tasks)).toBe(true);
    expect(full.questions).toEqual([{ n: 1, question: 'Which colour?', recommended: 'blue', answer: '' }]);
    expect(full.evidence).toMatchObject({ id: '001', cardId: 'c-1' });
    expect(full.evidence.files.map((f: { name: string; kind: string }) => [f.name, f.kind])).toEqual([['shot.png', 'image'], ['verify.md', 'md']]);
    expect(full.mock).toBe('/mocks/demo/board/c-1.html');
    expect(full.page).toMatchObject({ id: '.codeloop/wiki/cards/c-1.md', title: 'Ship the thing' });

    expect((await app.request('/api/cards/c-9/full')).status).toBe(404);
  });

  it('evidence comes with text contents and image paths; artifacts carry the mock lineage', async () => {
    const { app } = createApp(dir);
    const evidence = await (await app.request('/api/evidence/001')).json();
    expect(evidence.files.find((f: { name: string }) => f.name === 'verify.md').content).toBe('# verify\npass\n');
    expect(evidence.files.find((f: { name: string }) => f.name === 'shot.png')).toEqual({ name: 'shot.png', kind: 'image', path: 'evidence/001/shot.png' });
    expect((await app.request('/api/evidence/999')).status).toBe(404);

    const artifacts = await (await app.request('/api/artifacts')).json();
    expect(artifacts.artifacts[0]).toMatchObject({ kind: 'mock', cardId: 'c-1', project: 'demo', topic: 'board', from: 'base', lineage: ['c-1', 'base'], href: '/mocks/demo/board/c-1.html' });
  });

  it('keeps /api/cards as the board reads it, paged and without event logs', async () => {
    const { app } = createApp(dir);
    const body = await (await app.request('/api/cards')).json();
    expect(Object.keys(body).sort()).toEqual(['cards', 'inbox', 'lanes', 'nextCursor', 'owner', 'total', 'version']);
    // The card's own version is a hash of its content, not of cards.json, so one card moving does not move them all.
    expect(body.cards[0].version).toMatch(/^[0-9a-f]{40}$/);
    expect(body.cards[0]).not.toHaveProperty('events');
    expect(body.cards[0]).toMatchObject({ id: 'c-1', mock: '/mocks/demo/board/c-1.html', openQuestions: 1, specDir: 'specs/001-ship-the-thing', hasEvidence: true });
    expect(body).toMatchObject({ total: 1, nextCursor: null });

    const withEvents = await (await app.request('/api/cards?include=events')).json();
    expect(Array.isArray(withEvents.cards[0].events)).toBe(true);
  });
});

describe('POST /api/cards', () => {
  const story = { lane: 'build', title: 'Owner sees every open question', persona: 'founder', can: 'see every open question', so: 'nothing waits on me', size: 'S' };

  it('refuses without the token and changes nothing', async () => {
    const app = createApp(dir, undefined, { owner: true });
    const before = readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8');
    const res = await post(app, '/api/cards', story, false);
    expect(res.status).toBe(403);
    expect(readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8')).toBe(before);
  });

  it('refuses a proposal with a technical title with the story check message', async () => {
    const app = createApp(dir, undefined, { owner: true });
    const res = await post(app, '/api/cards', { ...story, propose: true, title: 'Add --json to card list' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('title carries "--": name what the user can now do, not the mechanism (--force overrides)');
    expect(readCards(dir).cards.map(c => c.id)).toEqual(['c-1']);
  });

  it('creates a card in its lane, or a proposal that waits for the owner, through the engine', async () => {
    const app = createApp(dir, undefined, { owner: true });
    const made = await post(app, '/api/cards', story);
    expect(made.status).toBe(201);
    expect((await made.json()).card).toMatchObject({ id: 'c-002', lane: 'build', stage: 'draft', story: { as: 'founder' }, size: 'S' });

    const proposed = await post(app, '/api/cards', { ...story, propose: true, title: 'Owner gets pinged when a card needs them' });
    expect((await proposed.json()).card).toMatchObject({ id: 'c-003', stage: 'proposed', gate: 'proposal', awaiting: 'owner' });
    expect(readCards(dir).cards.map(c => c.id)).toEqual(['c-1', 'c-002', 'c-003']);
  });

  it('refuses a store write whose expected version moved under an API write', async () => {
    const store = new FileDriver(dir);
    const app = createApp(dir, undefined, { owner: true, store });
    const card = (await store.cards.get('c-1'))!;
    // A card made over the API moves cards.json, so a write that still expects the earlier read is stale.
    await post(app, '/api/cards', story);
    await expect(store.cards.put({ ...card, title: 'late' }, card.version)).rejects.toMatchObject({ name: 'ConflictError' });
    await store.close();
  });
});
