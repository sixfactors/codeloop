import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readCards } from '../cards.js';
import { advanceCard, createCard } from '../engine.js';
import { createApp } from '../server.js';

let dir: string;

const post = ({ app, token }: ReturnType<typeof createApp>, path: string, body: object = {}) =>
  app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-codeloop-token': token }, body: JSON.stringify(body) });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-cards-api-'));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/lanes/market.yaml'), `id: market
version: 1
metric: { name: m, source: cards }
stages:
  - id: draft
    output: out/{id}.md
    done: { cmd: "true" }
    gate: { name: copy, approver: owner }
  - id: ship
    done: { cmd: "true" }
`);
  createCard(dir, { lane: 'market', title: 'Launch post', id: 'c-1' });
  advanceCard(dir, 'c-1');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('cards API', () => {
  it('serves cards, lanes and the inbox summary when there is no board.json', async () => {
    expect(existsSync(join(dir, '.codeloop/board.json'))).toBe(false);
    const res = await createApp(dir).app.request('/api/cards?include=inbox');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cards.map((c: { id: string; gate: string }) => [c.id, c.gate])).toEqual([['c-1', 'copy']]);
    expect(body.lanes[0].stages.map((s: { id: string }) => s.id)).toEqual(['draft', 'ship']);
    expect(body.inbox.summary).toBe('0 shipped this week, 1 waiting on you, oldest today');
    expect(body.inbox.needs_you[0].read).toBe('out/c-1.md');
    expect(body.owner).toBe(false);
  });

  it('refuses approve and reject with 403 unless the server was started as owner', async () => {
    const app = createApp(dir);
    const before = readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8');

    expect((await post(app, '/api/cards/c-1/approve')).status).toBe(403);
    expect((await post(app, '/api/cards/c-1/reject', { note: 'no' })).status).toBe(403);
    expect(readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8')).toBe(before);
  });

  it('as owner, approve goes through the engine and reject needs a note', async () => {
    const app = createApp(dir, undefined, { owner: true });

    const noNote = await post(app, '/api/cards/c-1/reject', {});
    expect(noNote.status).toBe(400);
    expect(readCards(dir).cards[0].gate).toBe('copy');

    const approved = await post(app, '/api/cards/c-1/approve');
    expect(approved.status).toBe(200);
    const card = readCards(dir).cards[0];
    expect(card.stage).toBe('ship');
    expect(card.events.find(e => e.action === 'approve')).toMatchObject({ actor: 'owner', human: true });

    expect((await post(app, '/api/cards/c-1/approve')).status).toBe(400);
  });
});

describe('board server access', () => {
  it('refuses a cross-origin POST with no token, even on an owner board, and the card is unchanged', async () => {
    const { app } = createApp(dir, undefined, { owner: true });
    const before = readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8');

    const res = await app.request('/api/cards/c-1/approve', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: '{}' });
    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8')).toBe(before);
  });

  it('refuses a write whose token is right but whose origin or content type is not', async () => {
    const { app, token } = createApp(dir, undefined, { owner: true });
    const send = (headers: Record<string, string>) => app.request('/api/cards/c-1/approve', { method: 'POST', headers: { 'x-codeloop-token': token, ...headers }, body: '{}' });

    expect((await send({ 'Content-Type': 'application/json', Origin: 'https://evil.example' })).status).toBe(403);
    expect((await send({ 'Content-Type': 'text/plain' })).status).toBe(415);
    expect(readCards(dir).cards[0].gate).toBe('copy');
    expect((await send({ 'Content-Type': 'application/json' })).status).toBe(200);
  });

  it('refuses a request addressed to another host name, so a rebound domain cannot read the board', async () => {
    const { app } = createApp(dir);
    expect((await app.request('http://attacker.example/api/cards')).status).toBe(403);
    expect((await app.request('http://127.0.0.1:4040/api/cards')).status).toBe(200);
  });
});

describe('board page', () => {
  it('serves the UI files it is given next to the cards API, and falls back to index.html', async () => {
    const ui = join(dir, 'ui');
    mkdirSync(join(ui, '_next'), { recursive: true });
    writeFileSync(join(ui, 'index.html'), '<html><title>Codeloop Board</title><script src="/_next/app.js"></script></html>');
    writeFileSync(join(ui, '_next/app.js'), 'console.log("cards view")');
    const { app } = createApp(dir, ui);

    const page = await app.request('/');
    expect(page.status).toBe(200);
    expect(page.headers.get('Content-Type')).toBe('text/html');
    expect(await page.text()).toContain('Codeloop Board');
    const script = await app.request('/_next/app.js');
    expect(script.headers.get('Content-Type')).toBe('application/javascript');
    expect(await (await app.request('/some/client/route')).text()).toContain('Codeloop Board');

    const cards = await (await app.request('/api/cards')).json();
    expect(cards.cards.map((c: { id: string }) => c.id)).toEqual(['c-1']);
  });
});
