import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { createLocalClient, MAX_QUESTIONS, parseQuestions } from '../sdk/local.js';
import { guard, refuse } from './guard.js';

export const askCommand = new Command('ask')
  .description(`Ask the owner up to ${MAX_QUESTIONS} questions about a card: \`codeloop ask <card> "<question>" --recommended "<answer>"\`, or --file with \`## Q1\` blocks`)
  .argument('<card>')
  .argument('[question]')
  .option('--recommended <answer>', 'The answer to take when the owner has no better one')
  .option('--file <path>', 'A markdown file of `## Q<n> <question>` / `recommended:` blocks')
  .option('--as <role>', 'owner | reviewer | agent')
  .action(guard(async (card: string, question: string | undefined, opts: { recommended?: string; file?: string; as?: string }) => {
    const items = opts.file ? fromFile(opts.file) : question ? [{ question, recommended: opts.recommended }] : [];
    if (!items.length) throw refuse('say the question, or --file <path> with `## Q1 <question>` blocks');
    const { path, added } = await createLocalClient(process.cwd()).questions.ask(card, items, { as: opts.as });
    for (const q of added) console.log(`  Q${q.n} ${q.question}${q.recommended ? `  (recommended: ${q.recommended})` : ''}`);
    console.log(`Next: the owner answers with \`codeloop answer ${card} <n> "<text>"\` or \`--accept\`; the questions are in ${path}.`);
  }));

function fromFile(path: string): { question: string; recommended: string }[] {
  if (!existsSync(path)) throw refuse(`${path} does not exist`);
  const questions = parseQuestions(readFileSync(path, 'utf-8'));
  if (!questions.length) throw refuse(`${path} has no \`## Q<n> <question>\` blocks`);
  if (questions.length > MAX_QUESTIONS) throw refuse(`${path} has ${questions.length} questions, the limit is ${MAX_QUESTIONS}: ask only what changes the build`);
  return questions.map(q => ({ question: q.question, recommended: q.recommended }));
}

export const answerCommand = new Command('answer')
  .description('Answer a question on a card: `codeloop answer <card> <n> "<text>"`, or `--accept` to take the recommended answer')
  .argument('<card>')
  .argument('<n>')
  .argument('[text]')
  .option('--accept', 'Take the recommended answer')
  .option('--as <role>', 'owner | reviewer | agent')
  .action(guard(async (card: string, n: string, text: string | undefined, opts: { accept?: boolean; as?: string }) => {
    const number = parseInt(n.replace(/^q/i, ''), 10);
    if (!Number.isInteger(number) || number < 1) throw refuse(`"${n}" is not a question number`);
    const q = await createLocalClient(process.cwd()).questions.answer(card, number, { text, accept: opts.accept }, { as: opts.as });
    console.log(`  Q${q.n} answered: ${q.answer}`);
  }));
