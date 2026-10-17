import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readCards } from '../cards.js';
import { acceptAllAnswers, addQuestions, parseQuestions, questionProblems, recommendedText, writeAnswer } from '../interview.js';
import { createApp } from '../server.js';

let dir: string;
function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}
const card = (id: string) => ({ id, title: `Card ${id}`, lane: 'build', laneVersion: 1, stage: 'interview', retries: {}, evidence: [], events: [], createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z', spec: 'specs/001' });

const FORK = `## Q1 Which file format do accountants import?
options:
- A: CSV with one row per invoice
- B: XLSX with a sheet per month
recommended: A
answer:

## Q2 Where does the export button live?
recommended: the invoices list toolbar
answer:

## Q3 Name the file by?
options:
- A: the date
- B: the quarter
- C: the customer
recommended: B
answer:

## Q4 Already decided?
recommended: yes
answer: yes, keep it
`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-options-'));
  write('.codeloop/cards.json', JSON.stringify({ version: 1, cards: [card('c-001')] }, null, 2));
  write('specs/001/interview.md', FORK);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('questions with options', () => {
  it('parses options and resolves a recommended letter to its text', () => {
    const [q1, q2] = parseQuestions(FORK);
    expect(q1.options).toEqual([{ key: 'A', text: 'CSV with one row per invoice' }, { key: 'B', text: 'XLSX with a sheet per month' }]);
    expect(recommendedText(q1)).toBe('CSV with one row per invoice');
    expect(q2.options).toBeUndefined();
    expect(recommendedText(q2)).toBe('the invoices list toolbar');
  });

  it('refuses a recommended letter with no matching option, when asked and when checked', () => {
    expect(() => addQuestions(dir, 'c-001', [{ question: 'Q?', options: ['one', 'two'], recommended: 'C' }])).toThrow(/recommends C, which is not one of its options/);
    write('specs/001/interview.md', FORK.replace('recommended: B\n', 'recommended: D\n'));
    expect(questionProblems(parseQuestions(readFileSync(join(dir, 'specs/001/interview.md'), 'utf-8')))).toEqual(['Q3 recommends D, which is not one of its options (A, B, C)']);
  });

  it('answers with an option by letter, and the file round-trips its options', () => {
    writeAnswer(dir, 'c-001', 3, { option: 'C' });
    const q3 = parseQuestions(readFileSync(join(dir, 'specs/001/interview.md'), 'utf-8')).find(q => q.n === 3)!;
    expect(q3.answer).toBe('the customer');
    expect(q3.options).toHaveLength(3);
  });

  it('accept all answers every open question with its recommendation in one write and keeps a written answer as written', () => {
    const { answered, skipped } = acceptAllAnswers(dir, 'c-001');
    expect(answered.map(q => [q.n, q.answer])).toEqual([[1, 'CSV with one row per invoice'], [2, 'the invoices list toolbar'], [3, 'the quarter'], [4, 'yes, keep it']]);
    expect(skipped).toEqual([]);
    const after = parseQuestions(readFileSync(join(dir, 'specs/001/interview.md'), 'utf-8'));
    expect(after.find(q => q.n === 4)!.answer).toBe('yes, keep it');
    expect(readCards(dir).cards[0].events.filter(e => e.action === 'answer').map(e => e.actor)).toEqual(['owner', 'owner', 'owner', 'owner']);
  });

  it('POST accept-all returns the count, and the questions payload carries options', async () => {
    const { app } = createApp(dir, undefined, { token: 't', owner: true });
    const res = await app.request('/api/cards/c-001/questions/accept-all', { method: 'POST', headers: { 'x-codeloop-token': 't', 'content-type': 'application/json' }, body: '{}' });
    expect(res.status).toBe(200);
    const body = await res.json() as { accepted: number; questions: { n: number; options?: unknown[] }[] };
    expect(body.accepted).toBe(4);
    expect(body.questions.find(q => q.n === 1)!.options).toHaveLength(2);
  });
});

describe('accept all through the SDK', () => {
  it('answers the same way over http and in process', async () => {
    const { createHttpClient } = await import('../../sdk/http.js');
    const { createLocalClient } = await import('../../sdk/local.js');
    const { app } = createApp(dir, undefined, { token: 't', owner: true });
    const http = createHttpClient({ token: 't', fetch: (url, init) => app.request(url, init) });
    const viaHttp = await http.questions.acceptAll('c-001');
    expect(viaHttp.accepted).toBe(4);
    write('.codeloop/cards.json', JSON.stringify({ version: 1, cards: [card('c-001')] }, null, 2));
    write('specs/001/interview.md', FORK);
    const viaLocal = await createLocalClient(dir).questions.acceptAll('c-001', { as: 'owner' });
    expect(viaLocal.accepted).toBe(4);
    expect(viaLocal.questions.map(q => q.answer)).toEqual(viaHttp.questions.map(q => q.answer));
  });
});

describe('an answer is a person\'s decision', () => {
  it('check questions refuses an answer written into the file with no answer event from a person', async () => {
    const { questionsNotDecided } = await import('../interview.js');
    // An agent filled the answer lines itself: no answer events on the card.
    write('specs/001/interview.md', FORK.replace(/^answer:$/gm, 'answer: as recommended'));
    expect(questionsNotDecided(dir, 'c-001')).toEqual([1, 2, 3, 4]);
    // The owner's accept records one event per question.
    write('specs/001/interview.md', FORK);
    acceptAllAnswers(dir, 'c-001');
    writeAnswer(dir, 'c-001', 4, { text: 'yes, keep it' });
    expect(questionsNotDecided(dir, 'c-001')).toEqual([]);
  });
});

describe('answers an agent wrote into interview.md', () => {
  it('check questions refuses them, accept-all accepts them as written, and the rubric lines survive', async () => {
    const { runCli } = await import('../../__tests__/cli.js');
    const rubric = '## Rubric\n- I2 pass: specs/001/interview.md tags each question\n';
    write('specs/001/interview.md', `# Interview\n\n${FORK}\n${rubric}`);
    const env = { ...process.env, CODELOOP_CARD: '', CODELOOP_ROLE: 'owner' };
    const cli = (...args: string[]) => runCli(args, { cwd: dir, encoding: 'utf-8', env });
    expect(cli('check', 'questions', 'c-001').stdout + cli('check', 'questions', 'c-001').stderr).toMatch(/Q4 has an answer no person gave/);
    const accepted = cli('answer', 'c-001', '--accept-all');
    expect(accepted.stdout).toMatch(/accepted 4/);
    const text = readFileSync(join(dir, 'specs/001/interview.md'), 'utf-8');
    expect(text.startsWith('# Interview\n')).toBe(true);
    expect(text.endsWith(rubric)).toBe(true);
    expect(parseQuestions(text).find(q => q.n === 4)!.answer).toBe('yes, keep it');
    const check = cli('check', 'questions', 'c-001');
    expect(check.stdout + check.stderr).not.toMatch(/Q\d/);
    expect(check.status).toBe(0);
  });
});
