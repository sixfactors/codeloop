import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { readCards } from '../cards.js';
import { advanceCard, annotateCard, approveCard, createCard } from '../engine.js';
import { runDue } from '../run.js';
import { shape } from '../services.js';
import { checkBrief, checkBreakdown, newShape, parseBreakdown } from '../shape.js';

let dir: string;

function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

function writeLane(id: string, body: string): void {
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, `.codeloop/lanes/${id}.yaml`), `id: ${id}\nversion: 1\nmetric: { name: m, source: cards }\n${body}`);
}

const VALID_BREAKDOWN = `# Epic: Test Epic
hypothesis: shipping this moves the metric
metric: stories_shipped_per_epic

## Stories
- S1 [S] Story one · exists: build · done_when: open the page and see it · depends_on: none
- S2 [M] Story two · exists: unlock src/x.ts · done_when: the draft saves and reopens · depends_on: S1

## Later
- Versions and deprecation
`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-shape-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('parseBreakdown', () => {
  it('reads the epic header, every story field and the later list', () => {
    const b = parseBreakdown(VALID_BREAKDOWN);
    expect(b.title).toBe('Test Epic');
    expect(b.hypothesis).toBe('shipping this moves the metric');
    expect(b.metric).toBe('stories_shipped_per_epic');
    expect(b.stories).toEqual([
      { id: 'S1', size: 'S', title: 'Story one', exists: 'build', existsPath: undefined, doneWhen: 'open the page and see it', dependsOn: [] },
      { id: 'S2', size: 'M', title: 'Story two', exists: 'unlock', existsPath: 'src/x.ts', doneWhen: 'the draft saves and reopens', dependsOn: ['S1'] },
    ]);
    expect(b.later).toEqual(['Versions and deprecation']);
  });

  it('round-trips a ranked story line, including the rice part', () => {
    const text = VALID_BREAKDOWN.replace('depends_on: none', 'depends_on: none · rice: R=3 I=2 C=3 E=1');
    const b = parseBreakdown(text);
    expect(b.stories[0].rice).toEqual({ r: 3, i: 2, c: 3, e: 1 });
    expect(b.stories[1].rice).toBeUndefined();
  });
});

describe('checkBrief', () => {
  function brief(text: string): string[] {
    write('shape/c-1/brief.md', text);
    write('.codeloop/cards.json', JSON.stringify({ version: 1, cards: [{ id: 'c-1', title: 't', lane: 'shape', laneVersion: 1, stage: 'brief', spec: 'shape/c-1', retries: {}, evidence: [], events: [], createdAt: '', updatedAt: '' }] }));
    return checkBrief(dir, 'c-1').errors;
  }

  it('refuses a brief with no problem, no users, no exists and no sources', () => {
    const errors = brief('# c-1 brief: t\n\nproblem:\nusers:\n\n## What exists\n\n## Sources\n');
    expect(errors).toEqual(expect.arrayContaining([expect.stringMatching(/problem:/), expect.stringMatching(/users:/), expect.stringMatching(/exists:/), expect.stringMatching(/cites 0 sources/)]));
  });

  it('passes once every field is filled and three sources are cited', () => {
    const errors = brief(
      '# c-1 brief: t\n\nproblem: let a workspace publish a skill pack\nusers: workspace owners\n\n## What exists\nexists: build\n\n## Sources\n- source: https://a.test — a\n- source: https://b.test — b\n- source: https://c.test — c\n',
    );
    expect(errors).toEqual([]);
  });
});

describe('checkBreakdown', () => {
  function breakdown(text: string, opts: { ranked?: boolean } = {}): string[] {
    write('shape/c-1/breakdown.md', text);
    write('.codeloop/cards.json', JSON.stringify({ version: 1, cards: [{ id: 'c-1', title: 't', lane: 'shape', laneVersion: 1, stage: 'breakdown', spec: 'shape/c-1', retries: {}, evidence: [], events: [], createdAt: '', updatedAt: '' }] }));
    return checkBreakdown(dir, 'c-1', opts).errors;
  }

  it('passes a well-formed breakdown with no errors', () => {
    expect(breakdown(VALID_BREAKDOWN)).toEqual([]);
  });

  it('refuses a story with no size, naming the story id, and passes once one is given', () => {
    const broken = breakdown(VALID_BREAKDOWN.replace('S1 [S] Story one', 'S1 Story one'));
    expect(broken).toEqual(expect.arrayContaining([expect.stringContaining('S1: no size')]));
    expect(breakdown(VALID_BREAKDOWN)).toEqual([]);
  });

  it('refuses a story sized L', () => {
    expect(breakdown(VALID_BREAKDOWN.replace('S2 [M]', 'S2 [L]'))).toEqual(expect.arrayContaining([expect.stringContaining('S2: size L')]));
  });

  it('refuses a placeholder done_when, naming the story id, and passes once it names a real check', () => {
    const broken = breakdown(VALID_BREAKDOWN.replace('done_when: the draft saves and reopens', 'done_when: all tasks complete'));
    expect(broken).toEqual(expect.arrayContaining([expect.stringContaining('S2:')]));
    expect(breakdown(VALID_BREAKDOWN)).toEqual([]);
  });

  it('refuses a story with no exists verdict', () => {
    expect(breakdown(VALID_BREAKDOWN.replace('exists: build', 'exists:'))).toEqual(expect.arrayContaining([expect.stringContaining('S1: no "exists:"')]));
  });

  it('refuses a depends_on naming a later story, and passes once the order is fixed', () => {
    const forward = VALID_BREAKDOWN.replace('- S1 [S] Story one · exists: build · done_when: open the page and see it · depends_on: none', '- S1 [S] Story one · exists: build · done_when: open the page and see it · depends_on: S2');
    expect(breakdown(forward)).toEqual(expect.arrayContaining([expect.stringContaining('S1: depends_on "S2" is not an earlier story')]));
    expect(breakdown(VALID_BREAKDOWN)).toEqual([]);
  });

  it('refuses more than seven stories', () => {
    const extra = Array.from({ length: 6 }, (_, i) => `- S${i + 3} [S] Story ${i + 3} · exists: build · done_when: x · depends_on: none`).join('\n');
    expect(breakdown(VALID_BREAKDOWN.replace('## Later', `${extra}\n\n## Later`))).toEqual(expect.arrayContaining([expect.stringContaining('the limit is 7')]));
  });

  it('refuses an epic with no hypothesis or metric', () => {
    const errors = breakdown(VALID_BREAKDOWN.replace('hypothesis: shipping this moves the metric\n', '').replace('metric: stories_shipped_per_epic\n', ''));
    expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('no "hypothesis:"'), expect.stringContaining('no "metric:"')]));
  });

  it('refuses zero stories', () => {
    expect(breakdown(VALID_BREAKDOWN.replace(/- S1.*\n- S2.*\n/, ''))).toEqual(expect.arrayContaining([expect.stringContaining('no stories')]));
  });

  it('with --ranked, refuses a story with no rice part, and passes once every story has one', () => {
    const noRice = breakdown(VALID_BREAKDOWN, { ranked: true });
    expect(noRice).toEqual(expect.arrayContaining([expect.stringContaining('S1: no "rice:"'), expect.stringContaining('S2: no "rice:"')]));
    const ranked = VALID_BREAKDOWN.replace('depends_on: none\n', 'depends_on: none · rice: R=3 I=2 C=3 E=1\n').replace('depends_on: S1\n', 'depends_on: S1 · rice: R=2 I=2 C=2 E=2\n');
    expect(breakdown(ranked, { ranked: true })).toEqual([]);
  });
});

describe('shape() and newShape()', () => {
  it('creates a shape-lane card titled from the problem, bypassing the story title check', () => {
    writeLane('shape', 'stages:\n  - id: brief\n    done: { cmd: "true" }\n');
    // Long, lowercase, punctuation-laden: would fail titleProblems()/storyFields() if checked.
    const problem = 'let a workspace publish a skill pack from the web app, end to end, no exceptions.';
    const created = shape(dir, problem);
    expect(created.card.lane).toBe('shape');
    expect(created.card.title).toBe(problem);
    expect(created.card.spec).toBe(`shape/${created.card.id}`);
    expect(readFileSync(join(dir, `shape/${created.card.id}/brief.md`), 'utf-8')).toContain(`problem: ${problem}`);
    expect(readFileSync(join(dir, `shape/${created.card.id}/breakdown.md`), 'utf-8')).toContain('# Epic:');
  });

  it('newShape leaves an existing file alone', () => {
    writeLane('shape', 'stages:\n  - id: brief\n    done: { cmd: "true" }\n');
    createCard(dir, { lane: 'shape', title: 'a problem', id: 'c-1' });
    write('shape/c-1/brief.md', 'already written');
    const { created } = newShape(dir, 'c-1', 'a problem');
    expect(created).toEqual(['shape/c-1/breakdown.md', 'shape/c-1/interview.md']);
    expect(readFileSync(join(dir, 'shape/c-1/brief.md'), 'utf-8')).toBe('already written');
  });
});

describe('on_done: { queue }', () => {
  function setUp(): void {
    writeLane('shape', 'stages:\n  - id: rank\n    output: "shape/{id}/breakdown.md"\n    done: { cmd: "true" }\n    gate: { name: plan, approver: owner }\non_done: { queue: build }\n');
    writeLane('build', 'wip: 1\nstages:\n  - id: work\n    done: { cmd: "test -f {id}.flag" }\n');
    createCard(dir, { lane: 'shape', title: 'a problem', id: 'c-1' });
    annotateCard(dir, 'c-1', { spec: 'shape/c-1' }, 'shape');
    write('shape/c-1/breakdown.md', VALID_BREAKDOWN);
  }

  it('writes the epic page and queues one build card per story, the first active and the rest queued', () => {
    setUp();
    expect(advanceCard(dir, 'c-1').outcome).toBe('parked');
    approveCard(dir, 'c-1', 'owner');
    const result = advanceCard(dir, 'c-1');
    expect(result.outcome).toBe('done');

    const epic = readFileSync(join(dir, '.codeloop/wiki/epics/test-epic.md'), 'utf-8');
    expect(epic).toContain('hypothesis: shipping this moves the metric');
    expect(epic).toContain('| S1 |');
    expect(epic).toContain('| S2 |');

    const cards = readCards(dir).cards;
    const s1 = cards.find(c => c.split_from === 'c-1' && c.title === 'Story one')!;
    const s2 = cards.find(c => c.split_from === 'c-1' && c.title === 'Story two')!;
    expect(s1.stage).toBe('work');
    expect(s1.lane).toBe('build');
    expect(s1.done_when).toBe('open the page and see it');
    expect(s1.epic).toBe('test-epic');
    expect(s2.stage).toBe('queued');
    expect(s2.after).toBe(s1.id);

    const queuedEvent = readCards(dir).cards.find(c => c.id === 'c-1')!.events.filter(e => e.action === 'queued');
    expect(queuedEvent.length).toBe(2);
  });

  it('`run` promotes the next queued story once the one it is after reaches done', () => {
    setUp();
    advanceCard(dir, 'c-1');
    approveCard(dir, 'c-1', 'owner');
    advanceCard(dir, 'c-1');

    const cards = readCards(dir).cards;
    const s1 = cards.find(c => c.split_from === 'c-1' && c.title === 'Story one')!;
    const s2 = cards.find(c => c.split_from === 'c-1' && c.title === 'Story two')!;
    expect(s2.stage).toBe('queued');

    write(`${s1.id}.flag`, 'x');
    expect(advanceCard(dir, s1.id).outcome).toBe('done');
    expect(readCards(dir).cards.find(c => c.id === s2.id)!.stage).toBe('queued');

    runDue(dir);
    expect(readCards(dir).cards.find(c => c.id === s2.id)!.stage).toBe('work');
  });
});
