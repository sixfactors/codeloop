import { Command } from 'commander';
import chalk from 'chalk';
import { DONE, DROPPED, findCard, inLane, readCards, RefusalError, type Card } from '../lib/cards.js';
import { advanceCard, proposeCard, rejectCard, resolveRole } from '../lib/engine.js';
import { approveFlow, describeAdvance, nextHint, stageBrief, startCard } from '../lib/flow.js';
import { guard } from './guard.js';

function line(card: Card): string {
  const state = card.gate ? chalk.yellow(`waiting for you: ${card.gate}`) : card.stage === DONE ? chalk.green('done') : card.stage;
  return `  ${card.id}  ${card.lane.padEnd(8)} ${state}  ${chalk.dim(card.title)}`;
}

function print(result: { lines: string[]; exitCode: number }): void {
  result.lines.forEach(l => console.log(l.startsWith('Next:') ? chalk.cyan(l) : l));
  if (result.exitCode) process.exit(result.exitCode);
}

const start = (lane: string, title: string, opts: { id?: string; as?: string }) => {
  const projectDir = process.cwd();
  const card = startCard(projectDir, { lane, title, id: opts.id, role: resolveRole(opts.as) });
  console.log(`created ${card.id} in ${card.lane} at stage ${card.stage}${card.spec ? ` (${card.spec}/)` : ''}`);
  print({ lines: [nextHint(projectDir, card)], exitCode: 0 });
};

const next = (id: string | undefined, opts: { event?: string }) => {
  const projectDir = process.cwd();
  let ref = id;
  if (!ref) {
    const active = readCards(projectDir).cards.filter(c => inLane(c) && !c.gate);
    if (active.length !== 1) throw new RefusalError(active.length ? `${active.length} cards are active (${active.map(c => c.id).join(', ')}); say which` : 'no active card; `codeloop start "<title>"` creates one');
    ref = active[0].id;
  }
  print(describeAdvance(projectDir, advanceCard(projectDir, ref, { event: opts.event })));
};

const approve = (id: string, opts: { as?: string; note?: string }) => {
  const projectDir = process.cwd();
  const result = approveFlow(projectDir, id, resolveRole(opts.as), opts.note);
  console.log(`${result.card.id} ${result.gate === 'stuck' ? 'can be retried' : result.gate === 'proposal' ? `promoted to ${result.card.lane}/${result.card.stage}` : `gate ${result.gate} approved`}`);
  print(result.advanced ? describeAdvance(projectDir, result.advanced) : { lines: [nextHint(projectDir, result.card)], exitCode: 0 });
};

const reject = (id: string, note: string | undefined, opts: { as?: string; note?: string }) => {
  const projectDir = process.cwd();
  const card = rejectCard(projectDir, id, resolveRole(opts.as), note ?? opts.note ?? '');
  if (card.stage === DROPPED) {
    console.log(`${card.id} dropped; note recorded`);
    return;
  }
  console.log(`${card.id} rejected at ${card.stage}; note recorded`);
  print({ lines: [nextHint(projectDir, card).replace('Next: run', 'Next: redo with')], exitCode: 0 });
};

const ROLE = ['--as <role>', 'owner | reviewer | agent (default: owner at a terminal, agent otherwise)'] as const;

export const cardCommand = new Command('card').description('Create and move cards through a lane');

cardCommand
  .command('new <lane> <title>')
  .description('Create a card in the first stage of a lane')
  .option('--id <id>', 'Card id (default: next c-NNN)')
  .option(...ROLE)
  .action(guard(start));

cardCommand
  .command('propose <lane> <title>')
  .description('Propose a card: it waits in the inbox until the owner promotes it with `codeloop approve`, and nothing starts it')
  .option('--description <text>', 'What was seen, for the owner deciding')
  .option('--source <url or path>', 'Where it came from')
  .option(...ROLE)
  .action(guard((lane: string, title: string, opts: { description?: string; source?: string; as?: string }) => {
    const { card, created } = proposeCard(process.cwd(), { lane, title, description: opts.description, source: opts.source, dedupe: opts.source ? `${lane}:${opts.source}:${title}` : undefined, role: resolveRole(opts.as) });
    console.log(created ? `proposed ${card.id} for ${card.lane}: ${card.title}` : `already proposed as ${card.id}`);
    print({ lines: [nextHint(process.cwd(), card)], exitCode: 0 });
  }));

cardCommand
  .command('show <id>')
  .description('Show a card, its current stage brief and its events')
  .option('--json', 'JSON output')
  .action(guard((id: string, opts: { json?: boolean }) => {
    const projectDir = process.cwd();
    const card = findCard(readCards(projectDir).cards, id);
    const stage = stageBrief(projectDir, card);
    if (opts.json) {
      console.log(JSON.stringify({ ...card, brief: stage }, null, 2));
      return;
    }
    console.log(line(card));
    if (card.description) console.log(card.description.split('\n').map(l => `  ${l}`).join('\n'));
    if (card.source && !card.description?.includes(card.source)) console.log(`  source: ${card.source}`);
    if (stage) {
      if (stage.skill) console.log(`  skill:  ${stage.skill}`);
      if (stage.output) console.log(`  output: ${stage.output}`);
      if (stage.done) console.log(`  check:  ${stage.done}`);
      for (const note of stage.notes) console.log(`  note:   ${note}`);
      for (const note of stage.rejections) console.log(chalk.yellow(`  rejected: ${note}`));
    }
    console.log();
    for (const e of card.events) {
      console.log(chalk.dim(`  ${e.at}  ${e.actor.padEnd(8)} ${e.action}${e.stage ? ` ${e.stage}` : ''}${e.note ? `: ${e.note.split('\n').at(-1)}` : ''}`));
    }
    console.log(chalk.cyan(nextHint(projectDir, card)));
  }));

cardCommand
  .command('list')
  .description('List cards')
  .option('--json', 'JSON output')
  .action(guard((opts: { json?: boolean }) => {
    const { cards } = readCards(process.cwd());
    if (opts.json) console.log(JSON.stringify(cards, null, 2));
    else if (cards.length === 0) console.log('  no cards');
    else cards.forEach(c => console.log(line(c)));
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
export const startCommand = new Command('start')
  .description('Start a card: `codeloop start "<title>"` (same as card new, plus its spec folder)')
  .argument('<title>')
  .option('--lane <lane>', 'Lane to start in', 'build')
  .option('--id <id>', 'Card id (default: next c-NNN)')
  .option(...ROLE)
  .action(guard((title: string, opts: { lane: string; id?: string; as?: string }) => start(opts.lane, title, opts)));

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
