import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { runCli } from '../../__tests__/cli.js';

const CLI = resolve(process.env.CODELOOP_TEST_DIST ?? 'dist', 'index.js');
// Scoped away from the real ~/.codeloop, and off the port range this session was told to leave
// alone (4040/4096): everything the hub binds to in this file lives in 4300-4399.
const PORT = 4312;
let home: string;
let a: string;
let b: string;

const run = (args: string[], cwd: string) => runCli([...args], { cwd, encoding: 'utf-8', env: { ...process.env, CODELOOP_HOME: home } });

function project(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `codeloop-hub-cli-${name}-`));
  const out = run(['init', '--full', '--tools', 'claude', '--starter', 'generic', '--yes'], dir);
  if (out.status !== 0) throw new Error(`init failed for ${name}: ${out.stdout}\n${out.stderr}`);
  return dir;
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'codeloop-hub-cli-home-'));
  a = project('a');
  b = project('b');
});

afterEach(() => {
  run(['hub', '--stop'], a);
  rmSync(a, { recursive: true, force: true });
  rmSync(b, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe('codeloop serve joins one hub across projects (CLI, end to end)', () => {
  it('registers each project on init, starts the hub on the first serve, and a second serve reuses it', async () => {
    const list = run(['projects', 'list'], a);
    expect(list.stdout).toContain(nameOf(a));
    expect(list.stdout).toContain(nameOf(b));

    const serveA = run(['serve', '--port', String(PORT)], a);
    expect(serveA.status).toBe(0);
    const idA = serveA.stdout.match(new RegExp(`http://localhost:${PORT}/p/([^/\\s]+)/`))?.[1];
    expect(idA).toBeTruthy();
    expect(serveA.stdout).toContain('joined the hub');

    const hubState = JSON.parse(readFileSync(join(home, 'state/hub.json'), 'utf-8'));
    expect(hubState.port).toBe(PORT);
    const pidBefore = hubState.pid;

    // A second project's serve must reuse the SAME hub (same pid, same port), not start another.
    const serveB = run(['serve', '--port', String(PORT)], b);
    expect(serveB.status).toBe(0);
    const idB = serveB.stdout.match(new RegExp(`http://localhost:${PORT}/p/([^/\\s]+)/`))?.[1];
    expect(idB).toBeTruthy();
    expect(idB).not.toBe(idA);
    const hubStateAfter = JSON.parse(readFileSync(join(home, 'state/hub.json'), 'utf-8'));
    expect(hubStateAfter.pid).toBe(pidBefore);

    // The hub is a live server by now: each project answers its own cards at its own path, over
    // the one port, with no token (a GET needs none).
    const cardsA = await fetch(`http://127.0.0.1:${PORT}/api/p/${idA}/cards`);
    const cardsB = await fetch(`http://127.0.0.1:${PORT}/api/p/${idB}/cards`);
    expect(cardsA.status).toBe(200);
    expect(cardsB.status).toBe(200);
    const unknown = await fetch(`http://127.0.0.1:${PORT}/api/p/not-a-project/cards`);
    expect(unknown.status).toBe(404);
  });
});

function nameOf(dir: string): string {
  return dir.split('/').pop()!;
}
