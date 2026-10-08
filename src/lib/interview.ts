import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { findCard, readCards, RefusalError, type Card } from './cards.js';
import { recordEvent, type Role } from './engine.js';
import { withLock } from './lock.js';
import { newSpec, resolveSpecDir } from './spec.js';

export const INTERVIEW = 'interview.md';
/** More than five means the asker has not decided what matters; the owner answers in minutes, not an afternoon. */
export const MAX_QUESTIONS = 5;

export interface Question {
  n: number;
  question: string;
  recommended: string;
  answer: string;
}

/** The questions in a markdown file: `## Q<n> <question>`, then `recommended:` and `answer:` lines. */
export function parseQuestions(text: string): Question[] {
  const questions: Question[] = [];
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const head = /^## Q(\d+)\s+(.*)$/.exec(line);
    if (head) {
      questions.push({ n: parseInt(head[1], 10), question: head[2].trim(), recommended: '', answer: '' });
      continue;
    }
    const last = questions.at(-1);
    if (!last) continue;
    const field = /^(recommended|answer):\s*(.*)$/.exec(line);
    if (field) last[field[1] as 'recommended' | 'answer'] = field[2].trim();
  }
  return questions;
}

function block(q: Question): string {
  return `## Q${q.n} ${q.question}\nrecommended: ${q.recommended}\nanswer: ${q.answer}\n`;
}

/** The markdown `parseQuestions` reads back. */
export const renderQuestions = (questions: Question[]) => questions.map(block).join('\n');
const render = renderQuestions;

/** `<spec dir>/interview.md`, or undefined when the card has no spec folder yet. */
export function interviewPath(projectDir: string, card: Card): string | undefined {
  try {
    return `${resolveSpecDir(projectDir, card.id)}/${INTERVIEW}`;
  } catch (e) {
    if (e instanceof RefusalError) return undefined;
    throw e;
  }
}

export function readQuestions(projectDir: string, card: Card): Question[] {
  const path = interviewPath(projectDir, card);
  const file = path && join(projectDir, path);
  return file && existsSync(file) ? parseQuestions(readFileSync(file, 'utf-8')) : [];
}

export const openQuestions = (projectDir: string, card: Card) => readQuestions(projectDir, card).filter(q => !q.answer);

/**
 * Appends questions to the card's interview.md, numbering on from the last. A proposal has no spec
 * folder yet, so one is made the way `start` makes it. Refused past MAX_QUESTIONS in all.
 */
export function addQuestions(projectDir: string, ref: string, items: { question: string; recommended?: string }[], role: Role = 'agent'): { path: string; added: Question[] } {
  const card = findCard(readCards(projectDir).cards, ref);
  if (items.length === 0) throw new RefusalError('no questions to add');
  if (items.some(i => !i.question.trim())) throw new RefusalError('a question cannot be empty');
  const path = interviewPath(projectDir, card) ?? `${newSpec(projectDir, card.id, role).dir}/${INTERVIEW}`;
  const file = join(projectDir, path);
  return withLock(file, () => {
    const existing = existsSync(file) ? parseQuestions(readFileSync(file, 'utf-8')) : [];
    if (existing.length + items.length > MAX_QUESTIONS) {
      throw new RefusalError(`${existing.length + items.length} questions would be on ${card.id}, the limit is ${MAX_QUESTIONS}: ask only what changes the build`);
    }
    const last = existing.reduce((m, q) => Math.max(m, q.n), 0);
    const added = items.map((i, at) => ({ n: last + at + 1, question: i.question.trim(), recommended: (i.recommended ?? '').trim(), answer: '' }));
    writeFileSync(file, render([...existing, ...added]));
    return { path, added };
  });
}

/**
 * Writes the owner's answer to question `n`; `accept` takes the recommended one. The answer is a
 * decision a person made, so the card event is marked human whatever role the caller claimed.
 */
export function writeAnswer(projectDir: string, ref: string, n: number, answer: { text?: string; accept?: boolean }, role: Role = 'owner'): Question {
  const card = findCard(readCards(projectDir).cards, ref);
  const path = interviewPath(projectDir, card);
  const file = path && join(projectDir, path);
  if (!file || !existsSync(file)) throw new RefusalError(`${card.id} has no questions; \`codeloop ask ${card.id} "<question>"\` adds one`);
  const written = withLock(file, () => {
    const questions = parseQuestions(readFileSync(file, 'utf-8'));
    const q = questions.find(x => x.n === n);
    if (!q) throw new RefusalError(`${card.id} has no question Q${n} (${questions.length ? questions.map(x => `Q${x.n}`).join(', ') : 'none'})`);
    const text = answer.accept ? q.recommended : (answer.text ?? '').trim();
    if (!text) throw new RefusalError(answer.accept ? `Q${n} has no recommended answer to accept` : 'an answer cannot be empty');
    q.answer = text;
    writeFileSync(file, render(questions));
    return q;
  });
  recordEvent(projectDir, card.id, () => ({ action: 'answer', actor: role, human: true, note: `Q${n}: ${written.answer}` }));
  return written;
}
