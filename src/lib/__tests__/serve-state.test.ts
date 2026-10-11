import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createServer } from 'http';
import { findProjectRoot, readServeState, removeServeState, serveStateAlive, serveUrl, writeServeState, SERVE_STATE_PATH, type ServeState } from '../serve-state.js';

describe('serve-state', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'codeloop-servestate-'));
    mkdirSync(join(dir, '.codeloop'), { recursive: true });
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('writes and removes serve.json under .codeloop/state, making the folder', () => {
    expect(readServeState(dir)).toBeUndefined();
    const state: ServeState = { port: 4040, host: '127.0.0.1', token: 'abc', pid: process.pid, owner: true, startedAt: new Date().toISOString() };
    writeServeState(dir, state);
    expect(existsSync(join(dir, SERVE_STATE_PATH))).toBe(true);
    expect(readServeState(dir)).toEqual(state);

    removeServeState(dir);
    expect(existsSync(join(dir, SERVE_STATE_PATH))).toBe(false);
    expect(readServeState(dir)).toBeUndefined();
  });

  it('removeServeState on a file that does not exist does not throw', () => {
    expect(() => removeServeState(dir)).not.toThrow();
  });

  it('readServeState returns undefined for a corrupt file instead of throwing', () => {
    writeServeState(dir, { port: 1, host: '127.0.0.1', token: 't', pid: 1, owner: false, startedAt: '' });
    const file = join(dir, SERVE_STATE_PATH);
    writeFileSync(file, '{not json');
    expect(readServeState(dir)).toBeUndefined();
  });

  it('serveUrl carries no token (people sign in on the page) and normalises loopback hosts for display', () => {
    expect(serveUrl({ host: '127.0.0.1', port: 4040 })).toBe('http://127.0.0.1:4040/');
    expect(serveUrl({ host: 'localhost', port: 4040 })).toBe('http://127.0.0.1:4040/');
    expect(serveUrl({ host: '0.0.0.0', port: 4041 })).toBe('http://0.0.0.0:4041/');
  });

  it('serveStateAlive is false for a dead pid without probing the network', async () => {
    const dead: ServeState = { port: 1, host: '127.0.0.1', token: 't', pid: 999_999_999, owner: true, startedAt: '' };
    expect(await serveStateAlive(dead)).toBe(false);
  });

  it('serveStateAlive is true only when the pid is alive AND the port answers; false when the pid is alive but nothing listens', async () => {
    const noServer: ServeState = { port: 1, host: '127.0.0.1', token: 't', pid: process.pid, owner: true, startedAt: '' };
    expect(await serveStateAlive(noServer)).toBe(false);

    const server = createServer((_req, res) => { res.writeHead(200); res.end('ok'); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const live: ServeState = { port, host: '127.0.0.1', token: 't', pid: process.pid, owner: true, startedAt: '' };
    expect(await serveStateAlive(live)).toBe(true);
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it('findProjectRoot walks up from a subfolder to the nearest .codeloop/, and finds nothing above a repo that has none', () => {
    mkdirSync(join(dir, 'a/b/c'), { recursive: true });
    expect(findProjectRoot(join(dir, 'a/b/c'))).toBe(dir);
    expect(findProjectRoot(dir)).toBe(dir);
    const bare = mkdtempSync(join(tmpdir(), 'codeloop-no-project-'));
    expect(findProjectRoot(bare)).toBeUndefined();
    rmSync(bare, { recursive: true, force: true });
  });

});
