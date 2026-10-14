import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ApiError, CodeloopClient, createHttpClient } from '../../sdk/index.js';
import { createLocalClient } from '../../sdk/local.js';
import { appendActivity } from '../activity.js';
import { closeIndex } from '../index/index.js';
import { createApp } from '../server.js';

let dir: string;
const TOKEN = 'test-token';

// A lane whose first stage parks at an owner gate, so a created card reaches the inbox after one advance.
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-sdk-')));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/config.yaml'), 'project:\n  name: demo\n');
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
});

afterEach(async () => {
  await closeIndex(dir);
  rmSync(dir, { recursive: true, force: true });
});

/** A client over the Hono app in process, with the write token and a counter of the statuses seen. */
function overHttp(owner = false) {
  const { app } = createApp(dir, undefined, { token: TOKEN, owner });
  const statuses: number[] = [];
  const client = createHttpClient({
    token: TOKEN,
    fetch: async (url, init) => {
      const res = await app.request(url, init);
      statuses.push(res.status);
      return res;
    },
  });
  return { client, statuses };
}

const local = () => createLocalClient(dir, { role: 'owner' });

describe('local transport: the CLI path, no server', () => {
  it('creates a card and reads it back with its brief and Next line', async () => {
    const client = local();
    const made = await client.cards.new({ lane: 'market', title: 'Founders can read the launch post' });
    expect(made.card.id).toBe('c-001');
    expect(made.hint).toMatch(/^Next: /);
    const shown = await client.cards.show('1');
    expect(shown.card.id).toBe('c-001');
    expect(shown.brief?.output).toBe('out/c-001.md');
    const records = await client.cards.records();
    expect(records.map(r => r.id)).toEqual(['c-001']);
    expect(records[0].version).toBeTypeOf('string');
  });

  it('advance parks the card, and the inbox report lists it', async () => {
    const client = local();
    await client.cards.new({ lane: 'market', title: 'Founders can read the launch post' });
    const report = await client.cards.advance('c-001');
    expect(report.result.outcome).toBe('parked');
    expect(report.exitCode).toBe(0);
    const inbox = await client.inbox.report();
    expect(inbox.needs_you.map(c => c.id)).toEqual(['c-001']);
    const decided = await client.cards.approve('c-001', { note: 'fine' });
    expect(decided.summary).toBe('c-001 gate copy approved');
  });

  it('a refused write surfaces as the engine error, so the CLI exit code is unchanged', async () => {
    await expect(local().cards.show('c-404')).rejects.toThrow('card "c-404" not found');
  });
});

describe('http transport: the UI path against the same services', () => {
  it('reads what the local transport wrote, with ETag revalidation on the second read', async () => {
    await local().cards.new({ lane: 'market', title: 'Founders can read the launch post' });
    const { client, statuses } = overHttp();
    const first = await client.lanes();
    const second = await client.lanes();
    expect(first.map(l => l.id)).toEqual(['market']);
    expect(second).toEqual(first);
    expect(statuses).toEqual([200, 304]);
    const card = await client.cards.get('c-001');
    expect(card?.events.map(e => e.action)).toEqual(['create']);
    expect(await client.cards.get('c-999')).toBeUndefined();
  });

  it('refuses a decision on a read-only board and takes it on an owner board', async () => {
    await local().cards.new({ lane: 'market', title: 'Founders can read the launch post' });
    await local().cards.advance('c-001');
    await expect(overHttp(false).client.cards.approve('c-001')).rejects.toSatisfy((e: unknown) => e instanceof ApiError && e.status === 403);
    const decision = await overHttp(true).client.cards.approve('c-001', { note: 'ok' });
    expect(decision.summary).toBe('c-001 gate copy approved');
    expect(decision.gate).toBe('copy');
    expect(decision.card.gate).toBeUndefined();
  });

  it('creates and proposes cards the way the CLI does, with the same story refusal', async () => {
    const { client } = overHttp(true);
    const made = await client.cards.new({ lane: 'market', title: 'Founders can read the launch post' });
    expect(made.card.id).toBe('c-001');
    expect(made.hint).toMatch(/^Next: /);
    const proposed = await client.cards.propose({ lane: 'market', title: 'Founders can share the post', source: 'x' });
    expect(proposed.created).toBe(true);
    const again = await client.cards.propose({ lane: 'market', title: 'Founders can share the post', source: 'x' });
    expect(again.created).toBe(false);
    expect(again.card.id).toBe(proposed.card.id);
    await expect(client.cards.new({ lane: 'market', title: 'Fix parseTitle in the parser' })).rejects.toMatchObject({ status: 400 });
  });

  it('page writes carry versions: create, update, then a stale write is a 409', async () => {
    const { client } = overHttp();
    const id = '.codeloop/wiki/decisions/one.md';
    const created = await client.pages.put(id, { body: '# One\n' });
    expect(created.created).toBe(true);
    const updated = await client.pages.put(id, { body: '# One\n\nmore\n', expectVersion: created.page.version });
    expect(updated.created).toBe(false);
    await expect(client.pages.put(id, { body: 'stale', expectVersion: created.page.version })).rejects.toMatchObject({ status: 409 });
    expect((await client.pages.get(id))?.body).toContain('more');
    expect(await client.pages.delete(id)).toBe(true);
    expect(await client.pages.delete(id)).toBe(false);
  });

  it('questions: ask over http, answer as owner, read back through both transports', async () => {
    await local().cards.new({ lane: 'market', title: 'Founders can read the launch post' });
    const { client } = overHttp(true);
    const asked = await client.questions.ask('c-001', [{ question: 'Who reads it?', recommended: 'founders' }]);
    expect(asked.added.map(q => q.n)).toEqual([1]);
    const answered = await client.questions.answer('c-001', 1, { accept: true });
    expect(answered.answer).toBe('founders');
    expect((await local().questions.list('c-001'))[0].answer).toBe('founders');
  });

  it('the card screen payload is the same object from both transports', async () => {
    await local().cards.new({ lane: 'market', title: 'Founders can read the launch post' });
    const viaLocal = await local().cards.full('c-001');
    const viaHttp = await overHttp().client.cards.full('c-001');
    expect(viaHttp).toEqual(JSON.parse(JSON.stringify(viaLocal)));
    expect(viaHttp.spec?.dir).toBeUndefined();
    expect(new CodeloopClient(overHttp().client.transport).cards).toBeDefined();
  });

  it('with a `project`, every call goes to /api/p/<project>/... (the hub\'s mount point) instead of /api/...', async () => {
    const { app } = createApp(dir, undefined, { token: TOKEN, owner: true, apiBase: '/api/p/acme' });
    const seen: string[] = [];
    const client = createHttpClient({
      token: TOKEN,
      project: 'acme',
      fetch: (input, init) => {
        seen.push(String(input).split('?')[0]);
        return app.request(input, init);
      },
    });
    const made = await client.cards.new({ lane: 'market', title: 'Founders can share the roadmap' });
    expect(made.card.id).toBe('c-001');
    const read = await client.cards.get('c-001');
    expect(read?.id).toBe('c-001');
    expect(seen).toContain('/api/p/acme/cards');
    expect(seen).toContain('/api/p/acme/cards/c-001');
    expect(seen.some(p => !p.startsWith('/api/p/acme/'))).toBe(false);
  });
});

describe('activity: a card\'s work, the same through both transports and live on /api/events', () => {
  const line = (kind: string, extra: Record<string, unknown> = {}) => appendActivity(dir, 'c-001', { session: 'S1', kind, ...extra });

  /** The first `n` items of a stream, or a failure after two seconds instead of a hung test. */
  async function take<T>(n: number, stream: AsyncIterable<T>, controller: AbortController): Promise<T[]> {
    const out: T[] = [];
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      for await (const item of stream) {
        out.push(item);
        if (out.length === n) break;
      }
    } finally {
      clearTimeout(timer);
    }
    return out;
  }

  it('reads the same lines over local and http, and both streams replay then follow a new line', async () => {
    await local().cards.new({ lane: 'market', title: 'Founders can read the launch post' });
    line('prompt', { text: 'write the post' });
    line('edit', { file: 'out/c-001.md' });
    line('cmd', { text: 'npm test' });
    const { client: http } = overHttp();
    const fromLocal = await local().cards.activity('c-001');
    const fromHttp = await http.cards.activity('c-001');
    expect(fromLocal.lines.map(l => l.kind)).toEqual(['prompt', 'edit', 'cmd']);
    expect(fromHttp).toEqual(fromLocal);

    const streams = [local(), http].map(client => {
      const controller = new AbortController();
      return { controller, lines: take(4, client.cards.activityStream('c-001', { after: '0', signal: controller.signal }), controller) };
    });
    await new Promise(r => setTimeout(r, 300));
    line('check', { pass: false, stage: 'draft', output: 'no task list yet' });
    const [a, b] = await Promise.all(streams.map(s => s.lines));
    streams.forEach(s => s.controller.abort());
    expect(a.map(l => l.kind)).toEqual(['prompt', 'edit', 'cmd', 'check']);
    expect(b).toEqual(a);
  });

  it('GET /api/cards/:id/activity pages by cursor, revalidates by ETag, and 404s an unknown card', async () => {
    await local().cards.new({ lane: 'market', title: 'Founders can read the launch post' });
    for (const kind of ['prompt', 'edit', 'cmd']) line(kind);
    const { app } = createApp(dir, undefined, { token: TOKEN });
    const first = await app.request('/api/cards/c-001/activity?limit=2');
    const page1 = await first.json() as { card: string; lines: { kind: string; cursor: string }[]; next: string | null };
    expect(page1.lines.map(l => l.kind)).toEqual(['prompt', 'edit']);
    expect(page1.next).toBe(page1.lines[1].cursor);
    const page2 = await (await app.request(`/api/cards/c-001/activity?after=${page1.next}&limit=2`)).json() as typeof page1;
    expect(page2.lines.map(l => l.kind)).toEqual(['cmd']);
    expect(page2.next).toBeNull();
    expect((await app.request('/api/cards/c-001/activity?limit=2', { headers: { 'If-None-Match': first.headers.get('etag')! } })).status).toBe(304);
    expect((await app.request('/api/cards/c-404/activity')).status).toBe(404);
  });

  it('a line appended to a card arrives on /api/events as an activity frame', async () => {
    await local().cards.new({ lane: 'market', title: 'Founders can read the launch post' });
    const { app } = createApp(dir, undefined, { token: TOKEN });
    const controller = new AbortController();
    const res = await app.request('/api/events', { signal: controller.signal });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const messages: Record<string, unknown>[] = [];
    let buffer = '';
    const timer = setTimeout(() => controller.abort(), 2000);
    const read = async (want: (m: Record<string, unknown>) => boolean) => {
      for (;;) {
        const hit = messages.find(want);
        if (hit) return hit;
        const { value, done } = await reader.read();
        if (done) throw new Error('stream ended without the frame');
        buffer += decoder.decode(value);
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const data = part.split('\n').find(l => l.startsWith('data:'))?.slice(5).trim();
          if (data) messages.push(JSON.parse(data));
        }
      }
    };
    await read(m => m.type === 'hello');
    line('commit', { sha: 'a2e5c3', subject: 'fix(kit): the thing' });
    const frame = await read(m => m.type === 'activity');
    clearTimeout(timer);
    controller.abort();
    expect(frame).toMatchObject({ type: 'activity', card: 'c-001', line: { kind: 'commit', sha: 'a2e5c3', session: 'S1' } });
  });
});
