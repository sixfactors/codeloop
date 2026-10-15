import { spawn, type ChildProcess } from 'child_process';
import { createServer } from 'net';
import { afterEach, describe, expect, it } from 'vitest';
import { awaitHubStart } from '../../commands/hub.js';
import type { HubState } from '../hub-state.js';

let child: ChildProcess | undefined;
afterEach(() => child?.kill('SIGKILL'));

const freePort = () =>
  new Promise<number>(resolve => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

/** A stand-in hub: the socket opens at once, /api/hub/projects answers 503 until `warmMs` has passed, as the hub does while its workspace loads. */
async function warmingHub(port: number, warmMs: number): Promise<HubState> {
  const code = `const t=Date.now();require('http').createServer((q,r)=>{r.statusCode=Date.now()-t<${warmMs}?503:200;r.end('[]')}).listen(${port},'127.0.0.1',()=>console.log('up'));`;
  child = spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise<void>(r => child!.stdout!.once('data', () => r()));
  return { port, host: '127.0.0.1', pid: child.pid!, token: 't', startedAt: '' };
}

describe('waiting for a restarted hub', () => {
  it('reports the listening moment and the first 200 separately', async () => {
    const port = await freePort();
    const state = await warmingHub(port, 2000);
    const lines: string[] = [];
    const got = await awaitHubStart({ pid: state.pid, port, host: state.host, readState: () => state, pollMs: 100, log: l => lines.push(l) });
    expect(got.listeningMs).toBeLessThan(1000);
    expect(got.readyMs).toBeGreaterThanOrEqual(1800);
    expect(lines.map(l => l.trim())).toEqual([expect.stringMatching(/^hub listening on port \d+ after 0\.\d s$/), expect.stringMatching(/^hub answering 200 after 2\.\d s$/)]);
  });

  it('a listening socket counts as started when the 200 has not come by the deadline', async () => {
    const port = await freePort();
    const state = await warmingHub(port, 60_000);
    const got = await awaitHubStart({ pid: state.pid, port, host: state.host, readState: () => state, pollMs: 100, timeoutMs: 1000 });
    expect(got.state.pid).toBe(state.pid);
    expect(got.readyMs).toBeUndefined();
  });

  it('fails when the process dies before listening', async () => {
    const port = await freePort();
    const dead = spawn(process.execPath, ['-e', '0']);
    await new Promise(r => dead.once('exit', r));
    await expect(awaitHubStart({ pid: dead.pid!, port, host: '127.0.0.1', readState: () => undefined, pollMs: 50, timeoutMs: 2000 })).rejects.toThrow(/did not start/);
  });
});
