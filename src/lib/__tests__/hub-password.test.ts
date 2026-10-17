import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHubApp } from '../hub.js';
import { writeHubAuth } from '../hub-auth.js';

let home: string;
const saved = process.env.CODELOOP_HOME;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'codeloop-hub-password-'));
  process.env.CODELOOP_HOME = home;
});
afterEach(() => {
  process.env.CODELOOP_HOME = saved;
  rmSync(home, { recursive: true, force: true });
});

describe('a hub password once set', () => {
  it('replaces the default: the default is refused, the new one signs in, and the hub no longer says default', async () => {
    writeHubAuth({ password: 'x' });
    const { app } = createHubApp();
    const login = (password: string) =>
      app.request('http://localhost/api/hub/session/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: 'owner', password }) });

    expect((await login('codeloop')).status).toBe(401);
    const ok = await login('x');
    expect(ok.status).toBe(200);
    expect(ok.headers.getSetCookie().some(c => c.startsWith('codeloop_hub_session='))).toBe(true);
    const session = (await (await app.request('http://localhost/api/hub/session')).json()) as { defaultPassword: boolean };
    expect(session.defaultPassword).toBe(false);
  });
});
