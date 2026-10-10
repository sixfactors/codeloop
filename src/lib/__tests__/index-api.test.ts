import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { realpathSync } from 'fs';
import { createCard } from '../engine.js';
import { closeIndex, getIndex } from '../index/index.js';
import { createApp } from '../server.js';
import { FileDriver } from '../store/index.js';

let dir: string;

const headers = (token: string) => ({ 'Content-Type': 'application/json', 'x-codeloop-token': token });
const until = async (check: () => Promise<boolean> | boolean, ms = 10_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await new Promise(r => setTimeout(r, 25));
  }
  return false;
};

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-index-')));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  mkdirSync(join(dir, '.codeloop/wiki/gotchas'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/config.yaml'), 'project:\n  name: demo\n');
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: draft\n    done: { cmd: "true" }\n  - id: ship\n    done: { cmd: "true" }\n');
  writeFileSync(join(dir, '.codeloop/wiki/gotchas/locks.md'), '---\ntitle: Locks\n---\n# Locks\n\nA lock held twice by one process never releases.\n');
  for (let n = 1; n <= 3; n++) createCard(dir, { lane: 'build', title: `Card ${n}`, id: `c-${n}` });
});

afterEach(async () => {
  await closeIndex(dir);
  rmSync(dir, { recursive: true, force: true });
});

describe('index', () => {
  it('patches one page from the watcher without listing the store again', async () => {
    const store = new FileDriver(dir);
    let lists = 0;
    const list = store.pages.list.bind(store.pages);
    store.pages.list = q => {
      lists++;
      return list(q);
    };
    const index = getIndex(dir, store);
    await index.ready;
    expect(lists).toBe(1);
    const before = index.versions.pages;

    writeFileSync(join(dir, '.codeloop/wiki/gotchas/watchers.md'), '# Watchers\n\nRecursive watch reports the path that moved.\n');
    expect(await until(async () => (await index.pages.search('recursive')).length === 1)).toBe(true);
    expect(lists).toBe(1);
    expect(index.versions.pages).toBe(before + 1);
    expect((await index.pages.list()).total).toBe(2);
  });

  it('finds a page by a word in its body, with an excerpt around it', async () => {
    const index = getIndex(dir);
    const { items } = await index.pages.list({ q: 'releases' });
    expect(items.map(p => p.id)).toEqual(['.codeloop/wiki/gotchas/locks.md']);
    expect(items[0].excerpt).toContain('never releases');
    expect(items[0]).not.toHaveProperty('body');
  });
});

describe('API over the index', () => {
  it('lists cards without events and walks the cursor', async () => {
    const { app } = createApp(dir);
    const first = await (await app.request('/api/cards?limit=2')).json();
    expect(first.cards.map((c: { id: string }) => c.id)).toEqual(['c-1', 'c-2']);
    expect(first.cards[0]).not.toHaveProperty('events');
    expect(first).toMatchObject({ total: 3, nextCursor: 'c-2' });

    const second = await (await app.request(`/api/cards?limit=2&cursor=${first.nextCursor}`)).json();
    expect(second.cards.map((c: { id: string }) => c.id)).toEqual(['c-3']);
    expect(second.nextCursor).toBeNull();

    const one = await (await app.request('/api/cards/c-2')).json();
    expect(one.card.id).toBe('c-2');
    expect(one.card.events.length).toBeGreaterThan(0);
  });

  it('answers 304 to a matching If-None-Match and a new ETag once something changed', async () => {
    const { app, token } = createApp(dir, undefined, { owner: true });
    const res = await app.request('/api/cards');
    const tag = res.headers.get('etag')!;
    expect(tag).toMatch(/^".+"$/);
    expect(res.headers.get('cache-control')).toBe('no-cache');

    const same = await app.request('/api/cards', { headers: { 'If-None-Match': tag } });
    expect(same.status).toBe(304);
    expect(await same.text()).toBe('');

    await app.request('/api/pages/.codeloop/wiki/gotchas/new.md', { method: 'PUT', headers: headers(token), body: JSON.stringify({ body: '# New\n' }) });
    const pages = await app.request('/api/pages');
    const pagesTag = pages.headers.get('etag')!;
    expect((await app.request('/api/pages', { headers: { 'If-None-Match': pagesTag } })).status).toBe(304);
    await app.request('/api/pages/.codeloop/wiki/gotchas/new.md', { method: 'DELETE', headers: headers(token) });
    expect((await app.request('/api/pages', { headers: { 'If-None-Match': pagesTag } })).status).toBe(200);
  });

  it('streams a put diff with the new version after a page PUT and a remove after DELETE', async () => {
    const { app, token } = createApp(dir, undefined, { owner: true });
    const controller = new AbortController();
    const res = await app.request('/api/events', { signal: controller.signal });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const messages: Record<string, unknown>[] = [];
    const read = async (want: (m: Record<string, unknown>) => boolean) => {
      for (;;) {
        const hit = messages.find(want);
        if (hit) return hit;
        const { value, done } = await reader.read();
        if (done) throw new Error('stream ended');
        buffer += decoder.decode(value);
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const data = part.split('\n').find(l => l.startsWith('data:'))?.slice(5).trim();
          if (data) messages.push(JSON.parse(data));
        }
      }
    };

    const hello = await read(m => m.type === 'hello');
    expect(hello.versions).toMatchObject({ cards: expect.any(Number), pages: expect.any(Number) });

    const put = await app.request('/api/pages/.codeloop/wiki/gotchas/stream.md', { method: 'PUT', headers: headers(token), body: JSON.stringify({ body: '# Stream\n' }) });
    const { page } = await put.json();
    const diff = await read(m => m.repo === 'pages' && m.id === '.codeloop/wiki/gotchas/stream.md');
    expect(diff).toEqual({ repo: 'pages', id: '.codeloop/wiki/gotchas/stream.md', version: page.version, kind: 'put' });

    await app.request('/api/pages/.codeloop/wiki/gotchas/stream.md', { method: 'DELETE', headers: headers(token) });
    const gone = await read(m => m.repo === 'pages' && m.kind === 'remove');
    expect(gone).toMatchObject({ id: '.codeloop/wiki/gotchas/stream.md', version: '' });
    expect(messages.some(m => m.type === 'board' || m.event === 'cards')).toBe(false);
    controller.abort();
  });
});
