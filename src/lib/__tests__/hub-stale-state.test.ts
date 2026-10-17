import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { createServer } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';
import { ensureHubRunning } from '../../commands/hub.js';
import { readHubState, writeHubState } from '../hub-state.js';

let home: string;
let started: number | undefined;
const saved = { home: process.env.CODELOOP_HOME, argv1: process.argv[1] };

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'codeloop-hub-stale-'));
  process.env.CODELOOP_HOME = home;
  // `ensureHubRunning` forks `process.argv[1] hub --port <p> --host <h>`. Under vitest that is the
  // vitest binary, so a stand-in hub takes its place: it listens, answers /api/hub/projects, and
  // records itself in hub.json the way `codeloop hub` does.
  const standIn = join(home, 'hub-stand-in.cjs');
  writeFileSync(standIn, `
    const a = process.argv, port = Number(a[a.indexOf('--port') + 1]), host = a[a.indexOf('--host') + 1];
    const fs = require('fs'), path = require('path');
    require('http').createServer((q, r) => r.end('[]')).listen(port, host, () => {
      const dir = path.join(process.env.CODELOOP_HOME, 'state');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'hub.json'), JSON.stringify({ port, host, token: 'fresh', pid: process.pid, startedAt: new Date().toISOString() }));
    });
  `);
  process.argv[1] = standIn;
});
afterEach(() => {
  if (started) try { process.kill(started, 'SIGKILL'); } catch { /* already gone */ }
  started = undefined;
  process.argv[1] = saved.argv1;
  process.env.CODELOOP_HOME = saved.home;
  rmSync(home, { recursive: true, force: true });
});

const closedPort = () =>
  new Promise<number>(resolve => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

describe('a hub.json naming a port nothing listens on', () => {
  it('starts a hub and rewrites the file instead of attaching to the dead port', async () => {
    const port = await closedPort();
    // A live pid (this test) with a closed port: only the port tells the record is stale.
    writeHubState({ port, host: '127.0.0.1', token: 'stale', pid: process.pid, startedAt: '2026-01-01T00:00:00.000Z' });

    const state = await ensureHubRunning(port, '127.0.0.1');
    started = state.pid !== process.pid ? state.pid : undefined;

    expect(state.pid, 'the returned hub is a new process, not the stale record').not.toBe(process.pid);
    expect(readHubState()).toMatchObject({ port, token: 'fresh', pid: state.pid });
    const res = await fetch(`http://127.0.0.1:${port}/api/hub/projects`);
    expect(res.status).toBe(200);
  }, 30_000);
});
