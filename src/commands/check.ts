import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { RefusalError } from '../lib/cards.js';
import { checkMock } from '../lib/mock.js';
import { checkOnline, checkResearch } from '../lib/research.js';
import { blockingGotchas } from '../lib/wiki.js';

/** Why the file does not pass, or null. With nothing to look for, an empty file still fails: `touch` is not work. */
export function fileProblem(path: string, has: string[]): string | null {
  if (!existsSync(path)) return `missing file: ${path}`;
  const text = readFileSync(path, 'utf-8');
  if (text.trim() === '') return `${path} is empty`;
  const missing = has.filter(s => !text.includes(s));
  return missing.length ? `${path} is missing: ${missing.map(s => `"${s}"`).join(', ')}` : null;
}

export const checkCommand = new Command('check').description('Done-check helpers for lane stages');

checkCommand
  .command('file <path>')
  .description('Exit 1 unless the file exists, is not empty, and contains every --has string')
  .option('--has <str...>', 'Strings the file must contain')
  .action((path: string, opts: { has?: string[] }) => {
    const problem = fileProblem(path, opts.has ?? []);
    if (problem) {
      console.error(problem);
      process.exit(1);
    }
  });

checkCommand
  .command('gotchas')
  .description('Exit 1 while a critical wiki page applies to these files and has not been acknowledged')
  .requiredOption('--files <path...>', 'Changed files')
  .option('--ack <title...>', 'Titles of critical pages that were read and handled', [])
  .action((opts: { files: string[]; ack: string[] }) => {
    const blocking = blockingGotchas(process.cwd(), opts.files, opts.ack);
    for (const p of blocking) console.error(`critical: ${p.title} (freq ${p.freq}, ${p.path})\n${p.body}\n`);
    if (blocking.length) {
      console.error(`${blocking.length} critical wiki page(s) apply. Read them, then re-run with --ack "<title>" for each.`);
      process.exit(1);
    }
  });

// A check exits 1 with one line per problem. A card with no spec folder is a problem too, not a crash.
function failing(run: () => string[] | Promise<string[]>) {
  return async (): Promise<void> => {
    let problems: string[];
    try {
      problems = await run();
    } catch (e) {
      if (!(e instanceof RefusalError)) throw e;
      problems = [e.message];
    }
    problems.forEach(p => console.error(p));
    if (problems.length) process.exit(1);
  };
}

checkCommand
  .command('research <card>')
  .description("Exit 1 unless the card's research.md has a `verdict:` line and enough `- source: <url> — <note>` lines")
  .option('--min-sources <n>', 'How many source lines are required', '3')
  .option('--online', 'Also require each source URL to answer with 2xx or 3xx')
  .action((card: string, opts: { minSources: string; online?: boolean }) => failing(async () => {
    const min = parseInt(opts.minSources, 10);
    if (!Number.isInteger(min) || min < 0) return [`--min-sources "${opts.minSources}" is not a number`];
    const { errors, urls } = checkResearch(process.cwd(), card, min);
    return opts.online ? [...errors, ...(await checkOnline(urls))] : errors;
  })());

checkCommand
  .command('mock <card>')
  .description("Exit 1 unless the card's mock is built from the shared template, keeps its tokens, uses no other colours and draws every screen the spec names")
  .action((card: string) => failing(() => checkMock(process.cwd(), card))());
