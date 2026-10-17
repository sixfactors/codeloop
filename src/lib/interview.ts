import { onBoardTree } from './project-root.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { findCard, readCards, RefusalError, type Card } from './cards.js';
import { recordEvent, type Role } from './engine.js';
import { withLock } from './lock.js';
import { newSpec, resolveSpecDir } from './spec.js';

export const INTERVIEW = 'interview.md';
/**
 * More than five interview questions means the asker has not decided what matters; the owner
 * answers in minutes, not an afternoon. Review and gap questions (the review pass, a reviewer's
 * findings) are not the interview and do not count against it.
 */
export const MAX_QUESTIONS = 5;

export const QUESTION_KINDS = ['interview', 'review', 'gap'] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

/** One choice on a question with a real fork: a letter and its text. */
export interface QuestionOption {
  key: string;
  text: string;
}

export interface Question {
  n: number;
  question: string;
  /** Two to four lettered choices, when the question has a real fork. */
  options?: QuestionOption[];
  /** An option's letter when there are options, or free text. */
  recommended: string;
  answer: string;
  /** Absent for an interview question; a `kind:` line in the file otherwise. */
  kind?: QuestionKind;
}

/** The question's kind: its `kind:` line, else review for a `Review:` question (the review pass), else interview. */
export const questionKind = (q: Pick<Question, 'question' | 'kind'>): QuestionKind => q.kind ?? (q.question.startsWith('Review:') ? 'review' : 'interview');
export const interviewQuestions = <T extends Pick<Question, 'question' | 'kind'>>(qs: T[]): T[] => qs.filter(q => questionKind(q) === 'interview');

const LETTER = /^[A-Z]$/;

/** The recommended answer as text: an option's letter resolves to that option. Refused for a letter with no option. */
export function recommendedText(q: Question): string {
  if (!q.options?.length || !LETTER.test(q.recommended)) return q.recommended;
  const option = q.options.find(o => o.key === q.recommended);
  if (!option) throw new RefusalError(`Q${q.n} recommends ${q.recommended}, which is not one of its options (${q.options.map(o => o.key).join(', ')})`);
  return option.text;
}

/** What is wrong with a set of questions: a recommended letter no option carries, or an option count outside two to four. */
export function questionProblems(questions: Question[]): string[] {
  const problems: string[] = [];
  for (const q of questions) {
    if (q.options && (q.options.length < 2 || q.options.length > 4)) problems.push(`Q${q.n} has ${q.options.length} options; give two to four, or none`);
    try {
      recommendedText(q);
    } catch (e) {
      problems.push((e as Error).message);
    }
  }
  return problems;
}

/**
 * The questions in a markdown file: `## Q<n> <question>`, then optional `options:` with `- A: <text>`
 * lines, then `recommended:` and `answer:` lines.
 */
export function parseQuestions(text: string): Question[] {
  const questions: Question[] = [];
  let inOptions = false;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const head = /^## Q(\d+)\s+(.*)$/.exec(line);
    if (head) {
      questions.push({ n: parseInt(head[1], 10), question: head[2].trim(), recommended: '', answer: '' });
      inOptions = false;
      continue;
    }
    const last = questions.at(-1);
    if (!last) continue;
    if (/^options:\s*$/.test(line)) {
      last.options = [];
      inOptions = true;
      continue;
    }
    const option = inOptions ? /^\s*-\s+([A-Z]):\s*(.*)$/.exec(line) : null;
    if (option) {
      last.options!.push({ key: option[1], text: option[2].trim() });
      continue;
    }
    const kind = /^kind:\s*(\S+)\s*$/.exec(line);
    if (kind && (QUESTION_KINDS as readonly string[]).includes(kind[1])) {
      inOptions = false;
      if (kind[1] !== 'interview') last.kind = kind[1] as QuestionKind;
      continue;
    }
    const field = /^(recommended|answer):\s*(.*)$/.exec(line);
    if (field) {
      inOptions = false;
      last[field[1] as 'recommended' | 'answer'] = field[2].trim();
    }
  }
  return questions;
}

function block(q: Question): string {
  const options = q.options?.length ? `options:\n${q.options.map(o => `- ${o.key}: ${o.text}`).join('\n')}\n` : '';
  return `## Q${q.n} ${q.question}\n${q.kind && q.kind !== 'interview' ? `kind: ${q.kind}\n` : ''}${options}recommended: ${q.recommended}\nanswer: ${q.answer}\n`;
}

/** The markdown `parseQuestions` reads back. */
export const renderQuestions = (questions: Question[]) => questions.map(block).join('\n');

/**
 * The file with its questions replaced by `questions`, keeping everything that is not a question:
 * the text before the first one and every section under another heading (the `## Rubric` lines at
 * the end), so writing an answer never drops what the agent wrote around the questions.
 */
function rewrite(text: string, questions: Question[]): string {
  const prefix: string[] = [];
  const rest: string[] = [];
  let seen = false;
  let inQuestion = false;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (/^## Q\d+\s/.test(line)) {
      seen = inQuestion = true;
      continue;
    }
    if (/^#{1,6}\s/.test(line) && seen) inQuestion = false;
    if (!seen) prefix.push(line);
    else if (!inQuestion) rest.push(line);
  }
  const head = prefix.join('\n').replace(/\n+$/, '');
  const tail = rest.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
  return `${head ? `${head}\n\n` : ''}${renderQuestions(questions)}${tail ? `\n${tail}\n` : ''}`;
}

/** `<spec dir>/interview.md`, or undefined when the card has no spec folder yet. */
export function interviewPath(projectDir: string, card: Card): string | undefined {
  try {
    return `${onBoardTree(() => resolveSpecDir(projectDir, card.id))}/${INTERVIEW}`;
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
 * folder yet, so one is made the way `start` makes it. Refused past MAX_QUESTIONS interview questions.
 */
export function addQuestions(projectDir: string, ref: string, items: { question: string; recommended?: string; options?: string[]; kind?: QuestionKind }[], role: Role = 'agent'): { path: string; added: Question[] } {
  const card = findCard(readCards(projectDir).cards, ref);
  if (items.length === 0) throw new RefusalError('no questions to add');
  if (items.some(i => !i.question.trim())) throw new RefusalError('a question cannot be empty');
  const badKind = items.find(i => i.kind !== undefined && !(QUESTION_KINDS as readonly string[]).includes(i.kind));
  if (badKind) throw new RefusalError(`kind "${badKind.kind}" is not ${QUESTION_KINDS.join(', ')}`);
  const path = interviewPath(projectDir, card) ?? `${onBoardTree(() => newSpec(projectDir, card.id, role)).dir}/${INTERVIEW}`;
  const file = join(projectDir, path);
  return withLock(file, () => {
    const existing = existsSync(file) ? parseQuestions(readFileSync(file, 'utf-8')) : [];
    const asking = interviewQuestions(items.map(i => ({ ...i, question: i.question.trim() })));
    const total = interviewQuestions(existing).length + asking.length;
    if (asking.length && total > MAX_QUESTIONS) {
      throw new RefusalError(`${total} interview questions would be on ${card.id}, the limit is ${MAX_QUESTIONS}: ask only what changes the build (a review finding takes \`--kind review\` and does not count)`);
    }
    const last = existing.reduce((m, q) => Math.max(m, q.n), 0);
    const added: Question[] = items.map((i, at) => ({
      n: last + at + 1,
      question: i.question.trim(),
      ...(i.options?.length ? { options: i.options.map((text, k) => ({ key: String.fromCharCode(65 + k), text: text.trim() })) } : {}),
      recommended: (i.recommended ?? '').trim(),
      answer: '',
      ...(i.kind && i.kind !== 'interview' ? { kind: i.kind } : {}),
    }));
    const problems = questionProblems(added);
    if (problems.length) throw new RefusalError(problems.join('; '));
    writeFileSync(file, rewrite(existsSync(file) ? readFileSync(file, 'utf-8') : '', [...existing, ...added]));
    return { path, added };
  });
}

/**
 * Writes the owner's answer to question `n`; `accept` takes the recommended one. The answer is a
 * decision a person made, so the card event is marked human whatever role the caller claimed.
 */
export function writeAnswer(projectDir: string, ref: string, n: number, answer: { text?: string; accept?: boolean; option?: string }, role: Role = 'owner'): Question {
  const card = findCard(readCards(projectDir).cards, ref);
  const path = interviewPath(projectDir, card);
  const file = path && join(projectDir, path);
  if (!file || !existsSync(file)) throw new RefusalError(`${card.id} has no questions; \`codeloop ask ${card.id} "<question>"\` adds one`);
  const written = withLock(file, () => {
    const original = readFileSync(file, 'utf-8');
    const questions = parseQuestions(original);
    const q = questions.find(x => x.n === n);
    if (!q) throw new RefusalError(`${card.id} has no question Q${n} (${questions.length ? questions.map(x => `Q${x.n}`).join(', ') : 'none'})`);
    let text: string;
    if (answer.option) {
      const chosen = q.options?.find(o => o.key === answer.option!.trim().toUpperCase());
      if (!chosen) throw new RefusalError(`Q${n} has no option ${answer.option}${q.options?.length ? ` (options: ${q.options.map(o => o.key).join(', ')})` : '; it has no options'}`);
      text = chosen.text;
    } else {
      text = answer.accept ? recommendedText(q) : (answer.text ?? '').trim();
    }
    if (!text) throw new RefusalError(answer.accept ? `Q${n} has no recommended answer to accept` : 'an answer cannot be empty');
    q.answer = text;
    writeFileSync(file, rewrite(original, questions));
    return q;
  });
  recordEvent(projectDir, card.id, () => ({ action: 'answer', actor: role, human: true, note: `Q${n}: ${written.answer}` }));
  return written;
}

/**
 * Accepts every undecided question of the card in one locked write, one answer event per question.
 * An answer line an agent wrote (an answer no person's event stands behind) is accepted as written;
 * otherwise the recommendation is. A question with neither is skipped and named; one a person
 * already answered is left alone.
 */
export function acceptAllAnswers(projectDir: string, ref: string, role: Role = 'owner'): { answered: Question[]; skipped: Question[] } {
  const card = findCard(readCards(projectDir).cards, ref);
  const path = interviewPath(projectDir, card);
  const file = path && join(projectDir, path);
  if (!file || !existsSync(file)) throw new RefusalError(`${card.id} has no questions`);
  const decided = decidedNumbers(card);
  const result = withLock(file, () => {
    const original = readFileSync(file, 'utf-8');
    const questions = parseQuestions(original);
    const open = questions.filter(q => !q.answer || !decided.has(q.n));
    // Resolve every recommendation first, so a bad letter refuses before anything is written.
    const resolved = open.map(q => ({ q, written: Boolean(q.answer), text: q.answer || recommendedText(q) }));
    const answered: (Question & { written: boolean })[] = [];
    const skipped: Question[] = [];
    for (const { q, written, text } of resolved) {
      if (!text) {
        skipped.push(q);
        continue;
      }
      q.answer = text;
      answered.push({ ...q, written });
    }
    if (answered.some(q => !q.written)) writeFileSync(file, rewrite(original, questions));
    return { answered, skipped };
  });
  for (const q of result.answered) recordEvent(projectDir, card.id, () => ({ action: 'answer', actor: role, human: true, note: `Q${q.n}: ${q.answer} (${q.written ? 'accepted the written answer' : 'accepted the recommendation'})` }));
  return { answered: result.answered.map(({ written: _w, ...q }) => q), skipped: result.skipped };
}

const decidedNumbers = (card: Card): Set<number> =>
  new Set(
    card.events
      .filter(e => e.action === 'answer' && e.human)
      .map(e => /^Q(\d+):/.exec(e.note ?? '')?.[1])
      .filter((n): n is string => Boolean(n))
      .map(Number),
  );

/**
 * Answered questions with no answer event from a person behind them: an answer line written into
 * interview.md by an agent is not the owner's decision, so the interview gate must not count it.
 */
export function questionsNotDecided(projectDir: string, ref: string): number[] {
  const card = findCard(readCards(projectDir).cards, ref);
  const decided = decidedNumbers(card);
  return readQuestions(projectDir, card).filter(q => q.answer && !decided.has(q.n)).map(q => q.n);
}
