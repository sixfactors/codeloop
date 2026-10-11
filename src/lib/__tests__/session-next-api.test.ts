import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { createHttpClient } from '../../sdk/index.js';
import { createCard } from '../engine.js';
import { AGENT_RUNS_DIR } from '../agent.js';
import { closeIndex } from '../index/index.js';
import { createApp } from '../server.js';

const TOKEN = 'test-token';
let dir: string;

function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

function lane(id: string, stages: string, extra = ''): void {
  write(`.codeloop/lanes/${id}.yaml`, `id: ${id}\nversion: 1\nmetric: { name: m, source: cards }\n${extra}stages:\n${stages}`);
}

/** A card record written straight to cards.json; fast when the engine's own checks aren't the point. */
function appOverHttp(owner: boolean) {
  const { app } = createApp(dir, undefined, { token: TOKEN, owner });
  return { app, http: createHttpClient({ token: TOKEN, fetch: (url, init) => app.request(url, init) }) };
}

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-session-next-')));
  write('.codeloop/config.yaml', 'project:\n  name: demo\n');
});

afterEach(async () => {
  await closeIndex(dir);
  rmSync(dir, { recursive: true, force: true });
});

describe('GET /api/session', () => {
  it('reports signedIn and tokenValid independently, defaultPassword true with no local.yaml, and owner from how the server was started', async () => {
    lane('build', `  - id: ship\n    done: { cmd: "true" }\n`);
    const { app } = appOverHttp(true);
    const project = { name: 'demo', path: dir };

    const anonymous = await app.request('/api/session');
    expect(await anonymous.json()).toEqual({ owner: true, signedIn: false, tokenValid: false, defaultPassword: true, project });

    const wrongToken = await app.request('/api/session', { headers: { 'x-codeloop-token': 'nope' } });
    expect(await wrongToken.json()).toEqual({ owner: true, signedIn: false, tokenValid: false, defaultPassword: true, project });

    const rightToken = await app.request('/api/session', { headers: { 'x-codeloop-token': TOKEN } });
    expect(await rightToken.json()).toEqual({ owner: true, signedIn: false, tokenValid: true, defaultPassword: true, project });

    const { app: readOnlyApp } = appOverHttp(false);
    const readOnlySession = await readOnlyApp.request('/api/session', { headers: { 'x-codeloop-token': TOKEN } });
    expect(await readOnlySession.json()).toEqual({ owner: false, signedIn: false, tokenValid: true, defaultPassword: true, project });
  });

  it('falls back to the folder name when config.yaml names no project', async () => {
    write('.codeloop/config.yaml', '');
    const { app } = appOverHttp(true);
    const res = await app.request('/api/session');
    expect((await res.json()).project).toEqual({ name: dir.split('/').at(-1), path: dir });
  });
});

describe('signing in: a plain URL, with no token anywhere, still works for writes once signed in', () => {
  const login = (app: ReturnType<typeof appOverHttp>['app'], user: string, password: string) =>
    app.request('/api/session/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user, password }) });

  it('the default user/password sign in, no local.yaml needed, and set a session cookie', async () => {
    const { app } = appOverHttp(true);
    const res = await login(app, 'owner', 'codeloop');
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('codeloop_session=');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it('a wrong password is refused with 401 and sets no cookie', async () => {
    const { app } = appOverHttp(true);
    const res = await login(app, 'owner', 'not-it');
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('a write with no token header but the session cookie from login succeeds: the plain URL keeps working', async () => {
    lane('build', `  - id: ship\n    done: { cmd: "true" }\n    gate: { name: g, approver: owner }\n`);
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });
    const { app, http } = appOverHttp(true);
    await http.cards.advance('c-001'); // parks the card at the gate; nothing to approve before this
    const loggedIn = await login(app, 'owner', 'codeloop');
    const sid = (loggedIn.headers.get('set-cookie') ?? '').match(/codeloop_session=([^;]+)/)![1];

    const res = await app.request('/api/cards/c-001/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `codeloop_session=${sid}` },
      body: '{}',
    });
    expect(res.status).toBe(200);
    expect(await app.request('/api/session', { headers: { cookie: `codeloop_session=${sid}` } }).then(r => r.json())).toMatchObject({ signedIn: true });
  });

  it('a request with an unknown session cookie is refused, same as a missing token', async () => {
    lane('build', `  - id: ship\n    done: { cmd: "true" }\n    gate: { name: g, approver: owner }\n`);
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });
    const { app } = appOverHttp(true);
    const res = await app.request('/api/cards/c-001/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'codeloop_session=not-a-real-session' },
      body: '{}',
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/missing or wrong token/);
  });

  it('a cross-origin POST with a valid session cookie is still refused: SameSite and the Origin check both cover it', async () => {
    lane('build', `  - id: ship\n    done: { cmd: "true" }\n    gate: { name: g, approver: owner }\n`);
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });
    const { app } = appOverHttp(true);
    const loggedIn = await login(app, 'owner', 'codeloop');
    const sid = (loggedIn.headers.get('set-cookie') ?? '').match(/codeloop_session=([^;]+)/)![1];
    const res = await app.request('/api/cards/c-001/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `codeloop_session=${sid}`, origin: 'https://evil.example' },
      body: '{}',
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/cross-origin/);
  });

  it('logout clears the cookie and the session no longer writes', async () => {
    const { app } = appOverHttp(true);
    const loggedIn = await login(app, 'owner', 'codeloop');
    const sid = (loggedIn.headers.get('set-cookie') ?? '').match(/codeloop_session=([^;]+)/)![1];
    const logout = await app.request('/api/session/logout', { method: 'POST', headers: { 'content-type': 'application/json', cookie: `codeloop_session=${sid}` }, body: '{}' });
    expect(logout.status).toBe(200);
    const after = await app.request('/api/session', { headers: { cookie: `codeloop_session=${sid}` } });
    expect(await after.json()).toMatchObject({ signedIn: false });
  });
});

describe('changing the board password (Settings)', () => {
  it('is refused without the right current password, works with it, and the old password then fails to sign in', async () => {
    const login = (app: ReturnType<typeof appOverHttp>['app'], password: string) =>
      app.request('/api/session/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: 'owner', password }) });
    const { app } = appOverHttp(true);

    const wrong = await app.request('/api/settings/board-auth', { method: 'POST', headers: { 'content-type': 'application/json', 'x-codeloop-token': TOKEN }, body: JSON.stringify({ currentPassword: 'nope', newPassword: 'a-real-password' }) });
    expect(wrong.status).toBe(400);
    expect((await login(app, 'a-real-password')).status).toBe(401);

    const changed = await app.request('/api/settings/board-auth', { method: 'POST', headers: { 'content-type': 'application/json', 'x-codeloop-token': TOKEN }, body: JSON.stringify({ currentPassword: 'codeloop', newPassword: 'a-real-password' }) });
    expect(changed.status).toBe(200);
    expect(await changed.json()).toMatchObject({ user: 'owner', isDefault: false });

    expect((await login(app, 'codeloop')).status).toBe(401);
    expect((await login(app, 'a-real-password')).status).toBe(200);

    const localYaml = readFileSync(join(dir, '.codeloop/local.yaml'), 'utf-8');
    expect(localYaml).toContain('password_hash');
    expect(localYaml).not.toContain('a-real-password'); // the hash is on disk, never the plain password
  });
});

describe('a write route still refuses without the token (security must not regress)', () => {
  it('POST /api/cards/:id/approve 403s with no header and with the wrong one, even on an owner server', async () => {
    lane('build', `  - id: ship\n    done: { cmd: "true" }\n    gate: { name: g, approver: owner }\n`);
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });
    const { app } = appOverHttp(true);

    const noToken = await app.request('/api/cards/c-001/approve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(noToken.status).toBe(403);
    expect((await noToken.json()).error).toMatch(/missing or wrong token/);

    const wrongToken = await app.request('/api/cards/c-001/approve', { method: 'POST', headers: { 'content-type': 'application/json', 'x-codeloop-token': 'nope' }, body: '{}' });
    expect(wrongToken.status).toBe(403);
  });
});

describe('GET /api/next', () => {
  it('empty: no stories at all', async () => {
    lane('build', `  - id: ship\n    done: { cmd: "true" }\n`);
    const { http } = appOverHttp(true);
    expect(await http.next()).toEqual({ kind: 'empty' });
    await http.close();
  });

  it('waiting: a card parked at a gate awaiting the owner, before any question or run', async () => {
    lane('build', `  - id: draft\n    done: { cmd: "true" }\n    gate: { name: copy, approver: owner }\n`);
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });
    const { http } = appOverHttp(true);
    await http.cards.advance('c-001');
    expect(await http.next()).toEqual({ kind: 'waiting', type: 'gate', card: { id: 'c-001', title: 'a' }, gate: 'copy', awaiting: 'owner' });
    await http.close();
  });

  it('waiting: an open question on a card with no gate', async () => {
    lane('build', `  - id: draft\n    done: { cmd: "true" }\n`);
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });
    const { http } = appOverHttp(true);
    await http.questions.ask('c-001', [{ question: 'Which export format?', recommended: 'CSV' }]);
    expect(await http.next()).toEqual({ kind: 'waiting', type: 'question', card: { id: 'c-001', title: 'a' }, n: 1, question: 'Which export format?', recommended: 'CSV' });
    await http.close();
  });

  it('running: an agent run in progress, ahead of any open story', async () => {
    lane('build', `  - id: draft\n    done: { cmd: "true" }\n`);
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });
    mkdirSync(join(dir, AGENT_RUNS_DIR), { recursive: true });
    const startedAt = new Date().toISOString();
    writeFileSync(join(dir, AGENT_RUNS_DIR, 'c-001-draft-1.json'), JSON.stringify({ runId: 'c-001-draft-1', cardId: 'c-001', stage: 'draft', status: 'running', startedAt, logPath: `${AGENT_RUNS_DIR}/c-001-draft-1.log` }));
    const { http } = appOverHttp(true);
    expect(await http.next()).toEqual({ kind: 'running', card: { id: 'c-001', title: 'a' }, stage: 'draft', since: startedAt });
    await http.close();
  });

  it('idle: an open story with no gate, question or run; done/dropped/proposed cards are skipped', async () => {
    lane('build', `  - id: draft\n    done: { cmd: "true" }\n  - id: ship\n    done: { cmd: "true" }\n`);
    createCard(dir, { lane: 'build', title: 'done already', id: 'c-001' });
    const { http } = appOverHttp(true);
    await http.cards.advance('c-001');
    await http.cards.advance('c-001');
    createCard(dir, { lane: 'build', title: 'still open', id: 'c-002' });
    expect(await http.next()).toEqual({ kind: 'idle', card: { id: 'c-002', title: 'still open', band: 'P4' } });
    await http.close();
  });

  it('idle with no card when every story is done, dropped or proposed', async () => {
    lane('build', `  - id: ship\n    done: { cmd: "true" }\n`);
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });
    const { http } = appOverHttp(true);
    await http.cards.advance('c-001');
    expect(await http.next()).toEqual({ kind: 'idle' });
    await http.close();
  });
});
