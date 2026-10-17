import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createLocalClient } from '../../sdk/local.js';
import { findCard, readCards } from '../cards.js';
import { createCard, promoteQueued, queueCard } from '../engine.js';
import { closeIndex } from '../index/index.js';
import { createApp } from '../server.js';
import { createMcpServer } from '../mcp.js';
import { ORCH_DIR, waitingOrchCards } from '../orch.js';
import { formBatch } from '../orch-isolation.js';
import { planRun } from '../run.js';
import { newSpec } from '../spec.js';

// Every pick orders by the same rule: an explicit card priority wins over the feature's RICE band,
// the RICE score breaks ties within a band, and age breaks what is left.

let dir: string;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-pick-')));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  mkdirSync(join(dir, '.codeloop/wiki/features'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/config.yaml'), 'project:\n  name: demo\n');
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: build\n    done: { cmd: "false" }\n');
  // fast bands P1 and slow bands P3 (two scored features); a card with no feature is P4.
  writeFileSync(join(dir, '.codeloop/wiki/features/fast.md'), '---\ntitle: Fast\ninitiative: speed\nrice: { reach: 8, impact: 9, confidence: 10, effort: 2 }\n---\nFast.\n');
  writeFileSync(join(dir, '.codeloop/wiki/features/slow.md'), '---\ntitle: Slow\ninitiative: speed\nrice: { reach: 2, impact: 2, confidence: 5, effort: 4 }\n---\nSlow.\n');
  // Created oldest first: the old age-only order is c-001, c-002, c-003, c-004.
  const stories = [
    { id: 'c-001', fields: { feature: 'slow' } },
    { id: 'c-002', fields: { feature: 'fast', priority: 'P2' } },
    { id: 'c-003', fields: { priority: 'P1' } },
    { id: 'c-004', fields: { feature: 'fast' } },
  ];
  stories.forEach((s, i) => {
    createCard(dir, { lane: 'build', title: `Fix ${s.id}`, id: s.id, now: new Date(Date.UTC(2026, 0, 1 + i)), fields: { size: 'S', ...s.fields } });
    const { dir: spec } = newSpec(dir, s.id);
    writeFileSync(join(dir, spec, 'plan.md'), `# plan\n\n## Files\n\n- src/${s.id}.txt\n`);
    mkdirSync(join(dir, ORCH_DIR), { recursive: true });
    writeFileSync(join(dir, ORCH_DIR, `${s.id}.json`), JSON.stringify({ card: s.id, turns: [{ outcome: 'queued' }] }));
  });
});

afterEach(() => {
  closeIndex(dir);
  rmSync(dir, { recursive: true, force: true });
});

// c-004 is RICE P1 with the top score; c-003 is P1 by hand and unscored; c-002 is a P1 feature set
// to P2 by hand; c-001 is RICE P3.
const EXPECTED = ['c-004', 'c-003', 'c-002', 'c-001'];

describe('pick order', () => {
  it('the scheduler, batch forming, the orchestrator retry and next_up all take priority, then score, then age', async () => {
    expect(planRun(dir, null).map(l => l.split(':')[0])).toEqual(EXPECTED);
    expect(formBatch(dir).cards).toEqual(EXPECTED);
    expect(waitingOrchCards(dir)).toEqual(EXPECTED);

    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1' });
    await Promise.all([createMcpServer(dir).connect(a), client.connect(b)]);
    const res = (await client.callTool({ name: 'next_up', arguments: {} })) as { content: { text: string }[] };
    expect((JSON.parse(res.content[0].text) as { id: string }[]).map(c => c.id)).toEqual(EXPECTED);
    await client.close();
  });

  it('only the owner flag moves a story to the front; an agent\'s bug is a report the owner confirms', async () => {
    const agent = createLocalClient(dir);
    const owner = createLocalClient(dir);
    const order = () => planRun(dir, null).map(l => l.split(':')[0]);
    // An agent flagging an existing story records the report and leaves the order alone.
    const reported = await agent.cards.edit('c-001', { bug: true }, { as: 'agent' });
    expect(reported.bug).toBeUndefined();
    expect(reported.bug_reported_by).toBe('agent');
    expect(order()).toEqual(EXPECTED);
    // An agent's new bug waits at the owner's proposal gate, marked, and no pick takes it.
    const { card: made } = await agent.cards.new({ lane: 'build', title: 'Fix the login crash', id: 'c-005', size: 'S', bug: true }, { as: 'agent' });
    expect(made).toMatchObject({ stage: 'proposed', gate: 'proposal', awaiting: 'owner', bug_reported_by: 'agent' });
    expect(made.bug).toBeUndefined();
    expect(made.events.at(-1)?.note).toBe('reported as critical by agent');
    expect(order()).toEqual(EXPECTED);
    // The owner's approval confirms it: the flag is set and every pick takes it first.
    await owner.cards.approve('c-005', { as: 'owner' });
    expect(findCard(readCards(dir).cards, 'c-005')).toMatchObject({ stage: 'build', bug: true });
    expect(order()).toEqual(['c-005', ...EXPECTED]);
    // An agent cannot clear an owner-set flag; the owner can.
    await expect(agent.cards.edit('c-005', { bug: false }, { as: 'agent' })).rejects.toThrow(/owner/);
    expect(findCard(readCards(dir).cards, 'c-005').bug).toBe(true);
    await owner.cards.edit('c-005', { bug: false }, { as: 'owner' });
    expect(order()).toEqual([...EXPECTED, 'c-005']);
    // The owner sets the flag directly.
    await owner.cards.edit('c-001', { bug: true }, { as: 'owner' });
    expect(findCard(readCards(dir).cards, 'c-001').bug_reported_by).toBeUndefined();
    expect(order()[0]).toBe('c-001');
  });

  it('the CLI, MCP propose and HTTP POST /cards turn an agent\'s --bug into a waiting report', async () => {
    const { cardCommand } = await import('../../commands/card.js');
    const env = { dir: process.env.CODELOOP_PROJECT_DIR, run: process.env.CODELOOP_AGENT_RUN };
    process.env.CODELOOP_PROJECT_DIR = dir;
    process.env.CODELOOP_AGENT_RUN = 'builder';
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await cardCommand.parseAsync(['new', 'build', 'Fix the logout crash', '--id', 'c-006', '--size', 'S', '--bug'], { from: 'user' });
    } finally {
      log.mockRestore();
      if (env.dir === undefined) delete process.env.CODELOOP_PROJECT_DIR; else process.env.CODELOOP_PROJECT_DIR = env.dir;
      if (env.run === undefined) delete process.env.CODELOOP_AGENT_RUN; else process.env.CODELOOP_AGENT_RUN = env.run;
    }
    expect(findCard(readCards(dir).cards, 'c-006')).toMatchObject({ stage: 'proposed', bug_reported_by: 'builder' });
    expect(findCard(readCards(dir).cards, 'c-006').bug).toBeUndefined();

    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '1' });
    await Promise.all([createMcpServer(dir).connect(a), client.connect(b)]);
    await client.callTool({ name: 'propose', arguments: { lane: 'build', title: 'Fix the signup crash', bug: true } });
    await client.close();
    const viaMcp = readCards(dir).cards.find(c => c.title === 'Fix the signup crash');
    expect(viaMcp).toMatchObject({ stage: 'proposed', bug_reported_by: 'agent' });
    expect(viaMcp?.bug).toBeUndefined();

    const post = (owner: boolean, title: string) =>
      createApp(dir, undefined, { token: 't', owner }).app.request('/api/cards', { method: 'POST', headers: { 'content-type': 'application/json', 'x-codeloop-token': 't' }, body: JSON.stringify({ lane: 'build', title, size: 'S', bug: true }) });
    const res = await post(false, 'Fix the reset crash');
    expect(res.status).toBe(201);
    const viaHttp = readCards(dir).cards.find(c => c.title === 'Fix the reset crash');
    expect(viaHttp).toMatchObject({ stage: 'proposed', bug_reported_by: 'agent' });
    expect(viaHttp?.bug).toBeUndefined();
    expect(planRun(dir, null).map(l => l.split(':')[0])).toEqual(EXPECTED);
    // An owner server sets the flag directly.
    expect((await post(true, 'Fix the export crash')).status).toBe(201);
    expect(readCards(dir).cards.find(c => c.title === 'Fix the export crash')).toMatchObject({ stage: 'build', bug: true });
  });

  it('the board API returns each column already in pick order, with each story\'s priority and bug flag', async () => {
    await createLocalClient(dir).cards.edit('c-001', { bug: true }, { as: 'owner' });
    const { app } = createApp(dir);
    type Story = { id: string; priority?: string; bug?: boolean };
    const board = (await (await app.request('/api/board?lane=build')).json()) as { columns: { stories: Story[] }[]; phases: { cells: Record<string, Story[]> }[] };
    const want = ['c-001', ...EXPECTED.filter(id => id !== 'c-001')];
    const inPhases = board.phases.flatMap(p => Object.values(p.cells).flat());
    expect(inPhases.map(s => s.id)).toEqual(want);
    expect(board.columns.flatMap(c => c.stories).map(s => s.id)).toEqual(want);
    expect(inPhases.find(s => s.id === 'c-001')?.bug).toBe(true);
    expect(inPhases.find(s => s.id === 'c-003')?.priority).toBe('P1');
  });

  it('a freed lane slot goes to the queued P1, not the older queued P2', () => {
    writeFileSync(join(dir, '.codeloop/lanes/solo.yaml'), 'id: solo\nversion: 1\nwip: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: build\n    done: { cmd: "false" }\n');
    createCard(dir, { lane: 'solo', title: 'Fix c-010', id: 'c-010', fields: { size: 'S' } });
    queueCard(dir, { lane: 'solo', title: 'Fix c-011', id: 'c-011', now: new Date(Date.UTC(2026, 1, 1)), fields: { size: 'S', priority: 'P2' } });
    queueCard(dir, { lane: 'solo', title: 'Fix c-012', id: 'c-012', now: new Date(Date.UTC(2026, 1, 2)), fields: { size: 'S', priority: 'P1' } });
    // c-010 holds the one slot only while an agent works it; with none, the first promotion fills it.
    expect(promoteQueued(dir, { lane: 'solo' }).map(c => c.id)[0]).toBe('c-012');
  });
});
