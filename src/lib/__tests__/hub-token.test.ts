import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHubApp } from '../hub.js';
import { loadHubSecrets } from '../hub-state.js';

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'codeloop-hub-token-'));
  process.env.CODELOOP_HOME = home;
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const login = (app: ReturnType<typeof createHubApp>['app']) =>
  app.request('/api/hub/session/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: 'owner', password: 'codeloop' }) });
const session = (app: ReturnType<typeof createHubApp>['app'], cookie: string) =>
  app.request('/api/hub/session', { headers: { cookie } }).then(r => r.json() as Promise<{ signedIn: boolean }>);

describe('hub token and sessions across restarts', () => {
  it('a second start reuses the token the first wrote; fresh rotates it', () => {
    const first = loadHubSecrets();
    expect(loadHubSecrets().token).toBe(first.token);
    expect(loadHubSecrets({ fresh: true }).token).not.toBe(first.token);
    expect(statSync(join(home, 'state', 'hub-secrets.json')).mode & 0o777).toBe(0o600);
  });

  it('a session issued before a restart is accepted after it, and rejected after a fresh token', async () => {
    const before = createHubApp(loadHubSecrets());
    const cookie = (await login(before.app)).headers.get('set-cookie')!.split(';')[0];
    await before.close();

    const after = createHubApp(loadHubSecrets());
    expect((await session(after.app, cookie)).signedIn).toBe(true);
    await after.close();

    const rotated = createHubApp(loadHubSecrets({ fresh: true }));
    expect((await session(rotated.app, cookie)).signedIn).toBe(false);
    await rotated.close();
  });
});
