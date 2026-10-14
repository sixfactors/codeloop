import { Command } from 'commander';
import { checkLiveWalk, liveWalkRequired } from '../lib/live-walk.js';
import { existsSync, readFileSync } from 'fs';
import { findCard, readCards, RefusalError } from '../lib/cards.js';
import { checkMock, findMock } from '../lib/mock.js';
import { checkArtifact, findArtifact, type ArtifactKind } from '../lib/artifact.js';
import { checkStory } from '../lib/story.js';
import { wikiLanded } from '../lib/wiki-rules.js';
import { evaluateRubric } from '../lib/rubric.js';
import { questionProblems, questionsNotDecided, readQuestions } from '../lib/interview.js';
import { checkOnline, checkResearch } from '../lib/research.js';
import { checkBreakdown, checkBrief } from '../lib/shape.js';
import { blockingGotchas } from '../lib/wiki.js';
import { checkScope } from '../lib/scope-creep.js';
import { checkArchitecture } from '../lib/architecture-check.js';
import { checkDataModel } from '../lib/data-model.js';
import { projectRoot } from '../lib/project-root.js';

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
    const blocking = blockingGotchas(projectRoot(), opts.files, opts.ack);
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
    const { errors, urls } = checkResearch(projectRoot(), card, min);
    return opts.online ? [...errors, ...(await checkOnline(urls))] : errors;
  })());

checkCommand
  .command('rubric <card>')
  .description("Exit 1 unless the card's stage meets its rubric: every check row passes, every attest row has a `- Rn pass: <evidence>` line under ## Rubric naming a path, line, URL or command, and a stage with `review:` has its review file with `verdict: accept`")
  .option('--stage <id>', "The stage to judge; defaults to the card's stage")
  .action((card: string, opts: { stage?: string }) => failing(() => evaluateRubric(projectRoot(), card, opts.stage).problems)());

checkCommand
  .command('wiki-landed <card>')
  .description("Exit 1 unless the stage's findings reached the wiki: a research that compared options has a decision page (or makes a valid one), a review's repeat-mistake fix-now finding has a gotcha page")
  .option('--stage <id>', 'research or review; defaults to the card\'s stage')
  .action((card: string, opts: { stage?: string }) => failing(() => wikiLanded(projectRoot(), card, opts.stage))());

checkCommand
  .command('mock <card>')
  .description("Exit 1 unless the card's mock is built from the shared template, keeps its tokens, uses no other colours and draws every screen the spec names")
  .action((card: string) => failing(() => checkMock(projectRoot(), card))());

checkCommand
  .command('artifact <card>')
  .description("Exit 1 unless the card's artifact (mock, system-design or workflow) meets its kind's anatomy: tokens, dark mode, no raw colour, valid mermaid, and every frame/layer/flow/actor the frontmatter names")
  .option('--kind <kind>', 'mock | system-design | workflow, auto-detected from whichever artifact exists for the card when omitted')
  .action((card: string, opts: { kind?: string }) =>
    failing(() => {
      const kind = opts.kind as ArtifactKind | undefined;
      // The mock kind lives beside the spec via the original template/checker (`check mock`
      // is the same check under a different name); system-design and workflow live under
      // docs/artifacts via the newer, shared artifact engine.
      if (kind === 'mock') return checkMock(projectRoot(), card);
      if (kind) return checkArtifact(projectRoot(), card, kind);
      if (findMock(projectRoot(), card)) return checkMock(projectRoot(), card);
      if (findArtifact(projectRoot(), card)) return checkArtifact(projectRoot(), card);
      return [`no artifact for ${card} beside its spec or under docs/artifacts; run \`codeloop artifact new ${card} --kind mock|system-design|workflow --topic <topic>\``];
    })(),
  );

checkCommand
  .command('verify <card>')
  .description("Exit 1 unless evidence/<nnn>/verify.md has a live walk: the feature driven in a browser on the normal dev stack, the calls that answered (none a mock), and a real external call or the reason there is none. Off with `verify: { live_walk: false }`")
  .action((card: string) => failing(() => (liveWalkRequired(projectRoot()) ? checkLiveWalk(projectRoot(), card) : []))());

checkCommand
  .command('scope <card>')
  .description("Exit 1 while a file the story changed outside its plan has no `## Scope` row (keep with a reason of 10+ words, revert, or move to <card-id>) in evidence/<nnn>/review.md")
  .action((card: string) => failing(() => checkScope(projectRoot(), card))());

checkCommand
  .command('story <card>')
  .description("Exit 1 unless the card meets the story standard: a title saying what the user can do, a three-part story, a known persona and a size")
  .action((card: string) => failing(() => checkStory(projectRoot(), findCard(readCards(projectRoot()).cards, card)))());

checkCommand
  .command('brief <card>')
  .description("Exit 1 unless the card's shape brief has problem:, users: and exists: filled in, and at least 3 `- source:` lines")
  .action((card: string) => failing(() => checkBrief(projectRoot(), card).errors)());

checkCommand
  .command('breakdown <card>')
  .description("Exit 1 unless the card's shape breakdown has a hypothesis and a metric, at most 7 stories, and every story sized S or M with an exists: verdict, a real done_when and only backward depends_on")
  .option('--ranked', 'Also require a `rice:` part on every story')
  .action((card: string, opts: { ranked?: boolean }) => failing(() => checkBreakdown(projectRoot(), card, { ranked: !!opts.ranked }).errors)());

checkCommand
  .command('architecture')
  .description('Exit 1 unless the five architecture pages exist, name only real paths, cover every top-level folder, stay inside the noise limits, and carry no scanner leftovers')
  .option('--dir <wikiDir>', 'The architecture folder, relative to the project root', '.codeloop/wiki/architecture')
  .action((opts: { dir: string }) => {
    const problems = checkArchitecture(projectRoot(), { dir: opts.dir });
    if (problems.length) {
      problems.forEach(p => console.error(p));
      process.exit(1);
    }
    console.log('architecture check passed');
  });

checkCommand
  .command('data-model <card>')
  .description("Exit 1 unless a story that changes data has a data-model.md whose stores the architecture data-model page names")
  .action((card: string) => failing(() => {
    const { problems, message } = checkDataModel(projectRoot(), card);
    if (!problems.length && message) console.log(message);
    return problems;
  })());

checkCommand
  .command('questions <card>')
  .description("Exit 1 unless the card's interview has at least --min questions and every one of them has an answer")
  .option('--min <n>', 'Questions the interview must hold', '1')
  .action((card: string, options: { min: string }) => failing(() => {
    const found = findCard(readCards(projectRoot()).cards, card);
    const questions = readQuestions(projectRoot(), found);
    const errors: string[] = [];
    if (questions.length < Number(options.min)) errors.push(`${found.id} has ${questions.length} question(s); the stage needs ${options.min}. Run the interview skill, then \`codeloop ask ${found.id} --file <questions.md>\``);
    errors.push(...questionProblems(questions).map(p => `${found.id} ${p}`));
    for (const q of questions) if (!q.answer) errors.push(`${found.id} Q${q.n} has no answer: \`codeloop answer ${found.id} ${q.n} --accept\` or give one`);
    // An answer typed into the file by an agent is not the owner's decision.
    for (const n of questionsNotDecided(projectRoot(), found.id)) errors.push(`${found.id} Q${n} has an answer no person gave; the owner answers with \`codeloop answer ${found.id} ${n}\` or \`codeloop answer ${found.id} --accept-all\``);
    return errors;
  })());
