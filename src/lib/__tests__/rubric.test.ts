import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildBrief } from '../agent.js';
import { readCards } from '../cards.js';
import { evaluateRubric } from '../rubric.js';
import { createLocalClient } from '../../sdk/local.js';

let dir: string;
function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}
const card = (id: string, stage: string) => ({ id, title: 'Accountants export invoices to CSV', lane: 'build', laneVersion: 1, stage, retries: {}, evidence: [], events: [], createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z', spec: 'specs/001' });

const LANE = (review = '') => `id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: research\n    skill: research\n    output: "{spec}/research.md"\n    done: { cmd: "true" }\n${review}  - id: build\n    done: { cmd: "true" }\n`;

const RESEARCH = `exists: build
pain: accountants retype invoices, source https://acme.test/support/123

## Options

- One CSV per month. Chosen.
- One XLSX per year: lost, Excel-only.

- source: https://acme.test/docs — the import format
- source: src/export.ts — the current exporter
- source: https://acme.test/forum — four requests this month
verdict: build
`;
const ATTEST = (r2: string) => `\n## Rubric\n\n- R2 pass: ${r2}\n- R5 pass: ## Options in specs/001/research.md\n- R7 pass: specs/001/research.md:20 lists the open questions\n`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-rubric-'));
  write('src/export.ts', 'export {};\n');
  write('.codeloop/lanes/build.yaml', LANE());
  write('.codeloop/cards.json', JSON.stringify({ version: 1, cards: [card('c-001', 'research')] }, null, 2));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('check rubric', () => {
  it('fails naming R2 when its attest line is missing', () => {
    write('specs/001/research.md', RESEARCH + ATTEST('x').replace(/^- R2 pass: x\n/m, ''));
    const { problems } = evaluateRubric(dir, 'c-001');
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^R2 .*no `- R2 pass: <evidence>` line under ## Rubric in specs\/001\/research.md/);
  });

  it('fails an attest line with prose and no path, passes with evidence', () => {
    write('specs/001/research.md', RESEARCH + ATTEST('I looked around and it is not there'));
    expect(evaluateRubric(dir, 'c-001').problems).toEqual([expect.stringMatching(/^R2 .*evidence names no path, line, URL or command/)]);
    write('specs/001/research.md', RESEARCH + ATTEST('`grep -rn "csv" src/` found only src/export.ts'));
    const report = evaluateRubric(dir, 'c-001');
    expect(report.problems).toEqual([]);
    expect(report.rows.find(r => r.id === 'R6')).toMatchObject({ judged: 'review', status: 'pending' });
  });

  it('a check row fails on its own: a non-build exists with no path', () => {
    write('specs/001/research.md', RESEARCH.replace('exists: build', 'exists: unlock it somewhere') + ATTEST('`grep -rn csv src/`'));
    expect(evaluateRubric(dir, 'c-001').problems).toEqual([expect.stringMatching(/^R1 .*names no path or URL/)]);
  });

  it('a stage with review: needs the review file with verdict: accept', () => {
    write('.codeloop/lanes/build.yaml', LANE('    review: { agent: reviewer }\n'));
    write('specs/001/research.md', RESEARCH + ATTEST('`grep -rn csv src/`'));
    expect(evaluateRubric(dir, 'c-001').problems).toEqual(['R6 Nothing proposed that R2 showed already exists: specs/001/review-research.md is missing', 'specs/001/review-research.md needs `verdict: accept` from the reviewer agent (it is missing)']);
    write('specs/001/review-research.md', '- R6 accept\nverdict: accept\n');
    expect(evaluateRubric(dir, 'c-001').problems).toEqual([]);
  });
});

describe('the rubric reaches the agent and the gate', () => {
  it('the brief for a research card carries the R rows and how to attest', () => {
    const brief = buildBrief(dir, readCards(dir).cards[0]);
    expect(brief).toMatch(/## Rubric: research/);
    expect(brief).toMatch(/R2 \| The `exists:` verdict is proven.* \| attest/);
    expect(brief).toMatch(/one `- Rn pass: <evidence>` line for each of R2, R5, R7/);
  });

  it('cards.full carries the rubric rows with pass, fail and finding', async () => {
    write('specs/001/research.md', RESEARCH);
    const full = await createLocalClient(dir).cards.full('c-001');
    if (!full.rubric) throw new Error('no rubric');
    expect(full.rubric.stage).toBe('research');
    expect(full.rubric.rows.find(r => r.id === 'R1')!.status).toBe('pass');
    expect(full.rubric.rows.find(r => r.id === 'R2')).toMatchObject({ status: 'fail', finding: expect.stringMatching(/no `- R2 pass/) });
  });
});

describe('a stage reviewer', () => {
  it('runs after the stage agent and before the check, and its accept lets the stage pass', async () => {
    const { workCard } = await import('../run.js');
    const { loadAgents } = await import('../agent.js');
    write('.codeloop/lanes/build.yaml', LANE('    review: { agent: rev }\n').replace('    done: { cmd: "true" }\n    review', '    done: { cmd: "test -f specs/001/review-research.md" }\n    review'));
    write('.codeloop/config.yaml', 'agents:\n  default: work\n  work:\n    cmd: "mkdir -p specs/001 && touch specs/001/research.md"\n    timeout_minutes: 1\n  rev:\n    cmd: "printf \'verdict: accept\\\\n\' > specs/001/review-research.md"\n    timeout_minutes: 1\n');
    const turn = await workCard(dir, 'c-001', 'research', loadAgents(dir).agents.work, new Date());
    expect(turn.advanced.outcome).toBe('moved');
    const events = readCards(dir).cards[0].events.map(e => [e.action, (e as { agent?: string }).agent]);
    expect(events.slice(0, 3)).toEqual([['agent-start', 'work'], ['agent-run', 'work'], ['review-run', 'rev']]);
  });
});

describe('spec rows read spec.md', () => {
  it('S1 and S2 judge the story and acceptance lines written in spec.md, not the card', () => {
    write('.codeloop/lanes/build.yaml', 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: spec\n    skill: spec\n    output: "{spec}/tasks.md"\n    done: { cmd: "true" }\n');
    write('.codeloop/cards.json', JSON.stringify({ version: 1, cards: [card('c-001', 'spec')] }, null, 2));
    const spec = 'Story: As a founder, I can export every invoice as one CSV, so that my accountant gets one file.\nsize: S\nmetric: cycle_time_days\ndone_when: npm test\n\n- US1 Given ten invoices, when I export, then invoices.csv has ten rows.\n';
    write('specs/001/spec.md', spec);
    const rows = () => Object.fromEntries(evaluateRubric(dir, 'c-001').rows.map(r => [r.id, r.status]));
    expect(rows()).toMatchObject({ S1: 'pass', S2: 'pass' });
    write('specs/001/spec.md', spec.replace('when I export, ', ''));
    expect(rows()).toMatchObject({ S2: 'fail' });
  });
});

describe('rubric scaffold, for a card in flight when its rubric arrives', () => {
  it('appends pending lines once, check reports them as pending not missing, and evidence replaces them', async () => {
    const { scaffoldRubric, cardsNeedingRubric } = await import('../rubric.js');
    write('specs/001/research.md', RESEARCH);
    expect(cardsNeedingRubric(dir)).toEqual([{ id: 'c-001', stage: 'research', rows: ['R2', 'R5', 'R7'] }]);
    expect(evaluateRubric(dir, 'c-001').problems.every(p => /missing: /.test(p))).toBe(true);

    expect(scaffoldRubric(dir, 'c-001')).toEqual({ path: 'specs/001/research.md', added: ['R2', 'R5', 'R7'] });
    const once = readFileSync(join(dir, 'specs/001/research.md'), 'utf-8');
    expect(once.match(/^## Rubric$/gm)).toHaveLength(1);
    expect(scaffoldRubric(dir, 'c-001')).toEqual({ path: 'specs/001/research.md', added: [] });
    expect(readFileSync(join(dir, 'specs/001/research.md'), 'utf-8')).toBe(once);

    const { problems } = evaluateRubric(dir, 'c-001');
    expect(problems).toHaveLength(3);
    expect(problems[0]).toMatch(/^R2 .*: pending: scaffolded in specs\/001\/research.md, not yet attested/);
    expect(cardsNeedingRubric(dir)).toEqual([]);

    write('specs/001/research.md', once.replace(/^- R2 pending: .*$/m, '- R2 pass: `grep -rn csv src/`'));
    expect(evaluateRubric(dir, 'c-001').problems.map(p => p.slice(0, 2))).toEqual(['R5', 'R7']);
  });
});
