import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { advanceCard, createCard } from '../engine.js';
import { closeIndex } from '../index/index.js';
import { createApp } from '../server.js';

let dir: string;

// Five cards in a lane whose first stage has a gate: c-1, c-2 and c-3 are advanced to it and park,
// c-4 is not started, c-5 carries a spec with one question unanswered and one answered.
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-inbox-api-')));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/config.yaml'), 'project:\n  name: demo\n');
  writeFileSync(join(dir, '.codeloop/lanes/market.yaml'), `id: market
version: 1
metric: { name: m, source: cards }
stages:
  - id: draft
    output: out/{id}.md
    done: { cmd: "true" }
    gate: { name: copy, approver: owner }
  - id: ship
    done: { cmd: "true" }
`);
  for (let n = 1; n <= 5; n++) createCard(dir, { lane: 'market', title: `Post ${n}`, id: `c-${n}` });
  for (const id of ['c-1', 'c-2', 'c-3']) advanceCard(dir, id);
  mkdirSync(join(dir, 'specs/005'), { recursive: true });
  writeFileSync(join(dir, 'specs/005/interview.md'), '## Q1 Who reads it?\nrecommended: founders\nanswer: \n\n## Q2 How long?\nrecommended: short\nanswer: short\n');
});

afterEach(async () => {
  await closeIndex(dir);
  rmSync(dir, { recursive: true, force: true });
});

const ids = (cards: { id: string }[]) => cards.map(c => c.id);

describe('inbox-shaped card queries', () => {
  it('gate=waiting returns only the parked cards', async () => {
    const { app } = createApp(dir);
    const body = await (await app.request('/api/cards?gate=waiting')).json();
    expect(ids(body.cards)).toEqual(['c-1', 'c-2', 'c-3']);
    expect(body.total).toBe(3);
    expect(body.cards.every((c: { gate?: string }) => c.gate === 'copy')).toBe(true);
  });

  it('questions=open returns only cards with an unanswered question', async () => {
    const { app } = createApp(dir);
    const body = await (await app.request('/api/cards?questions=open')).json();
    expect(ids(body.cards)).toEqual(['c-5']);
    expect(body.cards[0].openQuestions).toBe(1);
  });

  it('/api/inbox caps each list at the limit and pages needsYou by cursor', async () => {
    const { app } = createApp(dir);
    const first = await (await app.request('/api/inbox?limit=2')).json();
    expect(Object.keys(first).sort()).toEqual(['needsYou', 'perLane', 'questions', 'shipped', 'summary']);
    expect(ids(first.needsYou.cards)).toEqual(['c-1', 'c-2']);
    expect(first.needsYou.total).toBe(3);
    expect(first.needsYou.nextCursor).toBe('c-2');
    expect(first.needsYou.cards[0]).toMatchObject({ read: 'out/c-1.md', last_check: 'passed' });
    expect(first.questions).toMatchObject({ total: 1, nextCursor: null });
    expect(first.questions.cards[0]).toMatchObject({ id: 'c-5', openQuestions: 1, first: 'Who reads it?' });
    expect(first.shipped).toEqual({ cards: [], total: 0, nextCursor: null });
    expect(first.perLane).toEqual([expect.objectContaining({ lane: 'market', active: 2, parked: 3, done: 0 })]);
    expect(first.summary).toBe('0 shipped this week, 3 waiting on you, oldest today');

    const second = await (await app.request(`/api/inbox?limit=2&cursor=${first.needsYou.nextCursor}`)).json();
    expect(ids(second.needsYou.cards)).toEqual(['c-3']);
    expect(second.needsYou.nextCursor).toBeNull();
  });

  it('/api/cards carries the inbox summary but not needs_you unless include=inbox', async () => {
    const { app } = createApp(dir);
    const plain = await (await app.request('/api/cards')).json();
    expect(plain.inbox.summary).toBe('0 shipped this week, 3 waiting on you, oldest today');
    expect(plain.inbox).not.toHaveProperty('needs_you');

    const withInbox = await (await app.request('/api/cards?include=events,inbox')).json();
    expect(ids(withInbox.inbox.needs_you)).toEqual(['c-1', 'c-2', 'c-3']);
    expect(withInbox.cards[0].events.length).toBeGreaterThan(0);
  });
});
