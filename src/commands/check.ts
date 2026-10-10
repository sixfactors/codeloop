import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { findCard, readCards, RefusalError } from '../lib/cards.js';
import { checkMock, findMock } from '../lib/mock.js';
import { checkArtifact, findArtifact, type ArtifactKind } from '../lib/artifact.js';
import { checkStory } from '../lib/story.js';
import { readQuestions } from '../lib/interview.js';
import { checkOnline, checkResearch } from '../lib/research.js';
import { checkBreakdown, checkBrief } from '../lib/shape.js';
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
  .description("Exit 1 unless the card's research.md has a `verdict:` line and enough `- source: <url or path> — <note>` lines")
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

checkCommand
  .command('artifact <card>')
  .description("Exit 1 unless the card's artifact (mock, system-design or workflow) meets its kind's anatomy: tokens, dark mode, no raw colour, valid mermaid, and every frame/layer/flow/actor the frontmatter names")
  .option('--kind <kind>', 'mock | system-design | workflow, auto-detected from whichever artifact exists for the card when omitted')
  .action((card: string, opts: { kind?: string }) =>
    failing(() => {
      const kind = opts.kind as ArtifactKind | undefined;
      // The mock kind still lives under docs/mocks via the original template/checker (`check mock`
      // is the same check under a different name); system-design and workflow live under
      // docs/artifacts via the newer, shared artifact engine.
      if (kind === 'mock') return checkMock(process.cwd(), card);
      if (kind) return checkArtifact(process.cwd(), card, kind);
      if (findMock(process.cwd(), card)) return checkMock(process.cwd(), card);
      if (findArtifact(process.cwd(), card)) return checkArtifact(process.cwd(), card);
      return [`no artifact for ${card} under docs/mocks or docs/artifacts; run \`codeloop artifact new ${card} --kind mock|system-design|workflow --topic <topic>\``];
    })(),
  );

checkCommand
  .command('story <card>')
  .description("Exit 1 unless the card meets the story standard: a title saying what the user can do, a three-part story, a known persona and a size")
  .action((card: string) => failing(() => checkStory(process.cwd(), findCard(readCards(process.cwd()).cards, card)))());

checkCommand
  .command('brief <card>')
  .description("Exit 1 unless the card's shape brief has problem:, users: and exists: filled in, and at least 3 `- source:` lines")
  .action((card: string) => failing(() => checkBrief(process.cwd(), card).errors)());

checkCommand
  .command('breakdown <card>')
  .description("Exit 1 unless the card's shape breakdown has a hypothesis and a metric, at most 7 stories, and every story sized S or M with an exists: verdict, a real done_when and only backward depends_on")
  .option('--ranked', 'Also require a `rice:` part on every story')
  .action((card: string, opts: { ranked?: boolean }) => failing(() => checkBreakdown(process.cwd(), card, { ranked: !!opts.ranked }).errors)());

checkCommand
  .command('questions <card>')
  .description("Exit 1 unless the card's interview has at least --min questions and every one of them has an answer")
  .option('--min <n>', 'Questions the interview must hold', '1')
  .action((card: string, options: { min: string }) => failing(() => {
    const found = findCard(readCards(process.cwd()).cards, card);
    const questions = readQuestions(process.cwd(), found);
    const errors: string[] = [];
    if (questions.length < Number(options.min)) errors.push(`${found.id} has ${questions.length} question(s); the stage needs ${options.min}. Run the interview skill, then \`codeloop ask ${found.id} --file <questions.md>\``);
    for (const q of questions) if (!q.answer) errors.push(`${found.id} Q${q.n} has no answer: \`codeloop answer ${found.id} ${q.n} --accept\` or give one`);
    return errors;
  })());
