import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { createLocalClient, interviewQuestions, MAX_QUESTIONS, parseQuestions, projectRoot } from '../sdk/local.js';
import { guard, refuse } from './guard.js';

export const askCommand = new Command('ask')
  .description(`Ask the owner up to ${MAX_QUESTIONS} interview questions about a card (review and gap questions do not count): \`codeloop ask <card> "<question>" --recommended "<answer>"\`, or --file with \`## Q1\` blocks`)
  .argument('<card>')
  .argument('[question]')
  .option('--recommended <answer>', 'The answer to take when the owner has no better one; with options, its letter')
  .option('--option <text>', 'One choice, when the fork is real; repeat for two to four (lettered A, B, C, D)', (v: string, all: string[] = []) => [...all, v])
  .option('--file <path>', 'A markdown file of `## Q<n> <question>` / `recommended:` blocks')
  .option('--kind <kind>', 'interview (default), review (a review finding) or gap (a stage the merged work left unfilled)')
  .option('--as <role>', 'owner | reviewer | agent')
  .action(guard(async (card: string, question: string | undefined, opts: { recommended?: string; option?: string[]; file?: string; as?: string; kind?: 'interview' | 'review' | 'gap' }) => {
    const kind = opts.kind ? { kind: opts.kind } : {};
    const items = (opts.file ? fromFile(opts.file) : question ? [{ question, recommended: opts.recommended, ...(opts.option?.length ? { options: opts.option } : {}) }] : []).map(i => ({ ...kind, ...i }));
    if (!items.length) throw refuse('say the question, or --file <path> with `## Q1 <question>` blocks');
    const { path, added } = await createLocalClient(projectRoot()).questions.ask(card, items, { as: opts.as });
    for (const q of added) {
      console.log(`  Q${q.n} ${q.question}${q.recommended ? `  (recommended: ${q.recommended})` : ''}`);
      for (const o of q.options ?? []) console.log(`      ${o.key}: ${o.text}`);
    }
    console.log(`Next: the owner answers with \`codeloop answer ${card} <n> "<text>"\`, \`--option <letter>\` or \`--accept\`, or takes every recommendation with \`codeloop answer ${card} --accept-all\`; the questions are in ${path}.`);
  }));

function fromFile(path: string): { question: string; recommended: string; options?: string[]; kind?: 'interview' | 'review' | 'gap' }[] {
  if (!existsSync(path)) throw refuse(`${path} does not exist`);
  const questions = parseQuestions(readFileSync(path, 'utf-8'));
  if (!questions.length) throw refuse(`${path} has no \`## Q<n> <question>\` blocks`);
  const interview = interviewQuestions(questions).length;
  if (interview > MAX_QUESTIONS) throw refuse(`${path} has ${interview} interview questions, the limit is ${MAX_QUESTIONS}: ask only what changes the build`);
  return questions.map(q => ({ question: q.question, recommended: q.recommended, ...(q.options?.length ? { options: q.options.map(o => o.text) } : {}), ...(q.kind ? { kind: q.kind } : {}) }));
}

export const answerCommand = new Command('answer')
  .description('Answer a question on a card: `codeloop answer <card> <n> "<text>"`, `--accept` for the recommended answer, `--option B` for an option, or `codeloop answer <card> --accept-all`')
  .argument('<card>')
  .argument('[n]')
  .argument('[text]')
  .option('--accept', 'Take the recommended answer')
  .option('--option <letter>', 'Answer with that option, by its letter')
  .option('--accept-all', 'Take the recommended answer on every open question of the card, in one write')
  .option('--as <role>', 'owner | reviewer | agent')
  .action(guard(async (card: string, n: string | undefined, text: string | undefined, opts: { accept?: boolean; option?: string; acceptAll?: boolean; as?: string }) => {
    const client = createLocalClient(projectRoot());
    if (opts.acceptAll) {
      const result = await client.questions.acceptAll(card, { as: opts.as });
      for (const q of result.questions.filter(x => x.answer)) console.log(`  Q${q.n}: ${q.answer}`);
      console.log(`  accepted ${result.accepted} recommendation${result.accepted === 1 ? '' : 's'}${result.skipped.length ? `; no recommendation on ${result.skipped.map(x => `Q${x}`).join(', ')}, answer those yourself` : ''}`);
      return;
    }
    if (!n) throw refuse('give a question number, or --accept-all');
    const number = parseInt(n.replace(/^q/i, ''), 10);
    if (!Number.isInteger(number) || number < 1) throw refuse(`"${n}" is not a question number`);
    const q = await client.questions.answer(card, number, { text, accept: opts.accept, ...(opts.option ? { option: opts.option } : {}) }, { as: opts.as });
    console.log(`  Q${q.n} answered: ${q.answer}`);
  }));
