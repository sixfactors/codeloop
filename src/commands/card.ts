import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { DONE, DROPPED, type Card, type CardListFilter, type StoryFlags } from '../sdk/index.js';
import { createLocalClient } from '../sdk/local.js';
import { guard } from './guard.js';

const client = () => createLocalClient(process.cwd());

function line(card: Card & { band?: string; score?: number }): string {
  const state = card.gate ? chalk.yellow(`waiting for you: ${card.gate}`) : card.stage === DONE ? chalk.green('done') : card.stage;
  const rank = card.band ? chalk.dim(`${card.band}${card.score === undefined ? '' : ` ${card.score}`}`.padEnd(10)) : '';
  return `  ${card.id}  ${rank}${card.lane.padEnd(8)} ${state}  ${chalk.dim(card.title)}`;
}

function print(result: { lines: string[]; exitCode: number }): void {
  result.lines.forEach(l => console.log(l.startsWith('Next:') ? chalk.cyan(l) : l));
  if (result.exitCode) process.exit(result.exitCode);
}

const start = async (lane: string, title: string, opts: { id?: string; as?: string; ticket?: string } & StoryFlags) => {
  const { card, hint } = await client().cards.new({ ...opts, lane, title }, { as: opts.as });
  console.log(`created ${card.id} in ${card.lane} at stage ${card.stage}${card.ticket ? ` for ${card.ticket}` : ''}${card.spec ? ` (${card.spec}/)` : ''}`);
  print({ lines: [hint], exitCode: 0 });
};

const next = async (id: string | undefined, opts: { event?: string }) => {
  print(await client().cards.advance(id, { event: opts.event }));
};

const approve = async (id: string, opts: { as?: string; note?: string }) => {
  const result = await client().cards.approve(id, { as: opts.as, note: opts.note });
  console.log(result.summary);
  print(result);
};

const reject = async (id: string, note: string | undefined, opts: { as?: string; note?: string }) => {
  const result = await client().cards.reject(id, note ?? opts.note ?? '', { as: opts.as });
  console.log(result.summary);
  if (result.card.stage !== DROPPED) print(result);
};

const ROLE = ['--as <role>', 'owner | reviewer | agent (default: owner at a terminal, agent otherwise)'] as const;

// The story standard's fields (docs/story-standard.md), the same on new, propose and start.
function storyOptions(command: Command): Command {
  return command
    .option('--persona <persona>', 'Who the story is for: founder, builder, reviewer, dev, visitor, team or a persona from config.yaml')
    .option('--can <what>', 'The "I can" part of the story')
    .option('--so <outcome>', 'The "so that" part of the story')
    .option('--size <size>', 'S (hours), M (a day or two) or L (split it)')
    .option('--points <n>', 'Story points: 1, 2, 3, 5 or 8')
    .option('--initiative <initiative>', 'The initiative this card serves')
    .option('--epic <card-id>', 'The parent card this one was split from')
    .option('--feature <feature>', 'The capability this card is a slice of')
    .option('--effort <weeks>', "Weeks; replaces the feature's effort in this card's RICE score")
    .option('--metric <metric>', 'The one stage metric this card moves')
    .option('--ticket <key>', 'Tracker key, like ACME-412; a title starting "ACME-412: " sets it too')
    .option('--force', 'Create it even though the title or story fails the standard');
}

export const cardCommand = new Command('card').description('Create and move cards through a lane');

storyOptions(cardCommand
  .command('new <lane> <title>')
  .description('Create a card in the first stage of a lane')
  .option('--id <id>', 'Card id (default: next c-NNN)')
  .option(...ROLE))
  .action(guard(start));

storyOptions(cardCommand
  .command('propose <lane> <title>')
  .description('Propose a card: it waits in the inbox until the owner promotes it with `codeloop approve`, and nothing starts it')
  .option('--id <id>', 'Card id (default: next c-NNN)')
  .option('--description <text>', 'What was seen, for the owner deciding')
  .option('--source <url or path>', 'Where it came from')
  .option(...ROLE))
  .action(guard(async (lane: string, title: string, opts: { id?: string; description?: string; source?: string; as?: string } & StoryFlags) => {
    const { card, created, hint } = await client().cards.propose({ ...opts, lane, title }, { as: opts.as });
    console.log(created ? `proposed ${card.id} for ${card.lane}: ${card.title}` : `already proposed as ${card.id}`);
    print({ lines: [hint], exitCode: 0 });
  }));

cardCommand
  .command('show <id>')
  .description('Show a card, its current stage brief and its events')
  .option('--json', 'JSON output')
  .action(guard(async (id: string, opts: { json?: boolean }) => {
    const { card, brief: stage, hint } = await client().cards.show(id);
    if (opts.json) {
      console.log(JSON.stringify({ ...card, brief: stage }, null, 2));
      return;
    }
    console.log(line(card));
    if (card.story) console.log(`  As a ${card.story.as}, I can ${card.story.can}, so that ${card.story.so}.`);
    const facts = [card.ticket && `ticket ${card.ticket}`, card.split_from && `split from ${card.split_from}`, card.size && `size ${card.size}`, card.points !== undefined && `${card.points} pts`, card.initiative && `initiative ${card.initiative}`, card.epic && `epic ${card.epic}`, card.feature && `feature ${card.feature}`, card.effort !== undefined && `effort ${card.effort}w`, card.metric && `metric ${card.metric}`].filter(Boolean);
    if (facts.length) console.log(chalk.dim(`  ${facts.join(' · ')}`));
    if (card.description) console.log(card.description.split('\n').map(l => `  ${l}`).join('\n'));
    if (card.source && !card.description?.includes(card.source)) console.log(`  source: ${card.source}`);
    if (stage) {
      if (stage.skill) console.log(`  skill:  ${stage.skill}`);
      if (stage.output) console.log(`  output: ${stage.output}`);
      if (stage.done) console.log(`  check:  ${stage.done}`);
      for (const note of stage.notes) console.log(`  note:   ${note}`);
      for (const f of stage.feedback) console.log(chalk.yellow(f.kind === 'rejected' ? `  rejected: ${f.note}` : `  returned from ${f.from}: ${f.note}`));
    }
    console.log();
    for (const e of card.events) {
      console.log(chalk.dim(`  ${e.at}  ${e.actor.padEnd(8)} ${e.action}${e.stage ? ` ${e.stage}` : ''}${e.note ? `: ${e.note.split('\n').at(-1)}` : ''}`));
    }
    console.log(chalk.cyan(hint));
  }));

cardCommand
  .command('list')
  .description('List cards; dropped proposals are hidden unless --all')
  .option('--json', 'JSON output')
  .option('--lane <lane>')
  .option('--stage <stage>')
  .option('--initiative <slug>')
  .option('--epic <slug>')
  .option('--feature <slug>')
  .option('--band <band>', 'P1, P2, P3 or P4')
  .option('--persona <persona>')
  .option('--size <size>', 'S, M or L')
  .option('--points <n>')
  .option('--all', 'Include dropped proposals')
  .action(guard(async (opts: { json?: boolean } & CardListFilter) => {
    // `--json` carries each card's version, which a later write can expect.
    const cards = await client().cards.records(opts);
    if (opts.json) console.log(JSON.stringify(cards, null, 2));
    else if (cards.length === 0) console.log('  no cards');
    else cards.forEach(c => console.log(line(c)));
  }));

cardCommand
  .command('migrate-stories')
  .description('Fill the story fields of proposals whose description is written as `As a X, I can Y, so that Z. Initiative: W · S · metric: M`')
  .action(guard(async () => {
    const changed = await client().cards.migrateStories();
    console.log(changed.length ? `  ${changed.length} cards given story fields: ${changed.join(', ')}` : '  nothing to migrate');
  }));

cardCommand
  .command('migrate-features [mapping]')
  .description('Set `feature:` and its initiative on each card a mapping file names (default .codeloop/migrations/features.yaml); an unknown feature refuses the run')
  .action(guard(async (mapping?: string) => {
    const { changed, mapping: file } = await client().cards.migrateFeatures(mapping);
    console.log(changed.length ? `  ${changed.length} cards given a feature from ${file}: ${changed.join(', ')}` : `  nothing to migrate from ${file}`);
  }));

cardCommand
  .command('run <id>')
  .description("Run the current stage: its check, the agent when the check fails, then one advance; waits for the run and prints its log")
  .option('--agent <name>', 'The agent to start (default: agents.default, or the one configured)')
  .option('--json', 'JSON output: the final run record')
  .action(guard(async (id: string, opts: { agent?: string; json?: boolean }) => {
    const c = client();
    const { runId } = await c.cards.run(id, { agent: opts.agent });
    if (!opts.json) console.log(`run ${runId} started`);
    for await (const item of c.runs.stream(runId)) {
      if ('line' in item) {
        if (!opts.json) console.log(`  ${item.line}`);
        continue;
      }
      if (opts.json) console.log(JSON.stringify(item.end, null, 2));
      else console.log(`${item.end.status === 'done' ? chalk.green(item.end.status) : chalk.red(item.end.status)}: ${item.end.outcome}${item.end.note ? ` (${item.end.note})` : ''}`);
      if (item.end.status !== 'done') process.exit(2);
    }
  }));

cardCommand
  .command('output <id> [file]')
  .description("Print the current stage's output file, or write it from a file (`-` for stdin)")
  .option(...ROLE)
  .action(guard(async (id: string, file: string | undefined, opts: { as?: string }) => {
    const c = client();
    if (file === undefined) {
      const { path, text } = await c.cards.output(id);
      if (text === null) {
        console.log(chalk.yellow(`${path} is not written yet`));
        return;
      }
      process.stdout.write(text);
      return;
    }
    const text = file === '-' ? readFileSync(0, 'utf-8') : readFileSync(file, 'utf-8');
    const { path } = await c.cards.writeOutput(id, text, { as: opts.as });
    console.log(`wrote ${path} (${text.length} bytes)`);
  }));

cardCommand
  .command('split <id> <titles...>')
  .description('Split a card into siblings under the same feature, one per title; each is marked split_from')
  .option(...ROLE)
  .action(guard(async (id: string, titles: string[], opts: { as?: string }) => {
    const { from, cards, hints } = await client().cards.split(id, titles, { as: opts.as });
    console.log(`split ${from.id} into ${cards.map(c => c.id).join(', ')}`);
    cards.forEach((c, i) => {
      console.log(line(c));
      console.log(chalk.cyan(`  ${hints[i]}`));
    });
  }));

cardCommand
  .command('advance [id]')
  .description("Run the current stage's check and move the card if it passes")
  .option('--event <name>', 'Report the event a stage with `done.event` is waiting for')
  .action(guard(next));

cardCommand
  .command('approve <id>')
  .description('Approve the gate a card is waiting at, then advance it once')
  .option(...ROLE)
  .option('--note <note>', 'Optional note')
  .action(guard(approve));

cardCommand
  .command('reject <id> [note]')
  .description('Reject the gate with a note; the card stays in its stage')
  .option('--note <note>', 'What to change')
  .option(...ROLE)
  .action(guard(reject));

// Short forms of the four commands a person types most.
export const startCommand = storyOptions(new Command('start')
  .description('Start a card: `codeloop start "<title>"` (same as card new, plus its spec folder)')
  .argument('<title>')
  .option('--lane <lane>', 'Lane to start in', 'build')
  .option('--id <id>', 'Card id (default: next c-NNN)')
  .option(...ROLE))
  .action(guard((title: string, opts: { lane: string; id?: string; as?: string; ticket?: string } & StoryFlags) => start(opts.lane, title, opts)));

export const nextCommand = new Command('next')
  .description('Run the check for a card and move it on (same as card advance); with one active card the id is optional')
  .argument('[id]')
  .option('--event <name>', 'Report the event a stage with `done.event` is waiting for')
  .action(guard(next));

export const approveCommand = new Command('approve')
  .description('Approve the gate a card is waiting at (same as card approve)')
  .argument('<id>')
  .option(...ROLE)
  .option('--note <note>', 'Optional note')
  .action(guard(approve));

export const rejectCommand = new Command('reject')
  .description('Reject with a note: `codeloop reject <id> "<what to change>"`')
  .argument('<id>')
  .argument('[note]')
  .option('--note <note>', 'What to change')
  .option(...ROLE)
  .action(guard(reject));
