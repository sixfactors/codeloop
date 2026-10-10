import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { findCard, readCards } from '../cards.js';
import { addCompetitor } from '../competitors.js';
import { advanceCard, approveCard, createCard, proposeCard, rejectCard, RefusalError } from '../engine.js';
import { approveFlow, nextHint } from '../flow.js';
import { buildInbox } from '../inbox.js';
import { lintLane, loadLanes, parseLane } from '../lane.js';
import { runDue } from '../run.js';
import { scanCompetitors } from '../scan.js';
import { computeStats } from '../stats.js';

let dir: string;
const entry = process.argv[1];

function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}
const cards = () => readCards(dir).cards;
const V1 = '# Changelog\n\n## September\n- Faster search\n';
const V2 = '# Changelog\n\n## Bulk CSV export\n- Export any list to CSV\n- Scheduled exports by email\n\n## September\n- Faster search\n';
const scan = (text: string) => {
  write('changelog.txt', text);
  return scanCompetitors(dir, { fromFile: 'changelog.txt' });
};

beforeEach(() => {
  process.argv[1] = resolve('dist/index.js');
  dir = mkdtempSync(join(tmpdir(), 'codeloop-scan-'));
  write('.codeloop/lanes/plan.yaml', 'id: plan\nversion: 1\nmetric: { name: m, source: cards }\nwip: 1\nstages:\n  - { id: gather, output: "plan/{id}/signals.md", done: { cmd: "test -f plan/{id}/signals.md" } }\n');
  addCompetitor(dir, { name: 'acme', title: 'Acme', changelog: 'https://acme.test/changelog' });
});

afterEach(() => {
  process.argv[1] = entry;
  rmSync(dir, { recursive: true, force: true });
});

describe('scan competitors', () => {
  it('stores the first text it sees as the baseline and proposes nothing', async () => {
    expect(await scan(V1)).toEqual([{ name: 'acme', outcome: 'baseline' }]);
    expect(readFileSync(join(dir, '.codeloop/state/scan/acme.txt'), 'utf-8')).toContain('Faster search');
    expect(cards()).toEqual([]);
  });

  it('proposes one plan card per competitor when new text appears, titled with the first new heading', async () => {
    await scan(V1);
    expect(await scan(V2)).toEqual([{ name: 'acme', outcome: 'proposed', card: 'c-001' }]);
    expect(cards()).toHaveLength(1);
    expect(cards()[0]).toMatchObject({ id: 'c-001', lane: 'plan', stage: 'proposed', gate: 'proposal', awaiting: 'owner', title: 'Acme shipped: Bulk CSV export', source: 'https://acme.test/changelog' });
    expect(cards()[0].description).toContain('- Export any list to CSV\n- Scheduled exports by email');
    expect(cards()[0].description).not.toContain('Faster search');
  });

  it('never creates a second card for the same change, even when the stored text is lost', async () => {
    await scan(V1);
    await scan(V2);
    expect(await scan(V2)).toEqual([{ name: 'acme', outcome: 'unchanged' }]);
    write('.codeloop/state/scan/acme.txt', V1);
    expect(await scan(V2)).toEqual([{ name: 'acme', outcome: 'already-proposed', card: 'c-001' }]);
    expect(cards()).toHaveLength(1);
  });

  it('reads headings out of an HTML changelog', async () => {
    await scan('<html><body><h1>Changelog</h1><h2>September</h2><p>Faster search</p></body></html>');
    await scan('<html><head><style>h2{color:red}</style></head><body><h1>Changelog</h1><h2>Bulk CSV&nbsp;export</h2><ul><li>Export any list</li></ul><h2>September</h2><p>Faster search</p></body></html>');
    expect(cards()[0].title).toBe('Acme shipped: Bulk CSV export');
  });

  describe('fetching', () => {
    let server: Server;
    let base: string;
    let body = V1;
    beforeEach(async () => {
      server = createServer((req, res) => (req.url === '/broken' ? res.writeHead(500).end('no') : res.writeHead(200, { 'content-type': 'text/markdown' }).end(body)));
      await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
      base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    });
    afterEach(() => void server.close());

    it('skips a changelog that cannot be fetched and still scans the others', async () => {
      addCompetitor(dir, { name: 'acme', changelog: `${base}/changelog` });
      addCompetitor(dir, { name: 'broken', changelog: `${base}/broken` });
      addCompetitor(dir, { name: 'down', changelog: 'http://127.0.0.1:1/changelog' });
      addCompetitor(dir, { name: 'nolink', docs: 'https://nolink.test/docs' });
      body = V1;
      await scanCompetitors(dir);
      body = V2;
      expect(await scanCompetitors(dir)).toEqual([
        { name: 'acme', outcome: 'proposed', card: 'c-001' },
        { name: 'broken', outcome: 'skipped', reason: `${base}/broken answered 500` },
        { name: 'down', outcome: 'skipped', reason: expect.stringContaining('did not answer') },
      ]);
      expect(existsSync(join(dir, '.codeloop/state/scan/broken.txt'))).toBe(false);
    });
  });
});

describe('proposed cards', () => {
  it('wait for the owner, are never started by a run, and take no place in the lane', () => {
    const { card } = proposeCard(dir, { lane: 'plan', title: 'Acme shipped: X', description: 'excerpt', source: 'https://acme.test/changelog' });
    expect(runDue(dir).advanced).toEqual([]);
    expect(() => advanceCard(dir, card.id)).toThrow(RefusalError);
    expect(buildInbox(dir).needs_you).toMatchObject([{ id: card.id, gate: 'proposal', source: 'https://acme.test/changelog', last_check: 'not started: a proposal' }]);
    expect(buildInbox(dir).numbers.find(n => n.lane === 'plan')).toMatchObject({ active: 0, parked: 1 });
    // wip is 1: a proposal must not use the slot.
    expect(createCard(dir, { lane: 'plan', title: 'real work' }).stage).toBe('gather');
  });

  it('do not count against capacity.gates_per_day', () => {
    write('.codeloop/config.yaml', 'capacity:\n  gates_per_day: 1\n');
    proposeCard(dir, { lane: 'plan', title: 'one' });
    proposeCard(dir, { lane: 'plan', title: 'two' });
    expect(createCard(dir, { lane: 'plan', title: 'real work' }).stage).toBe('gather');
  });

  it('are promoted into the first stage by an owner approval, without running its check', () => {
    const { card } = proposeCard(dir, { lane: 'plan', title: 'Acme shipped: X' });
    expect(() => approveCard(dir, card.id, 'agent')).toThrow(/needs owner/);
    expect(nextHint(dir, card)).toContain(`codeloop approve ${card.id}`);
    const result = approveFlow(dir, card.id, 'owner');
    expect(result.advanced).toBeUndefined();
    expect(findCard(cards(), card.id)).toMatchObject({ stage: 'gather', retries: {} });
    expect(findCard(cards(), card.id).gate).toBeUndefined();
    expect(findCard(cards(), card.id).events.map(e => e.action)).toEqual(['propose', 'promote']);
  });

  it('are dropped by a rejection and never run afterwards', () => {
    const { card } = proposeCard(dir, { lane: 'plan', title: 'Acme shipped: X' });
    expect(rejectCard(dir, card.id, 'owner', 'not for us')).toMatchObject({ stage: 'dropped' });
    expect(runDue(dir).advanced).toEqual([]);
    expect(buildInbox(dir).needs_you).toEqual([]);
    expect(() => advanceCard(dir, card.id)).toThrow(/was dropped/);
  });

  it('when dropped, count as a human turn but not as a failed gate or as rework', () => {
    const { card } = proposeCard(dir, { lane: 'plan', title: 'Acme shipped: X' });
    rejectCard(dir, card.id, 'owner', 'not for us');
    const stats = computeStats(cards(), loadLanes(dir));
    expect(stats.first_pass_rate_by_gate).toEqual({});
    expect(stats).toMatchObject({ rework: null, human_turns_per_card: 1 });
  });
});

describe('a check that writes the board', () => {
  it('keeps what the check recorded on its own card, and the card still advances', () => {
    // `spec new` records the spec folder on the card, the way `codeloop verify` records its evidence.
    write('.codeloop/lanes/notes.yaml', 'id: notes\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - { id: write, done: { cmd: "codeloop spec new {id}" } }\n  - { id: ship, done: { cmd: "true" } }\n');
    createCard(dir, { lane: 'notes', title: 'Release notes', id: 'c-070' });
    const { card, outcome } = advanceCard(dir, 'c-070');
    expect(outcome).toBe('moved');
    expect(card).toMatchObject({ stage: 'ship', spec: 'specs/070-release-notes' });
    expect(findCard(cards(), 'c-070').events.map(e => e.action)).toEqual(['create', 'spec', 'advance']);
  });
});

describe('scan lane', () => {
  it('the shipped scan lane runs weekly, has one stage that runs the scan, and passes lint', () => {
    const lane = parseLane(readFileSync(resolve('templates/lanes/scan.yaml'), 'utf-8'));
    expect(lane).toMatchObject({ id: 'scan', trigger: { cron: '0 7 * * MON' }, stages: [{ id: 'scan', done: { cmd: 'codeloop scan competitors' } }] });
    expect(lintLane(lane)).toEqual([]);
  });

  it('a stage whose check proposes a card still finishes: the advance is written on the board the check left', async () => {
    write('.codeloop/lanes/scan.yaml', 'id: scan\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - { id: scan, done: { cmd: "codeloop scan competitors --from-file changelog.txt" } }\n');
    await scan(V1);
    write('changelog.txt', V2);
    createCard(dir, { lane: 'scan', title: 'scan 2026-10-05', id: 'c-050' });

    expect(advanceCard(dir, 'c-050').outcome).toBe('done');
    expect(cards().map(c => `${c.id} ${c.lane} ${c.stage}`)).toEqual(['c-050 scan done', 'c-051 plan proposed']);
  });
});
