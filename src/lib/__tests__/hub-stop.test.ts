import { spawn, type ChildProcess } from 'child_process';
import { createServer } from 'net';
import { afterEach, describe, expect, it } from 'vitest';
import { stopHub, waitForPortClosed } from '../../commands/hub.js';

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

/** A stand-in hub: listens, and on SIGTERM keeps the listener open for `lingerMs` before exiting, as a hub finishing requests does. */
async function lingeringHub(port: number, lingerMs: number): Promise<number> {
  const code = `const s=require('net').createServer(c=>c.end());s.listen(${port},'127.0.0.1',()=>console.log('up'));process.on('SIGTERM',()=>setTimeout(()=>process.exit(0),${lingerMs}));`;
  child = spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise<void>(r => child!.stdout!.once('data', () => r()));
  return child.pid!;
}

describe('hub stop and restart', () => {
  it('stopHub returns only after the old listener has closed, so a start on the same port cannot be refused or collide', async () => {
    const port = await freePort();
    const pid = await lingeringHub(port, 700);
    const t0 = Date.now();
    await stopHub({ port, host: '127.0.0.1', pid, token: 't', startedAt: '' });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(600);
    expect(await waitForPortClosed('127.0.0.1', port, 0)).toBe(true);
    // The new hub can bind the port at once.
    await new Promise<void>((resolve, reject) => {
      const s = createServer();
      s.once('error', reject);
      s.listen(port, '127.0.0.1', () => s.close(() => resolve()));
    });
  });

  it('waitForPortClosed gives up and says so when the port stays open', async () => {
    const port = await freePort();
    const s = createServer(c => c.end());
    await new Promise<void>(r => s.listen(port, '127.0.0.1', () => r()));
    expect(await waitForPortClosed('127.0.0.1', port, 300, 50)).toBe(false);
    s.close();
  });
});
