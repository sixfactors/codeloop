import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createApp } from '../server.js';

const LANE = 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: spec\n    done: { cmd: "true" }\n    gate: { name: spec, approver: owner }\n  - id: build\n    done: { cmd: "false" }\n';
const at = '2026-10-15T10:00:00.000Z';
const card = (id: string, stage: string) => ({ id, title: `Story ${id}`, lane: 'build', laneVersion: 1, stage, retries: {}, evidence: [], events: [{ at, actor: 'owner', human: true, action: 'create', stage }], createdAt: at, updatedAt: at });

describe('story control routes', () => {
  let tmpDir: string;
  const make = (owner: boolean) => {
    const { app } = createApp(tmpDir, undefined, { token: 't', owner });
    return (path: string, method: string, body: unknown) => app.request(path, { method, headers: { 'Content-Type': 'application/json', 'x-codeloop-token': 't' }, body: JSON.stringify(body) });
  };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'codeloop-control-'));
    mkdirSync(join(tmpDir, '.codeloop/lanes'), { recursive: true });
    writeFileSync(join(tmpDir, '.codeloop/config.yaml'), 'project:\n  name: demo\n');
    writeFileSync(join(tmpDir, '.codeloop/lanes/build.yaml'), LANE);
    writeFileSync(join(tmpDir, '.codeloop/cards.json'), JSON.stringify({ version: 1, cards: [card('c-083', 'done'), card('c-090', 'build')] }));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reopens a done story to the backlog and edits a title, as the owner', async () => {
    const call = make(true);
    const reopened = await call('/api/cards/c-083/reopen', 'POST', { to: 'backlog', note: 'not finished' });
    expect(reopened.status).toBe(200);
    expect(((await reopened.json()) as { card: { stage: string } }).card.stage).toBe('proposed');
    const edited = await call('/api/cards/c-090', 'PATCH', { title: 'A clearer title' });
    expect(edited.status).toBe(200);
    expect(((await edited.json()) as { card: { title: string } }).card.title).toBe('A clearer title');
  });

  it('answers 409 when the story forbids the change, and 403 on a read-only board', async () => {
    const call = make(true);
    // Back past the passed spec gate with no note.
    expect((await call('/api/cards/c-090/move', 'POST', { stage: 'spec' })).status).toBe(409);
    // Reopening a story that is not done or dropped.
    expect((await call('/api/cards/c-090/reopen', 'POST', {})).status).toBe(409);
    expect((await make(false)('/api/cards/c-083/reopen', 'POST', { to: 'backlog' })).status).toBe(403);
  });
});
