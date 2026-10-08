import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { advanceCard, approveCard, createCard } from '../engine.js';
import { readCards } from '../cards.js';
import { closeIndex } from '../index/index.js';
import { migrateFeatures } from '../migrate-features.js';
import { createApp } from '../server.js';
import { buildInbox } from '../inbox.js';
import { createLocalClient } from '../../sdk/local.js';

let dir: string;

/**
 * One initiative, one epic, three features: `fast` scores 8·9·10÷2 = 360, `slow` 2·2·5÷4 = 5,
 * `unscored` carries no rice. A lane whose first stage parks at an owner gate and whose second at a
 * reviewer gate, so the inbox can hold cards only one role can approve.
 */
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-roadmap-')));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  mkdirSync(join(dir, '.codeloop/wiki/initiatives'), { recursive: true });
  mkdirSync(join(dir, '.codeloop/wiki/epics'), { recursive: true });
  mkdirSync(join(dir, '.codeloop/wiki/features'), { recursive: true });
  mkdirSync(join(dir, '.codeloop/migrations'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/config.yaml'), 'project:\n  name: demo\n');
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), `id: build
version: 1
metric: { name: m, source: cards }
stages:
  - id: draft
    done: { cmd: "true" }
    gate: { name: spec, approver: owner }
  - id: review
    done: { cmd: "true" }
    gate: { name: pr, approver: reviewer }
  - id: ship
    done: { cmd: "true" }
`);
  writeFileSync(join(dir, '.codeloop/wiki/initiatives/speed.md'), '---\ntitle: Speed\nstatus: active\n---\nWe believe speed.\n');
  writeFileSync(join(dir, '.codeloop/wiki/epics/engine.md'), '---\ntitle: Engine\ninitiative: speed\nstatus: active\ngoal: by December\n---\nThe engine.\n');
  writeFileSync(join(dir, '.codeloop/wiki/features/fast.md'), '---\ntitle: Fast\ninitiative: speed\nepic: engine\nrice: { reach: 8, impact: 9, confidence: 10, effort: 2 }\n---\nFast.\n');
  writeFileSync(join(dir, '.codeloop/wiki/features/slow.md'), '---\ntitle: Slow\ninitiative: speed\nepic: engine\nrice: { reach: 2, impact: 2, confidence: 5, effort: 4 }\n---\nSlow.\n');
  writeFileSync(join(dir, '.codeloop/wiki/features/unscored.md'), '---\ntitle: Unscored\ninitiative: speed\n---\nNo rice yet.\n');
});

afterEach(async () => {
  await closeIndex(dir);
  rmSync(dir, { recursive: true, force: true });
});

const ids = (cards: { id: string }[]) => cards.map(c => c.id);
const get = async (path: string) => {
  const { app } = createApp(dir);
  const res = await app.request(path);
  return { status: res.status, body: await res.json() };
};

describe('feature scores and bands', () => {
  it('a feature without rice has no score and bands P4; the formula lands on the known value', async () => {
    const { body } = await get('/api/features');
    const byId = Object.fromEntries(body.features.map((f: { id: string }) => [f.id, f]));
    expect(byId.unscored.score).toBeUndefined();
    expect(byId.unscored.band).toBe('P4');
    expect(byId.fast).toMatchObject({ score: 360, band: 'P1' });
    expect(byId.slow).toMatchObject({ score: 5, band: 'P3' });
  });

  it('a card inherits band, score and the chain from its feature; a card without one keeps its text and is P4', async () => {
    createCard(dir, { lane: 'build', title: 'Fast one', id: 'c-1', fields: { feature: 'fast', initiative: 'typed by hand' } });
    createCard(dir, { lane: 'build', title: 'Loose one', id: 'c-2', fields: { initiative: 'typed by hand' } });
    createCard(dir, { lane: 'build', title: 'Own effort', id: 'c-3', fields: { feature: 'fast', effort: 4 } });
    const { body } = await get('/api/cards?facets=1');
    const [c1, c2, c3] = body.cards;
    expect(c1).toMatchObject({ band: 'P1', score: 360, initiative: 'speed', epic: 'engine', feature: 'fast' });
    expect(c2).toMatchObject({ band: 'P4', initiative: 'typed by hand' });
    expect(c2.score).toBeUndefined();
    // The card's own effort replaces the feature's in its score; the band stays the feature's.
    expect(c3).toMatchObject({ band: 'P1', score: 180 });
    expect(body.facets.band).toEqual([{ value: 'P1', count: 2 }, { value: 'P4', count: 1 }]);
    expect(body.facets.feature).toEqual([{ value: 'fast', count: 2 }]);
    expect(body.facets.epic).toEqual([{ value: 'engine', count: 2 }]);
    expect(ids((await get('/api/cards?band=P4')).body.cards)).toEqual(['c-2']);
    expect(ids((await get('/api/cards?epic=engine')).body.cards)).toEqual(['c-1', 'c-3']);
  });
});

describe('inbox order and needsMe', () => {
  beforeEach(() => {
    // Parked in this order: slow (oldest), then two fast ones, then an unscored one.
    const at = (h: number) => new Date(`2026-01-01T0${h}:00:00.000Z`);
    createCard(dir, { lane: 'build', title: 'Slow one', id: 'c-1', fields: { feature: 'slow' }, now: at(1) });
    createCard(dir, { lane: 'build', title: 'Fast old', id: 'c-2', fields: { feature: 'fast' }, now: at(2) });
    createCard(dir, { lane: 'build', title: 'Fast new', id: 'c-3', fields: { feature: 'fast' }, now: at(3) });
    createCard(dir, { lane: 'build', title: 'No feature', id: 'c-4', now: at(4) });
    for (const [n, id] of ['c-1', 'c-2', 'c-3', 'c-4'].entries()) advanceCard(dir, id, { now: at(n + 1) });
  });

  it('the inbox lists parked cards by score, then the oldest parked first, unscored last', async () => {
    const { body } = await get('/api/inbox');
    expect(ids(body.needsYou.cards)).toEqual(['c-2', 'c-3', 'c-1', 'c-4']);
    expect(body.needsYou.cards[0]).toMatchObject({ band: 'P1', score: 360 });
    expect(ids((await get('/api/inbox?sort=age')).body.needsYou.cards)).toEqual(['c-1', 'c-2', 'c-3', 'c-4']);
    expect(ids((await get('/api/inbox?feature=slow')).body.needsYou.cards)).toEqual(['c-1']);
    // The report `codeloop inbox` prints orders the same way, from the files alone.
    expect(buildInbox(dir).needs_you.map(c => [c.id, c.band, c.score])).toEqual([['c-2', 'P1', 360], ['c-3', 'P1', 360], ['c-1', 'P3', 5], ['c-4', 'P4', undefined]]);
    expect(ids((await get('/api/cards?gate=waiting&sort=score')).body.cards)).toEqual(['c-2', 'c-3', 'c-1', 'c-4']);
  });

  it('needsMe=1 keeps the gates the caller can approve and drops the rest', async () => {
    // c-2 passes the owner gate and parks at the reviewer one.
    approveCard(dir, 'c-2', 'owner');
    advanceCard(dir, 'c-2');
    advanceCard(dir, 'c-2');
    expect(readCards(dir).cards.find(c => c.id === 'c-2')).toMatchObject({ stage: 'review', gate: 'pr', awaiting: 'reviewer' });
    const asOwner = createApp(dir, undefined, { owner: true }).app;
    const owner = await (await asOwner.request('/api/inbox?needsMe=1')).json();
    expect(ids(owner.needsYou.cards)).toEqual(['c-3', 'c-1', 'c-4']);
    const ownerCards = await (await asOwner.request('/api/cards?needsMe=1')).json();
    expect(ids(ownerCards.cards)).toEqual(['c-1', 'c-3', 'c-4']);
    // Through the local transport the role is the caller's: a reviewer sees only c-2.
    const reviewer = createLocalClient(dir, { role: 'reviewer' });
    expect(ids((await reviewer.inbox.get({ needsMe: true })).needsYou.cards)).toEqual(['c-2']);
    expect(ids((await reviewer.cards.list({ needsMe: true })).cards)).toEqual(['c-2']);
    await reviewer.close();
  });
});

describe('trees', () => {
  it('nests initiative → epics → features → stories with done/total, and 404s an unknown initiative', async () => {
    createCard(dir, { lane: 'build', title: 'Fast one', id: 'c-1', fields: { feature: 'fast' } });
    createCard(dir, { lane: 'build', title: 'Fast done', id: 'c-2', fields: { feature: 'fast' } });
    createCard(dir, { lane: 'build', title: 'Loose', id: 'c-3', fields: { feature: 'unscored' } });
    for (let i = 0; i < 8; i++) {
      const c = readCards(dir).cards.find(x => x.id === 'c-2')!;
      if (c.stage === 'done') break;
      if (c.gate) approveCard(dir, 'c-2', c.awaiting as 'owner' | 'reviewer');
      else advanceCard(dir, 'c-2');
    }
    expect(readCards(dir).cards.find(c => c.id === 'c-2')?.stage).toBe('done');

    const { status, body } = await get('/api/initiatives/speed/tree');
    expect(status).toBe(200);
    const { initiative } = body;
    expect(initiative).toMatchObject({ id: 'speed', title: 'Speed', score: 365 });
    expect(initiative.epics.map((e: { id: string; score: number }) => [e.id, e.score])).toEqual([['engine', 365]]);
    const [engine] = initiative.epics;
    expect(engine.features.map((f: { id: string }) => f.id)).toEqual(['fast', 'slow']);
    const fast = engine.features[0];
    expect(fast).toMatchObject({ band: 'P1', score: 360, done: 1, total: 2 });
    expect(fast.stories.map((s: { id: string; stage: string }) => [s.id, s.stage])).toEqual([['c-1', 'draft'], ['c-2', 'done']]);
    expect(Object.keys(fast.stories[0]).sort()).toEqual(['band', 'id', 'score', 'stage', 'title']);
    // A feature with no epic hangs on the initiative.
    expect(initiative.features.map((f: { id: string; total: number }) => [f.id, f.total])).toEqual([['unscored', 1]]);

    expect((await get('/api/epics/engine/tree')).body.epic.features.map((f: { id: string }) => f.id)).toEqual(['fast', 'slow']);
    expect((await get('/api/features/fast')).body.feature).toMatchObject({ done: 1, total: 2 });
    expect((await get('/api/initiatives/nope/tree')).status).toBe(404);
    expect((await get('/api/initiatives')).body.initiatives[0].score).toBe(365);
  });
});

describe('card migrate-features', () => {
  it('refuses an unknown feature slug and writes nothing; a good mapping sets feature and initiative', () => {
    createCard(dir, { lane: 'build', title: 'One', id: 'c-1', fields: { initiative: 'typed by hand' } });
    createCard(dir, { lane: 'build', title: 'Two', id: 'c-2' });
    writeFileSync(join(dir, '.codeloop/migrations/features.yaml'), 'c-1: fast\nc-2: nope\n');
    expect(() => migrateFeatures(dir)).toThrow('c-2: feature "nope" has no page');
    expect(readCards(dir).cards.map(c => c.feature)).toEqual([undefined, undefined]);

    writeFileSync(join(dir, '.codeloop/migrations/features.yaml'), 'c-1: fast\nc-2: slow\n');
    expect(migrateFeatures(dir)).toEqual({ changed: ['c-1', 'c-2'], mapping: '.codeloop/migrations/features.yaml' });
    expect(readCards(dir).cards.map(c => [c.feature, c.initiative])).toEqual([['fast', 'speed'], ['slow', 'speed']]);
    expect(migrateFeatures(dir).changed).toEqual([]);
  });
});

describe('feature and epic writes through the SDK', () => {
  it('feature new refuses a missing initiative or epic, and feature score lands a readable score', async () => {
    const client = createLocalClient(dir, { role: 'owner' });
    await expect(client.features.new({ id: 'x', title: 'X', initiative: 'nope' })).rejects.toThrow('initiative "nope" has no page');
    await expect(client.features.new({ id: 'x', title: 'X', initiative: 'speed', epic: 'nope' })).rejects.toThrow('epic "nope" has no page');
    await expect(client.epics.new({ id: 'engine', title: 'Again', initiative: 'speed' })).rejects.toThrow('already exists');
    const made = await client.features.new({ id: 'x', title: 'X', initiative: 'speed', epic: 'engine' });
    expect(made.rice).toBeUndefined();
    await client.features.score('x', { reach: 10, impact: 10, confidence: 10, effort: 1 });
    expect((await client.features.get('x'))).toMatchObject({ score: 1000, band: 'P1', total: 0 });
    await expect(client.features.score('x', { reach: 0, impact: 1, confidence: 1, effort: 1 })).rejects.toThrow('rice.reach');
    await client.close();
  });
});
