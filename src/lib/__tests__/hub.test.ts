import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { readCards } from '../cards.js';
import { createCard } from '../engine.js';
import { closeIndex } from '../index/index.js';
import { createHubApp, type HubApp } from '../hub.js';
import { registerProject } from '../hub-registry.js';

let home: string;
let a: string;
let b: string;
let idA: string;
let idB: string;
let hub: HubApp;

function project(cardId: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'codeloop-hub-project-'));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/config.yaml'), 'project:\n  name: demo\n');
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: ship\n    done: { cmd: "true" }\n    gate: { name: ship, approver: owner, outward: true }\n');
  createCard(dir, { lane: 'build', title: 'Seed story', id: cardId });
  return dir;
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'codeloop-hub-home-'));
  process.env.CODELOOP_HOME = home;
  a = project('c-001');
  b = project('c-001'); // same card id in both projects, on purpose
  idA = registerProject(a, 'project-a').id;
  idB = registerProject(b, 'project-b').id;
  hub = createHubApp({ token: 'hub-token' });
});

afterEach(async () => {
  await hub.close();
  await Promise.all([closeIndex(a), closeIndex(b)]);
  rmSync(a, { recursive: true, force: true });
  rmSync(b, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
  delete process.env.CODELOOP_HOME;
});

const write = (id: string, headers: Record<string, string> = { 'x-codeloop-token': 'hub-token' }) =>
  hub.app.request(`/api/p/${id}/cards/c-001/approve`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' });
const read = (id: string, headers: Record<string, string> = {}) => hub.app.request(`/api/p/${id}/cards/c-001`, { headers });

describe('the hub keeps projects apart', () => {
  it('parallel writes to the same card id in two projects land only in their own cards.json', async () => {
    const [resA, resB] = await Promise.all([write(idA), write(idB)]);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(readCards(a).cards[0]).toMatchObject({ id: 'c-001' });
    expect(readCards(a).cards[0].gate).toBeUndefined();
    expect(readCards(b).cards[0]).toMatchObject({ id: 'c-001' });
    expect(readCards(b).cards[0].gate).toBeUndefined();
    expect(readCards(a).cards).toHaveLength(1);
    expect(readCards(b).cards).toHaveLength(1);
  });

  it('reads for project A never return project B\'s card, even with the same id', async () => {
    await write(idB); // only B is approved
    const [cardA, cardB] = await Promise.all([read(idA), read(idB)]);
    expect((await cardA.json()).card).toMatchObject({ gate: 'ship' });
    expect((await cardB.json()).card.gate).toBeUndefined();
  });

  it('an etag from project A never produces a stale 304 for project B', async () => {
    const etagA = (await read(idA)).headers.get('etag')!;
    expect(etagA).toBeTruthy();
    await write(idA); // A moves to 'done'; A's old etag is now stale even for A
    // B never changed and never saw that tag; sending it to B's endpoint must not make B skip
    // computing (and returning) its own real, current body.
    const crossed = await read(idB, { 'if-none-match': etagA });
    expect(crossed.status).toBe(200);
    expect((await crossed.json()).card).toMatchObject({ id: 'c-001', gate: 'ship' });
  });

  it('an SSE subscriber on project A gets no event when project B changes', async () => {
    const stream = await hub.app.request(`/api/p/${idA}/events`, { headers: { accept: 'text/event-stream' } });
    const reader = stream.body!.getReader();
    const decoder = new TextDecoder();
    // A reader allows only one outstanding read() at a time; a "nothing arrived" timeout must keep
    // that same pending read for the next call rather than starting a second one, or a frame that
    // lands just after the timeout is delivered to the abandoned call and the next one never sees it.
    let pending: ReturnType<typeof reader.read> | undefined;
    const next = async (timeoutMs: number): Promise<string | undefined> => {
      pending ??= reader.read();
      const timeout = new Promise<undefined>(r => setTimeout(() => r(undefined), timeoutMs));
      const result = await Promise.race([pending, timeout]);
      if (result === undefined) return undefined;
      pending = undefined;
      return result.done ? undefined : decoder.decode(result.value);
    };
    expect(await next(1000)).toContain('hello'); // the initial frame

    await write(idB);
    expect(await next(300)).toBeUndefined(); // nothing arrived for A

    await write(idA);
    expect(await next(1000)).toBeTruthy(); // A's own write does produce one
    await reader.cancel();
  });

  it('an unknown project id is a 404 naming the known ids', async () => {
    const res = await read('does-not-exist');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('does-not-exist');
    expect(body.known.sort()).toEqual([idA, idB].sort());
  });

  it('needs-you lists items from both projects in one response, each labelled with its project', async () => {
    const res = await hub.app.request('/api/hub/needs-you');
    expect(res.status).toBe(200);
    const body = await res.json();
    const projects = body.gates.map((g: { project: string }) => g.project).sort();
    expect(projects).toEqual([idA, idB].sort());
    expect(body.gates.every((g: { gate: string }) => g.gate === 'ship')).toBe(true);
  });

  it('idles out a project context after its timeout and rebuilds it cleanly on the next request', async () => {
    // Its own short-lived hub: the shared one above uses the default 30-minute idle so a long-lived
    // SSE connection in another test is never swept mid-test.
    const shortLived = createHubApp({ token: 'hub-token', idleMs: 50, sweepMs: 20 });
    try {
      const res1 = await shortLived.app.request(`/api/p/${idA}/cards/c-001`, { headers: { 'x-codeloop-token': 'hub-token' } });
      expect(res1.status).toBe(200);
      expect(shortLived.openContexts()).toBe(1);
      await new Promise(r => setTimeout(r, 200));
      expect(shortLived.openContexts()).toBe(0);
      const res2 = await shortLived.app.request(`/api/p/${idA}/cards/c-001`, { headers: { 'x-codeloop-token': 'hub-token' } });
      expect(res2.status).toBe(200);
      expect(shortLived.openContexts()).toBe(1);
    } finally {
      await shortLived.close();
    }
  });
});

describe('the hub\'s own write gate', () => {
  it('refuses a write to a project with no hub session or token, even though the project itself would allow it', async () => {
    const res = await write(idA, {});
    expect(res.status).toBe(403);
  });

  it('a hub sign-in, not a token, is also enough to write', async () => {
    const login = await hub.app.request('/api/hub/session/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: 'owner', password: 'codeloop' }) });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const res = await hub.app.request(`/api/p/${idA}/cards/c-001/approve`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: '{}' });
    expect(res.status).toBe(200);
  });
});
