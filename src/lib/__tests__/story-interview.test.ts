import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { findCard, readCards, RefusalError } from '../cards.js';
import { proposeCard, rejectCard } from '../engine.js';
import { startCard } from '../flow.js';
import { buildInbox } from '../inbox.js';
import { addQuestions, readQuestions, writeAnswer } from '../interview.js';
import { checkMock, newMock } from '../mock.js';
import { createApp } from '../server.js';
import { checkSpec } from '../spec.js';
import { checkStory, listFilter, migrateStories, parseStoryDescription, storyFields, titleProblems } from '../story.js';

let dir: string;

const read = (path: string) => readFileSync(join(dir, path), 'utf-8');
function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}
const SPEC = 'specs/001-add-csv-export';
const STORY = { persona: 'founder', can: 'export the list as CSV', so: 'I can hand it to finance' };
const post = ({ app, token }: ReturnType<typeof createApp>, path: string, body: object = {}) =>
  app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-codeloop-token': token }, body: JSON.stringify(body) });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-story-'));
  write('.codeloop/lanes/build.yaml', readFileSync(resolve('templates/lanes/build.yaml'), 'utf-8'));
  write('.codeloop/config.yaml', 'project:\n  name: "Acme App"\n');
  startCard(dir, { lane: 'build', title: 'Add CSV export', id: 'c-001', fields: storyFields('Add CSV export', { ...STORY, size: 'M', points: '3', initiative: 'finance-self-serve', metric: 'exports per week' }) });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('story standard', () => {
  it('refuses a technical title and takes a plain one', () => {
    expect(titleProblems('Size-adaptive lanes: investigate stage sets size, stages carry when:')).toEqual(['title carries ":": name what the user can now do, not the mechanism']);
    expect(titleProblems('Importers: BMAD tickets.toml --force and resolveSpecDir()')).toHaveLength(2);
    expect(titleProblems('Small fixes skip the ceremony')).toEqual([]);
    expect(() => storyFields('Fix lanes/build.yaml', {})).toThrow(RefusalError);
    expect(storyFields('Fix lanes/build.yaml', { force: true })).toEqual({});
  });

  it('refuses a story missing its so-that, and card new carries the fields', () => {
    expect(() => storyFields('Export the list', { persona: 'founder', can: 'export' })).toThrow(/all three parts/);
    expect(() => storyFields('Export the list', { ...STORY, size: 'XL' })).toThrow(/not S, M or L/);
    expect(() => storyFields('Export the list', { ...STORY, points: '4' })).toThrow(/not one of 1, 2, 3, 5, 8/);
    const card = findCard(readCards(dir).cards, 'c-001');
    expect(card).toMatchObject({ story: { as: 'founder', can: STORY.can, so: STORY.so }, persona: 'founder', size: 'M', points: 3, initiative: 'finance-self-serve', metric: 'exports per week' });
    expect(checkStory(dir, card)).toEqual([]);
    expect(checkStory(dir, { ...card, persona: 'wizard', story: { ...card.story!, as: 'wizard' } })[0]).toMatch(/persona "wizard" is not known/);
    write('.codeloop/config.yaml', 'personas:\n  - name: wizard\n');
    expect(checkStory(dir, { ...card, persona: 'wizard', story: { ...card.story!, as: 'wizard' } })).toEqual([]);
  });

  it('refuses an L at the spec gate', () => {
    write(`${SPEC}/spec.md`, read(`${SPEC}/spec.md`).replace(/^- US1 .*$/m, '- US1 Given a list, when I export, then a CSV downloads.'));
    write(`${SPEC}/tasks.md`, read(`${SPEC}/tasks.md`) + '\n- [ ] T001 [US1] [api] Export endpoint\n');
    expect(checkSpec(dir, SPEC)).toEqual([]);
    write(`${SPEC}/spec.md`, read(`${SPEC}/spec.md`).replace(/^size:.*$/m, 'size: L'));
    expect(checkSpec(dir, SPEC)).toEqual(['c-001 is size L: split it into S or M children with `epic: c-001` before the spec gate']);
  });

  it('list hides dropped proposals unless --all, and filters on the story fields', () => {
    proposeCard(dir, { lane: 'build', title: 'Try a dark theme', fields: { persona: 'visitor', size: 'S' } });
    const dropped = proposeCard(dir, { lane: 'build', title: 'Remove the footer' }).card;
    rejectCard(dir, dropped.id, 'owner', 'not now');
    const ids = (cards: { id: string }[]) => cards.map(c => c.id);
    expect(ids(listFilter(readCards(dir).cards, {}))).toEqual(['c-001', 'c-002']);
    expect(ids(listFilter(readCards(dir).cards, { all: true }))).toEqual(['c-001', 'c-002', 'c-003']);
    expect(ids(listFilter(readCards(dir).cards, { persona: 'visitor' }))).toEqual(['c-002']);
    expect(ids(listFilter(readCards(dir).cards, { size: 'm', points: '3' }))).toEqual(['c-001']);
  });

  it('migrates the one-line proposal description into fields and keeps the description', () => {
    const description = 'As a founder, I can split a card into two or three children under one epic, so that each piece ships in under a week. Initiative: founder ships without ceremony · S · metric: cards over one week';
    expect(parseStoryDescription(description)).toEqual({ story: { as: 'founder', can: 'split a card into two or three children under one epic', so: 'each piece ships in under a week' }, persona: 'founder', size: 'S', initiative: 'founder ships without ceremony', metric: 'cards over one week' });
    expect(parseStoryDescription('Seen on the pricing page: the button is grey')).toBeUndefined();
    const { card } = proposeCard(dir, { lane: 'build', title: 'Split a card that is too big', description });
    expect(migrateStories(dir)).toEqual([card.id]);
    expect(findCard(readCards(dir).cards, card.id)).toMatchObject({ description, size: 'S', persona: 'founder' });
    expect(migrateStories(dir)).toEqual([]);
  });
});

describe('questions', () => {
  it('ask refuses a sixth question, and a proposal gets its spec folder', () => {
    const { card } = proposeCard(dir, { lane: 'build', title: 'Try a dark theme' });
    const { path } = addQuestions(dir, card.id, [{ question: 'Dark by default?', recommended: 'no' }]);
    expect(path).toBe('specs/002-try-a-dark-theme/interview.md');
    expect(read(path)).toBe('## Q1 Dark by default?\nrecommended: no\nanswer: \n');
    addQuestions(dir, card.id, [2, 3, 4, 5].map(n => ({ question: `Q number ${n}` })));
    expect(() => addQuestions(dir, card.id, [{ question: 'One more' }])).toThrow(/6 questions would be on c-002, the limit is 5/);
    expect(readQuestions(dir, findCard(readCards(dir).cards, card.id)).map(q => q.n)).toEqual([1, 2, 3, 4, 5]);
  });

  it('answer writes the file, records a human event, and leaves the inbox section', () => {
    addQuestions(dir, 'c-001', [{ question: 'Which columns?', recommended: 'all visible ones' }, { question: 'Limit rows?' }]);
    expect(buildInbox(dir).questions).toEqual([{ id: 'c-001', title: 'Add CSV export', lane: 'build', stage: 'research', open: 2, first: 'Which columns?' }]);

    expect(writeAnswer(dir, 'c-001', 1, { accept: true })).toMatchObject({ n: 1, answer: 'all visible ones' });
    expect(() => writeAnswer(dir, 'c-001', 2, { accept: true })).toThrow(/no recommended answer/);
    expect(() => writeAnswer(dir, 'c-001', 3, { text: 'x' })).toThrow(/no question Q3/);
    writeAnswer(dir, 'c-001', 2, { text: 'cap at 10k' });
    expect(read(`${SPEC}/interview.md`)).toContain('## Q2 Limit rows?\nrecommended: \nanswer: cap at 10k\n');
    const events = findCard(readCards(dir).cards, 'c-001').events.filter(e => e.action === 'answer');
    expect(events).toMatchObject([{ actor: 'owner', human: true, note: 'Q1: all visible ones' }, { human: true, note: 'Q2: cap at 10k' }]);
    expect(buildInbox(dir).questions).toEqual([]);
  });

  it('the API lists questions on every card and takes an answer only as owner with the token', async () => {
    addQuestions(dir, 'c-001', [{ question: 'Which columns?', recommended: 'all visible ones' }]);
    const reader = createApp(dir);
    const cards = await (await reader.app.request('/api/cards')).json();
    expect(cards.cards[0]).toMatchObject({ id: 'c-001', openQuestions: 1, size: 'M', story: { as: 'founder' } });
    expect(await (await reader.app.request('/api/cards/c-001/questions')).json()).toEqual({ id: 'c-001', questions: [{ n: 1, question: 'Which columns?', recommended: 'all visible ones', answer: '' }] });
    expect((await reader.app.request('/api/cards/c-999/questions')).status).toBe(404);
    expect((await post(reader, '/api/cards/c-001/questions/1/answer', { accept: true })).status).toBe(403);

    const owner = createApp(dir, undefined, { owner: true });
    expect((await owner.app.request('/api/cards/c-001/questions/1/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"accept":true}' })).status).toBe(403);
    const answered = await post(owner, '/api/cards/c-001/questions/1/answer', { accept: true });
    expect(answered.status).toBe(200);
    expect((await answered.json()).questions[0].answer).toBe('all visible ones');
    expect((await post(owner, '/api/cards/c-001/questions/2/answer', { text: 'x' })).status).toBe(400);
  });
});

describe('mocks build on each other', () => {
  const screens = (spec: string, names: string) => write(`${spec}/spec.md`, read(`${spec}/spec.md`).replace(/^screens:.*$/m, `screens:\n${names}`));
  const draw = (path: string, name: string, body = '') => write(path, read(path).replace('  </main>', `    <section data-screen="${name}"><h2>${name}</h2>${body}</section>\n  </main>`));
  const M1 = 'docs/mocks/acme-app/exports/c-001.html';
  const M2 = 'docs/mocks/acme-app/exports/c-002.html';

  it('mock new copies the newest mock in the topic, marks each section data-from, and scaffolds the new screens', () => {
    screens(SPEC, '- export-dialog\n');
    newMock(dir, 'c-001', 'exports');
    expect(read(M1)).toContain('<!-- codeloop mock lineage: c-001 <- base -->');
    expect(read(M1)).not.toContain('data-from');
    draw(M1, 'export-dialog', '<div class="frame">CSV</div>');
    utimesSync(join(dir, M1), new Date('2026-09-01'), new Date('2026-09-01'));

    startCard(dir, { lane: 'build', title: 'Pick export columns', id: 'c-002' });
    screens('specs/002-pick-export-columns', '- export-dialog\n- column-picker\n');
    expect(newMock(dir, 'c-002', 'exports')).toEqual({ path: M2, created: true, from: 'c-001' });
    const html = read(M2);
    expect(html).toContain('<!-- codeloop mock lineage: c-002 <- c-001 <- base -->');
    expect(html).toContain('<section data-screen="export-dialog" data-from="c-001"><h2>export-dialog</h2><div class="frame">CSV</div></section>');
    expect(html).toContain('<section data-screen="column-picker" data-from="new">');
    expect(checkMock(dir, 'c-002')).toEqual([]);

    // Proposals have no spec folder, so their mocks are what the lineage alone decides.
    const c3 = proposeCard(dir, { lane: 'build', title: 'Schedule an export' }).card.id;
    expect(newMock(dir, c3, 'exports', 'none')).toEqual({ path: `docs/mocks/acme-app/exports/${c3}.html`, created: true });
    expect(read(`docs/mocks/acme-app/exports/${c3}.html`)).toContain(`lineage: ${c3} <- base`);
    const c4 = proposeCard(dir, { lane: 'build', title: 'Email an export' }).card.id;
    expect(() => newMock(dir, c4, 'exports', 'c-9')).toThrow(/not found/);
    expect(read(newMock(dir, c4, 'exports', 'c-002').path)).toContain(`lineage: ${c4} <- c-002 <- c-001 <- base`);
  });

  it('check mock fails when an inherited section was removed, unless the spec lists it under screens_removed', () => {
    screens(SPEC, '- export-dialog\n- export-done\n');
    newMock(dir, 'c-001', 'exports');
    draw(M1, 'export-dialog');
    draw(M1, 'export-done');
    startCard(dir, { lane: 'build', title: 'Pick export columns', id: 'c-002' });
    screens('specs/002-pick-export-columns', '- export-dialog\n');
    newMock(dir, 'c-002', 'exports');
    write(M2, read(M2).replace(/<section data-screen="export-done"[\s\S]*?<\/section>\n/, ''));
    expect(checkMock(dir, 'c-002')).toEqual([`${M2} dropped <section data-screen="export-done"> inherited from c-001; list it under \`screens_removed:\` in the spec if that is meant`]);
    write('specs/002-pick-export-columns/spec.md', read('specs/002-pick-export-columns/spec.md') + '\nscreens_removed:\n- export-done\n');
    expect(checkMock(dir, 'c-002')).toEqual([]);
  });
});
