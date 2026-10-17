import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { findCard, readCards } from '../cards.js';
import { createCard } from '../engine.js';
import { closeIndex } from '../index/index.js';
import { readQuestions } from '../interview.js';
import { createMcpServer } from '../mcp.js';
import { createApp } from '../server.js';
import * as services from '../services.js';
import { newSpec } from '../spec.js';

// The owner's decisions (approve, reject, answer, place, close, drop) refuse a caller that is an
// agent: an MCP tool call always, and the board's routes when the server runs inside an agent run.

let dir: string;
const saved = { run: process.env.CODELOOP_AGENT_RUN, role: process.env.CODELOOP_ROLE };

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-owner-')));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/config.yaml'), 'project:\n  name: demo\n');
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: spec\n    done: { cmd: "true" }\n    gate: { name: spec, approver: owner }\n  - id: build\n    done: { cmd: "false" }\n');
  createCard(dir, { lane: 'build', title: 'Fix c-001', id: 'c-001', fields: { size: 'S' } });
  newSpec(dir, 'c-001');
  services.advance(dir, 'c-001');
  services.ask(dir, 'c-001', [{ question: 'Which store?', recommended: 'The file one' }], 'agent');
  delete process.env.CODELOOP_ROLE;
  process.env.CODELOOP_AGENT_RUN = 'fake';
});

afterEach(() => {
  for (const [k, v] of [['CODELOOP_AGENT_RUN', saved.run], ['CODELOOP_ROLE', saved.role]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  closeIndex(dir);
  rmSync(dir, { recursive: true, force: true });
});

describe('owner-only tools and routes', () => {
  it('refuse an agent: the MCP answer, approve and reject tools, and the board routes inside an agent run', async () => {
    expect(findCard(readCards(dir).cards, 'c-001')).toMatchObject({ stage: 'spec', gate: 'spec', awaiting: 'owner' });

    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1' });
    await Promise.all([createMcpServer(dir).connect(a), client.connect(b)]);
    const call = async (name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    for (const [name, args] of [['answer', { id: 'c-001', n: 1, accept: true }], ['approve', { id: 'c-001' }], ['reject', { id: 'c-001', note: 'no' }]] as const) {
      const res = await call(name, args);
      expect(res.isError, `${name}: ${res.content[0].text}`).toBe(true);
      expect(res.content[0].text).toMatch(/owner/);
    }
    await client.close();
    expect(readQuestions(dir, findCard(readCards(dir).cards, 'c-001'))[0].answer ?? '').toBe('');

    const { app } = createApp(dir, undefined, { token: 't', owner: true });
    const post = (path: string, body: unknown = {}) => app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-codeloop-token': 't' }, body: JSON.stringify(body) });
    for (const [path, body] of [
      ['/api/cards/c-001/questions/1/answer', { accept: true }],
      ['/api/cards/c-001/questions/accept-all', {}],
      ['/api/cards/c-001/approve', {}],
      ['/api/cards/c-001/reject', { note: 'no' }],
      ['/api/cards/c-001/place', { stage: 'build' }],
      ['/api/cards/c-001/close', { outcome: 'dropped' }],
    ] as const) {
      expect((await post(path, body)).status, path).toBe(403);
    }
    expect(findCard(readCards(dir).cards, 'c-001')).toMatchObject({ stage: 'spec', gate: 'spec' });
    expect(readQuestions(dir, findCard(readCards(dir).cards, 'c-001'))[0].answer ?? '').toBe('');
  });
});
