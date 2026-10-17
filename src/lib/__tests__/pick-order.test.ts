import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createLocalClient } from '../../sdk/local.js';
import { findCard, readCards } from '../cards.js';
import { createCard } from '../engine.js';
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

afterEach(() => rmSync(dir, { recursive: true, force: true }));

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

  it('an agent can flag a critical bug, on an existing story or a new one, and bug stories come first; either role clears it', async () => {
    const agent = createLocalClient(dir);
    await agent.cards.edit('c-001', { bug: true }, { as: 'agent' });
    const { card: made } = await agent.cards.new({ lane: 'build', title: 'Fix the login crash', id: 'c-005', size: 'S', bug: true }, { as: 'agent' });
    expect(made.bug).toBe(true);
    // Both bugs lead, ordered between themselves by the same rule (c-001 is RICE P3, c-005 is P4).
    expect(planRun(dir, null).map(l => l.split(':')[0])).toEqual(['c-001', 'c-005', ...EXPECTED.filter(id => id !== 'c-001')]);
    await agent.cards.edit('c-001', { bug: false }, { as: 'agent' });
    await agent.cards.edit('c-005', { bug: false }, { as: 'owner' });
    expect(findCard(readCards(dir).cards, 'c-001').bug).toBeUndefined();
    expect(planRun(dir, null).map(l => l.split(':')[0])).toEqual([...EXPECTED, 'c-005']);
  });
});
