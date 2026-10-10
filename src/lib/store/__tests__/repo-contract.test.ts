import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createCard } from '../../engine.js';
import { addQuestions } from '../../interview.js';
import { ConflictError, FileDriver, MemoryDriver, openStore, registerDriver, runMigrations, type Epic, type Feature, type Initiative, type CardRecord, type Entity, type Lane, type Repo, type Store, type WikiPage } from '../index.js';

const LANE = `id: build
version: 1
metric: { name: m, source: cards }
stages:
  - id: draft
    done: { cmd: "true" }
`;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-store-'));
  mkdirSync(join(dir, '.codeloop'), { recursive: true });
});

const withBuildLane = () => {
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), LANE);
};

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const drivers: [string, () => Store][] = [
  ['FileDriver', () => new FileDriver(dir)],
  ['MemoryDriver', () => new MemoryDriver()],
];

// One contract, every repo that takes writes, both drivers: the engine moves over repo by repo and
// must find the same behaviour whichever is underneath.
interface Fixture<T extends Entity> {
  repo: (s: Store) => Repo<T>;
  id: (n: number) => string;
  make: (id: string, n: number) => T;
  rank: keyof T;
  filter: Partial<T>;
  change: (item: T) => T;
}

const card = (id: string, n: number): CardRecord => ({ id, title: `Card ${n}`, lane: 'build', laneVersion: 1, stage: n % 2 ? 'draft' : 'done', retries: {}, evidence: [], events: [], createdAt: `2026-01-0${n}T00:00:00.000Z`, updatedAt: `2026-01-0${n}T00:00:00.000Z` });

const fixtures: Record<string, Fixture<any>> = {
  cards: { repo: s => s.cards, id: n => `c-00${n}`, make: card, rank: 'createdAt', filter: { stage: 'draft' }, change: c => ({ ...c, title: 'moved' }) },
  lanes: {
    repo: s => s.lanes,
    id: n => `lane-${n}`,
    make: (id, n) => ({ id, version: 1, metric: { name: 'm', source: 'cards' }, retries: 3, wip: n, stages: [{ id: 'draft', done: { cmd: 'true' } }] }) as Lane,
    rank: 'wip',
    filter: { wip: 2 },
    // A lane is versioned by the number it declares, so a change to it bumps that number.
    change: l => ({ ...l, version: l.version + 1, wip: 9 }),
  },
  pages: {
    repo: s => s.pages,
    id: n => `.codeloop/wiki/gotchas/page-${n}.md`,
    make: (id, n) => ({ id, folder: 'gotchas', title: `Page ${n}`, frontmatter: { title: `Page ${n}`, severity: n % 2 ? 'warning' : 'critical' }, body: `Body ${n}` }) as WikiPage,
    rank: 'title',
    filter: { title: 'Page 2' },
    change: p => ({ ...p, body: 'rewritten' }),
  },
  initiatives: {
    repo: s => s.initiatives,
    id: n => `initiative-${n}`,
    make: (id, n) => ({ id, title: `Initiative ${n}`, status: n % 2 ? 'active' : 'done', persona: 'founder', hypothesis: `We believe ${n}` }) as Initiative,
    rank: 'title',
    filter: { status: 'active' },
    change: b => ({ ...b, goal: 'by December' }),
  },
  epics: {
    repo: s => s.epics,
    id: n => `epic-${n}`,
    make: (id, n) => ({ id, title: `Epic ${n}`, initiative: 'speed', status: n % 2 ? 'active' : 'done', body: `Outcome ${n}` }) as Epic,
    rank: 'title',
    filter: { status: 'active' },
    change: e => ({ ...e, goal: 'by December' }),
  },
  features: {
    repo: s => s.features,
    id: n => `feature-${n}`,
    make: (id, n) => ({ id, title: `Feature ${n}`, initiative: 'speed', epic: 'epic-1', status: n % 2 ? 'active' : 'done', rice: { reach: n, impact: 5, confidence: 5, effort: 2 }, body: `Capability ${n}` }) as Feature,
    rank: 'title',
    filter: { status: 'active' },
    change: f => ({ ...f, release: 'next' }),
  },
};

describe.each(drivers)('%s repo contract', (_name, open) => {
  describe.each(Object.entries(fixtures))('%s', (_repo, fx) => {
    const ids = (items: Entity[]) => items.map(i => i.id);
    const id = fx.id;

    it('get, list, put, remove round-trip with a version on every read', async () => {
      const store = open();
      const repo = fx.repo(store);
      expect(await repo.get(id(1))).toBeUndefined();
      const stored = await repo.put(fx.make(id(1), 1));
      expect(stored.version).toBeDefined();
      expect((await repo.get(id(1)))?.version).toBe(stored.version);
      expect(ids(await repo.list())).toEqual([id(1)]);
      await repo.remove(id(1));
      expect(await repo.get(id(1))).toBeUndefined();
      await repo.remove(id(1)); // removing what is not there is not an error
      await store.close();
    });

    it('refuses a put whose expected version is stale, and lands one that is current', async () => {
      const store = open();
      const repo = fx.repo(store);
      const first = await repo.put(fx.make(id(1), 1));
      const moved = await repo.put(fx.change(first), first.version);
      expect(moved.version).not.toBe(first.version);
      await expect(repo.put(fx.change(first), first.version)).rejects.toBeInstanceOf(ConflictError);
      // The stale write changed nothing.
      expect((await repo.get(id(1)))?.version).toBe(moved.version);
      await store.close();
    });

    it('list filters on a field, sorts either way, and pages by cursor and limit', async () => {
      const store = open();
      const repo = fx.repo(store);
      for (const n of [3, 1, 2]) await repo.put(fx.make(id(n), n));
      expect(ids(await repo.list({ sort: { field: fx.rank } }))).toEqual([id(1), id(2), id(3)]);
      expect(ids(await repo.list({ sort: { field: fx.rank, dir: 'desc' } }))).toEqual([id(3), id(2), id(1)]);
      expect(ids(await repo.list({ sort: { field: fx.rank }, cursor: id(1), limit: 1 }))).toEqual([id(2)]);
      const filtered = await repo.list({ where: fx.filter, sort: { field: fx.rank } });
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.length).toBeLessThan(3);
      expect(ids(await repo.list({ where: { id: 'nobody' } }))).toEqual([]);
      await store.close();
    });
  });

  it('tx runs the function against the store and hands back its result', async () => {
    const store = open();
    const n = await store.tx(async s => {
      await s.initiatives.put({ id: 'inside', title: 'Inside', hypothesis: 'held' });
      return (await s.initiatives.list()).length;
    });
    expect(n).toBe(1);
    await store.close();
  });

  it('events() yields a change for a write made through the store', async () => {
    const store = open();
    const events = store.events()[Symbol.asyncIterator]();
    await store.initiatives.put({ id: 'seen', title: 'Seen', hypothesis: 'it is' });
    const first = await events.next();
    expect(first.value).toMatchObject({ repo: 'initiatives', id: 'seen' });
    await events.return?.();
    await store.close();
  });
});

describe('FileDriver over the files the CLI writes', () => {
  it('reads what the engine wrote and writes what the engine reads, without touching the file format', async () => {
    withBuildLane();
    createCard(dir, { lane: 'build', title: 'From the engine', id: 'c-1' });
    addQuestions(dir, 'c-1', [{ question: 'Which?', recommended: 'A' }]);
    const store = new FileDriver(dir);

    const cards = await store.cards.list();
    expect(cards.map(c => [c.id, c.stage])).toEqual([['c-1', 'draft']]);
    const q = await store.questions.get('c-1#1');
    expect(q).toMatchObject({ cardId: 'c-1', n: 1, question: 'Which?', recommended: 'A', answer: '' });

    await store.questions.put({ ...q!, answer: 'A' }, q!.version);
    expect(readFileSync(join(dir, 'specs/001-from-the-engine/interview.md'), 'utf-8')).toBe('## Q1 Which?\nrecommended: A\nanswer: A\n');
    const before = JSON.parse(readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8'));
    await store.cards.put({ ...cards[0], title: 'Renamed' }, cards[0].version);
    const after = JSON.parse(readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8'));
    expect(after.version).toBe(before.version + 1);
    expect(Object.keys(after.cards[0])).toEqual(Object.keys(before.cards[0]));
    expect(after.cards[0]).not.toHaveProperty('version');
    await store.close();
  });

  it('a feature page whose rice is off the scale is refused on write and on read', async () => {
    const store = new FileDriver(dir);
    const bad = { id: 'f', title: 'F', initiative: 'speed', rice: { reach: 11, impact: 5, confidence: 5, effort: 1 }, body: '' };
    await expect(store.features.put(bad)).rejects.toThrow('feature f: rice.reach');
    mkdirSync(join(dir, '.codeloop/wiki/features'), { recursive: true });
    writeFileSync(join(dir, '.codeloop/wiki/features/f.md'), '---\ntitle: F\ninitiative: speed\nrice: { reach: 11, impact: 5, confidence: 5, effort: 1 }\n---\n');
    await expect(store.features.get('f')).rejects.toThrow('feature f: rice.reach');
    await store.close();
  });

  it('evidence and artifacts are read-only: a put is refused by name', async () => {
    const store = new FileDriver(dir);
    await expect(store.evidence.put({ id: '001', files: [] })).rejects.toThrow('written by `codeloop verify`');
    await expect(store.artifacts.put({ id: 'docs/mocks/x.html', kind: 'mock', title: 'x' })).rejects.toThrow('not by the store');
    await store.close();
  });

  it('config serves config.yaml and never local.yaml', async () => {
    writeFileSync(join(dir, '.codeloop/config.yaml'), 'project:\n  name: demo\n');
    writeFileSync(join(dir, '.codeloop/local.yaml'), 'cloud:\n  key: secret\n');
    const store = new FileDriver(dir);
    expect(await store.config.all()).toEqual({ project: { name: 'demo' } });
    await store.close();
  });
});

describe('openStore and migrations', () => {
  it('picks the driver config.yaml names, defaults to file, and refuses one nobody registered', () => {
    expect(openStore(dir)).toBeInstanceOf(FileDriver);
    writeFileSync(join(dir, '.codeloop/config.yaml'), 'store:\n  driver: memory\n');
    expect(openStore(dir)).toBeInstanceOf(MemoryDriver);
    writeFileSync(join(dir, '.codeloop/config.yaml'), 'store:\n  driver: sql\n');
    expect(() => openStore(dir)).toThrow('store.driver "sql"');
    registerDriver('sql', () => new MemoryDriver());
    expect(openStore(dir)).toBeInstanceOf(MemoryDriver);
  });

  it('runs 001-story-fields once and records it in store.json', async () => {
    withBuildLane();
    createCard(dir, { lane: 'build', title: 'Old proposal', id: 'c-1' });
    const file = JSON.parse(readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8'));
    file.cards[0].description = 'As a founder, I can ship, so that I sleep. Initiative: speed · S · metric: turns';
    writeFileSync(join(dir, '.codeloop/cards.json'), JSON.stringify(file));
    const store = new FileDriver(dir);

    expect(await runMigrations(dir, store)).toEqual([{ id: '001-story-fields', note: 'story fields filled on c-1' }]);
    expect((await store.cards.get('c-1'))?.story).toEqual({ as: 'founder', can: 'ship', so: 'I sleep' });
    expect(JSON.parse(readFileSync(join(dir, '.codeloop/store.json'), 'utf-8')).applied.map((a: { id: string }) => a.id)).toEqual(['001-story-fields']);
    expect(await runMigrations(dir, store)).toEqual([]);
    expect(existsSync(join(dir, '.codeloop/store.json'))).toBe(true);
    await store.close();
  });
});
