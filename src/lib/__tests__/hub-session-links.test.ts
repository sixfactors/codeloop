import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHubApp } from '../hub.js';
import { hubUrl } from '../hub-state.js';

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'codeloop-hub-links-'));
  process.env.CODELOOP_HOME = home;
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

/**
 * A browser's cookie jar, reduced to the two rules this story depends on: a cookie belongs to the
 * hostname that set it (127.0.0.1 and localhost are different hosts), and it ignores the port, so a
 * later cookie with the same name on the same hostname replaces the earlier one.
 */
function cookieJar() {
  const byHost = new Map<string, Map<string, string>>();
  return {
    store(url: string, res: Response) {
      const host = new URL(url).hostname;
      const bucket = byHost.get(host) ?? new Map<string, string>();
      for (const line of res.headers.getSetCookie()) {
        const [pair] = line.split(';');
        const eq = pair.indexOf('=');
        bucket.set(pair.slice(0, eq), pair.slice(eq + 1));
      }
      byHost.set(host, bucket);
    },
    header(url: string) {
      const bucket = byHost.get(new URL(url).hostname);
      return bucket ? [...bucket].map(([k, v]) => `${k}=${v}`).join('; ') : '';
    },
  };
}

type Hub = ReturnType<typeof createHubApp>;
const login = async (hub: Hub, base: string, jar: ReturnType<typeof cookieJar>) => {
  const url = `${base}/api/hub/session/login`;
  const res = await hub.app.request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ user: 'owner', password: 'codeloop' }) });
  expect(res.status).toBe(200);
  jar.store(url, res);
  return res;
};
const signedIn = async (hub: Hub, base: string, jar: ReturnType<typeof cookieJar>) => {
  const url = `${base}/api/hub/session`;
  const res = await hub.app.request(url, { headers: { cookie: jar.header(url) } });
  return ((await res.json()) as { signedIn: boolean }).signedIn;
};

describe('the hub keeps a browser signed in whichever link it opens', () => {
  it('signed in on localhost, a link codeloop prints is still signed in', async () => {
    const hub = createHubApp({ port: 4050 });
    const jar = cookieJar();
    await login(hub, 'http://localhost:4050', jar);
    const printed = hubUrl({ host: '127.0.0.1', port: 4050 });
    expect(await signedIn(hub, printed, jar)).toBe(true);
    await hub.close();
  });

  it('signing in to a second hub on another port does not sign out the first', async () => {
    const first = createHubApp({ port: 4050 });
    const second = createHubApp({ port: 4051 });
    const jar = cookieJar();
    await login(first, 'http://localhost:4050', jar);
    await login(second, 'http://localhost:4051', jar);
    expect(await signedIn(first, 'http://localhost:4050', jar)).toBe(true);
    expect(await signedIn(second, 'http://localhost:4051', jar)).toBe(true);
    await first.close();
    await second.close();
  });

  it('a browser signed in before the upgrade keeps its session, and signing out clears both names', async () => {
    const secret = 'a'.repeat(64);
    const before = createHubApp({ sessionSecret: secret });
    const jar = cookieJar();
    await login(before, 'http://localhost:4050', jar);
    await before.close();

    const after = createHubApp({ sessionSecret: secret, port: 4050 });
    expect(await signedIn(after, 'http://localhost:4050', jar)).toBe(true);
    const out = await after.app.request('http://localhost:4050/api/hub/session/logout', { method: 'POST', headers: { cookie: jar.header('http://localhost:4050') } });
    const cleared = out.headers.getSetCookie().map(line => line.split('=')[0]);
    expect(cleared).toEqual(expect.arrayContaining(['codeloop_hub_session', 'codeloop_hub_session_4050']));
    await after.close();
  });
});

describe('the shell while the session check is in flight', () => {
  it('shows a neutral label, not Read only, until the session has loaded', async () => {
    const { sessionLabel } = await import('../../../workspace/lib/session-label.js');
    expect(sessionLabel({ canWrite: false, isLoading: true })).toBe('Checking sign-in');
    expect(sessionLabel({ canWrite: true, isLoading: true })).toBe('Checking sign-in');
    expect(sessionLabel({ canWrite: false, isLoading: false })).toBe('Read only');
    expect(sessionLabel({ canWrite: true, isLoading: false })).toBe('Owner');
  });
});
