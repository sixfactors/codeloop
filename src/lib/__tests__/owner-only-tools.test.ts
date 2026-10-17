import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { findCard, readCards } from '../cards.js';
import { approveCard, createCard, resolveRole } from '../engine.js';
import { ownerAction } from '../../commands/guard-hooks.js';
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
    // As owner, so the engine's role check would let approve and reject through: only the agent-run guard refuses them.
    process.env.CODELOOP_ROLE = 'owner';

    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1' });
    await Promise.all([createMcpServer(dir).connect(a), client.connect(b)]);
    const call = async (name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    for (const [name, args] of [['answer', { id: 'c-001', n: 1, accept: true }], ['approve', { id: 'c-001' }], ['reject', { id: 'c-001', note: 'no' }]] as const) {
      const res = await call(name, args);
      expect(res.isError, `${name}: ${res.content[0].text}`).toBe(true);
      expect(res.content[0].text).toMatch(/started by `codeloop run --agent`/);
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

describe('an assistant shell, outside an agent run', () => {
  beforeEach(() => {
    delete process.env.CODELOOP_AGENT_RUN;
  });
  afterEach(() => {
    delete process.env.CLAUDE_CODE_SESSION_ID;
  });

  it('acts as agent by default, so an owner verb nobody asked for is refused; --as owner and CODELOOP_ROLE=owner still act as the owner', () => {
    process.env.CLAUDE_CODE_SESSION_ID = 'session-1';
    expect(resolveRole()).toBe('agent');
    expect(() => approveCard(dir, 'c-001', resolveRole())).toThrow(/agent cannot approve it[\s\S]*--as owner/);
    expect(findCard(readCards(dir).cards, 'c-001').gate).toBe('spec');
    expect(resolveRole('owner')).toBe('owner');
    process.env.CODELOOP_ROLE = 'owner';
    expect(resolveRole()).toBe('owner');
    delete process.env.CLAUDE_CODE_SESSION_ID;
    delete process.env.CODELOOP_ROLE;
    expect(resolveRole()).toBe('owner');
  });

  it('the shell guard asks before every owner verb, however the CLI is started, and lets the rest through', () => {
    const asks = [
      'codeloop card place c-1 build',
      'codeloop card park c-1',
      'codeloop card reopen c-1 --to backlog',
      'codeloop card edit c-1 --title "Clearer"',
      'codeloop start c-1 --stage build',
      'codeloop lane promote build-v2',
      'codeloop lane rollback build',
      'node dist/index.js approve c-1',
      "'/opt/codeloop/bin/codeloop' approve c-1",
      'npx @protoboxai/codeloop reject c-1',
      'git status && node /x/dist/index.js card done c-1',
    ];
    for (const command of asks) expect(ownerAction(command), command).not.toBeNull();
    const passes = ['codeloop card show c-1', 'codeloop start c-1', 'codeloop lane list', 'codeloop card edit c-1 --bug', 'codeloop card edit c-1 --bug --as agent', 'node dist/index.js card list', 'codeloop-hook bash'];
    for (const command of passes) expect(ownerAction(command), command).toBeNull();
  });
});
