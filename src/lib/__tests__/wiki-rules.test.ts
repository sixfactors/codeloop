import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildBrief } from '../agent.js';
import { readCards } from '../cards.js';
import { capture, lintWiki, listPages, mergePages } from '../wiki.js';
import { decisionFromResearch, migrateResearchDecisions, normaliseTitle, wikiLanded } from '../wiki-rules.js';

let dir: string;
function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}
const card = (id: string, title: string, stage = 'research', extra: Record<string, unknown> = {}) => ({ id, title, lane: 'build', laneVersion: 1, stage, retries: {}, evidence: [], events: [], createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z', spec: `specs/${id.slice(2)}`, ...extra });

const DECISION = `## Options

- One CSV per month. Chosen.
- One XLSX workbook per year.

## Why

Accountants import CSV.

## Consequences

Yearly totals are computed on import.`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-wiki-rules-'));
  write('src/export.ts', 'export {};\n');
  write('.codeloop/lanes/build.yaml', 'id: build\nversion: 1\nmetric: { name: m, source: cards }\nstages:\n  - id: research\n    output: specs/{nnn}/research.md\n    done: { cmd: "true" }\n  - id: build\n    done: { cmd: "true" }\n');
  write('.codeloop/cards.json', JSON.stringify({ version: 1, cards: [card('c-001', 'Invoices export to CSV'), card('c-002', 'Accountants export invoices to CSV each month', 'build')] }, null, 2));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('write rules per folder', () => {
  it('refuses a decision with one option, naming the rule', () => {
    expect(() => capture(dir, { kind: 'decision', title: 'Export as CSV', scope: ['src/export.ts'], body: DECISION.replace('- One XLSX workbook per year.\n', '') })).toThrow(/decision needs at least two options/);
    expect(() => capture(dir, { kind: 'decision', title: 'Invoices export to CSV: build', scope: ['src/export.ts'], body: DECISION, card: 'c-001' })).toThrow(/titled by the choice/);
    expect(() => capture(dir, { kind: 'decision', title: 'Export as CSV', scope: [], body: DECISION })).toThrow(/decision needs scope files/);
    expect(capture(dir, { kind: 'decision', title: 'Export one CSV per month', scope: ['src/export.ts'], body: DECISION }).freq).toBe(1);
  });

  it('refuses a gotcha with no failure or no fix', () => {
    expect(() => capture(dir, { title: 'Export drops rows', scope: ['src/export.ts'], body: 'Be careful.' })).toThrow(/gotcha needs the failure seen and the fix/);
  });
});

describe('dedupe beyond exact title', () => {
  it('a near-duplicate gotcha merges: freq 2, the card added, a dated note appended', () => {
    capture(dir, { title: 'CSV export drops the last invoice row', scope: ['src/export.ts'], body: 'Failure: the last row is missing.\nFix: flush the writer.', card: 'c-001' }, new Date('2026-10-13T00:00:00Z'));
    const page = capture(dir, { title: 'c-002 CSV export drops last invoice row', scope: ['src/export.ts'], body: 'Failure: last row gone again.\nFix: flush before close.', card: 'c-002' }, new Date('2026-10-14T00:00:00Z'));
    expect(listPages(dir).filter(p => p.kind === 'gotcha')).toHaveLength(1);
    expect(page.freq).toBe(2);
    expect(page.cards).toEqual(['c-001', 'c-002']);
    expect(page.body).toMatch(/2026-10-14 \(c-002\): Failure: last row gone again\./);
  });

  it('normalises a research mirror title and card ids', () => {
    expect(normaliseTitle('Invoices export to CSV: build')).toBe('invoices export to csv');
    expect(normaliseTitle('c-012 Flush the writer')).toBe('flush the writer');
  });

  it('lint lists near-duplicates it did not merge, and merge folds two pages by hand', () => {
    write('.codeloop/wiki/gotchas/a.md', '---\ntitle: Export drops the final row\nscope: [src/export.ts]\nfreq: 1\ncards: [c-001]\n---\n\nFailure: x\nFix: y\n');
    write('.codeloop/wiki/gotchas/b.md', '---\ntitle: Export loses the final row sometimes\nscope: [src/other.ts]\nfreq: 2\ncards: [c-002]\n---\n\nFailure: z\nFix: w\n');
    expect(lintWiki(dir).nearDuplicates).toEqual(['.codeloop/wiki/gotchas/a.md and .codeloop/wiki/gotchas/b.md look like the same page; fold them with `codeloop wiki merge a b`']);
    const merged = mergePages(dir, '.codeloop/wiki/gotchas/a.md', '.codeloop/wiki/gotchas/b.md');
    expect(merged.freq).toBe(3);
    expect(merged.cards).toEqual(['c-001', 'c-002']);
    expect(existsSync(join(dir, '.codeloop/wiki/gotchas/b.md'))).toBe(false);
  });
});

describe('the research mirror migration', () => {
  it('folds a mirror with compared options into a decision titled by the choice and drops the rest', () => {
    write('.codeloop/wiki/decisions/small-fixes-build.md', '---\ntitle: "Small fixes skip the ceremony: build"\nscope: []\nfreq: 1\ncards: [c-058]\n---\n\nVerdict: build\nExists: build. `src/export.ts` has no size.\nPain: a one-line fix burns a day.\n\n## Options\n\n- Add a trivial size that enters at build. Chosen.\n- Keep S as the smallest size.\n\nFrom specs/058-x/research.md.\n');
    write('.codeloop/wiki/decisions/home-build.md', '---\ntitle: "Home shows what needs me: build"\nscope: []\nfreq: 1\ncards: [c-135]\n---\n\nVerdict: build\n\n## Options\n\n- Reshape Home. Chosen.\n\nFrom specs/135-x/research.md.\n');
    const mapping = migrateResearchDecisions(dir);
    expect(mapping).toEqual([
      { from: '.codeloop/wiki/decisions/home-build.md', to: null, why: 'one option compared' },
      { from: '.codeloop/wiki/decisions/small-fixes-build.md', to: '.codeloop/wiki/decisions/add-a-trivial-size-that-enters-at-build.md', why: 'folded' },
    ]);
    expect(readdirSync(join(dir, '.codeloop/wiki/decisions')).filter(f => f.endsWith('.md'))).toEqual(['add-a-trivial-size-that-enters-at-build.md']);
    const page = listPages(dir).find(p => p.kind === 'decision')!;
    expect(page.scope).toEqual(['src/export.ts']);
    expect(page.body).toMatch(/## Why/);
    expect(page.body).toMatch(/## Consequences/);
  });
});

describe('a decision made from research', () => {
  it('takes its title from the chosen option, not the option letter', () => {
    const research = 'verdict: build\nPain: accountants retype totals.\n\n## Options\n\n- A. One CSV per month, written by `src/export.ts`. **Chosen.**\n- B. One XLSX workbook per year.\n';
    expect(decisionFromResearch(dir, card('c-001', 'Invoices export to CSV'), research)?.input.title).toBe('One CSV per month, written by src/export.ts');
  });
});

describe('the read side', () => {
  it('check wiki-landed fails a research with options and no decision page, then passes once the page exists', () => {
    write('specs/001/research.md', 'verdict: build\n\n## Options\n\n- One CSV per month. Chosen.\n- One XLSX per year.\n');
    expect(wikiLanded(dir, 'c-001')).toEqual(['c-001 compared options in specs/001/research.md but no decision page carries the card, and the research cannot make one: decision needs scope files']);
    capture(dir, { kind: 'decision', title: 'Export one CSV per month', scope: ['src/export.ts'], body: DECISION, card: 'c-001' });
    expect(wikiLanded(dir, 'c-001')).toEqual([]);
  });

  it('a brief for a card whose title matches a page injects it, and asks for read: lines', () => {
    capture(dir, { kind: 'decision', title: 'Accountants get invoices as one CSV per month', scope: ['src/elsewhere.ts'], body: DECISION });
    const c = readCards(dir).cards.find(x => x.id === 'c-002')!;
    const brief = buildBrief(dir, c);
    expect(brief).toMatch(/### Accountants get invoices as one CSV per month/);
    expect(brief).toMatch(/end your output with one `read: <wiki page path>` line/);
  });
});
