import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync } from 'fs';
import { DONE, DROPPED, type ActivityEntry, type Card, type CardListFilter, type StoryFlags } from '../sdk/index.js';
import { createLocalClient, linkedCheckout, projectRoot } from '../sdk/local.js';
import { guard } from './guard.js';

const client = () => createLocalClient(projectRoot());

function line(card: Card & { band?: string; score?: number }): string {
  // A parked card keeps the proposal gate so approving it brings it back; it is not a fresh proposal, and is listed as what it is.
  const state = card.gate && card.parked_from ? chalk.yellow(`parked (from ${card.parked_from})`) : card.gate ? chalk.yellow(`waiting for you: ${card.gate}`) : card.stage === DONE ? chalk.green('done') : card.stage;
  // The priority the picks use: the card's own when set, else its feature's RICE band.
  const band = card.priority ?? card.band;
  const rank = band ? chalk.dim(`${band}${card.score === undefined ? '' : ` ${card.score}`}`.padEnd(10)) : '';
  return `  ${card.id}  ${card.bug ? chalk.red('bug ') : card.bug_reported_by ? chalk.yellow(`reported bug (${card.bug_reported_by}) `) : ''}${rank}${card.lane.padEnd(8)} ${state}  ${chalk.dim(card.title)}`;
}

function print(result: { lines: string[]; exitCode: number }): void {
  result.lines.forEach(l => console.log(l.startsWith('Next:') ? chalk.cyan(l) : l));
  if (result.exitCode) process.exit(result.exitCode);
}

// Set by the program from guard-hooks.ts, the one module that writes .codeloop/state, so this file
// stays on the SDK (the layering test) while `start --activate` still marks the card active.
let activateStarted: ((id: string) => Promise<void>) | undefined;
export function onStartActivate(fn: (id: string) => Promise<void>): void {
  activateStarted = fn;
}

// A tracker-style id (`c-123`); a title is a sentence, so the two never collide.
const CARD_REF = /^[A-Za-z]{1,10}-\d{1,6}$/;

/** `codeloop start c-123`: a queued or proposed story starts at its start stage and becomes the active one. */
const startExisting = async (id: string, opts: { as?: string }) => {
  const { card, hint, from } = await client().cards.start(id, { as: opts.as });
  console.log(from === 'active' ? `${card.id} is already at ${card.stage}` : `started ${card.id} at ${card.stage}${from === 'proposed' ? ', promoted from its proposal' : ''}`);
  if (!activateStarted) throw new Error('start: no activation handler attached');
  await activateStarted(card.id);
  print({ lines: [hint], exitCode: 0 });
};

const start = async (lane: string, title: string, opts: { id?: string; as?: string; ticket?: string; stage?: string; activate?: boolean } & StoryFlags) => {
  const { stage, activate, ...rest } = opts;
  const created = await client().cards.new({ ...rest, lane, title }, { as: opts.as });
  // Only the owner's --bug flags a story directly; anyone else's waits at the owner's proposal gate.
  if (created.card.bug_reported_by) {
    console.log(`proposed ${created.card.id} in ${created.card.lane}, reported as critical by ${created.card.bug_reported_by}; it waits for the owner to approve it`);
    return;
  }
  // Work already under way enters at the stage it has reached, not at the first one.
  const { card, hint } = stage && stage !== created.card.stage ? await client().cards.place(created.card.id, stage, { as: opts.as }) : created;
  console.log(`created ${card.id} in ${card.lane} at stage ${card.stage}${card.ticket ? ` for ${card.ticket}` : ''}${card.spec ? ` (${card.spec}/)` : ''}`);
  if (activate) {
    if (!activateStarted) throw new Error('start --activate: no activation handler attached');
    await activateStarted(card.id);
  }
  print({ lines: [hint], exitCode: 0 });
};

// `--as` is accepted so a habit from approve does not cost a retry; moving a card on is the check's
// decision, so who runs it does not change the outcome.
const next = async (id: string | undefined, opts: { event?: string; as?: string }) => {
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

const ROLE = ['--as <role>', 'owner | reviewer | agent (default: owner; agent inside an agent run)'] as const;

// The story standard's fields (docs/story-standard.md), the same on new, propose and start.
function storyOptions(command: Command): Command {
  return command
    .option('--persona <persona>', 'Who the story is for: founder, builder, reviewer, dev, visitor, team or a persona from config.yaml')
    .option('--can <what>', 'The "I can" part of the story')
    .option('--so <outcome>', 'The "so that" part of the story')
    .option('--size <size>', 'trivial (a one-line fix, no ceremony), S (hours), M (a day or two) or L (split it)')
    .option('--points <n>', 'Story points: 1, 2, 3, 5 or 8')
    .option('--initiative <initiative>', 'The initiative this card serves')
    .option('--epic <card-id>', 'The parent card this one was split from')
    .option('--feature <feature>', 'The capability this card is a slice of')
    .option('--effort <weeks>', "Weeks; replaces the feature's effort in this card's RICE score")
    .option('--metric <metric>', 'The one stage metric this card moves')
    .option('--ticket <key>', 'Tracker key, like ACME-412; a title starting "ACME-412: " sets it too')
    .option('--bug', "A critical bug: every pick takes it first; from anyone but the owner it is a report that waits at the owner's gate")
    .option('--force', 'Create it even though the title or story fails the standard');
}

export const cardCommand = new Command('card').alias('cards').description('Create and move cards through a lane');

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

/** One activity line as a person reads it: the time, who, and what happened. */
function activityText(l: ActivityEntry): string {
  const at = chalk.dim(new Date(l.at).toTimeString().slice(0, 8));
  const what = (() => {
    switch (l.kind) {
      case 'edit': return `edited ${l.file}`;
      case 'cmd': return `ran ${l.text}`;
      case 'prompt': return `prompt${l.text ? `: ${l.text}` : ''}`;
      case 'check': return l.pass ? chalk.green(`check passed (${l.stage})`) : chalk.red(`check failing (${l.stage}): ${String(l.output ?? '').trim().split('\n').pop() ?? ''}`);
      case 'commit': return `committed ${l.sha} ${l.subject}`;
      case 'log': return chalk.dim(`${l.runId}: ${l.text}`);
      case 'start': return 'session started';
      case 'stop': return 'turn ended';
      case 'end': return 'session ended';
      default: return `${l.kind}${l.stage ? ` ${l.stage}` : ''}${l.text ? `: ${l.text}` : ''}`;
    }
  })();
  return `  ${at}  ${what}`;
}

cardCommand
  .command('handback <id>')
  .description('Hand a card back: runs the proof command here and records its exit code and output on the card')
  .requiredOption('--branch <branch>', 'The branch the work is on')
  .requiredOption('--head <sha>', 'The commit the work ends at')
  .requiredOption('--proof <cmd>', 'The command that proves the work; it is run from the project root')
  .option('--left <text>', 'What is left to do')
  .option('--blocked <text>', 'What blocked the work')
  .option('--worktree <path>', 'The git worktree the work is in; the proof is run there instead of the project root')
  .option('--needed <text>', "The story summary's line on what the story needs")
  .option('--done <text>', "The story summary's line on what is done")
  .action(guard(async (id: string, opts: { branch: string; head: string; proof: string; left?: string; blocked?: string; worktree?: string; needed?: string; done?: string }) => {
    const c = client();
    // Run from a linked worktree of the project, the proof runs in that checkout, where the
    // builder's branch is, not in the main tree the board lives in.
    const worktree = opts.worktree ?? linkedCheckout(projectRoot());
    const rec = await c.cards.handback(id, { branch: opts.branch, head: opts.head, proof: opts.proof, left: opts.left, blocked: opts.blocked, worktree, ...(opts.needed || opts.done ? { summary: { needed: opts.needed, done: opts.done } } : {}) });
    console.log(`proof exit ${rec.proof.exit}; hand-back recorded for ${rec.card} at ${rec.stage} (${rec.branch}@${rec.head.slice(0, 8)})`);
    if (rec.proof.exit !== 0) {
      const head = rec.proof.output.split('\n').slice(0, 12).join('\n').trimEnd();
      console.error(`proof failed with exit ${rec.proof.exit}\n  cwd: ${rec.proof.cwd ?? '(not recorded)'}\n  command (${rec.proof.shell ?? 'sh'} -c): ${rec.proof.cmd}${head ? `\n  output:\n${head.replace(/^/gm, '    ')}` : ''}`);
    }
    await c.close();
  }));

cardCommand
  .command('gate <id>')
  .description("Gate a card's hand-back: reruns its proof, the stage check and one claim. Exit 0 on pass, 1 on fail")
  .option('--handback <id>', 'The hand-back to gate (its head sha); the latest by default')
  .action(guard(async (id: string, opts: { handback?: string }) => {
    const c = client();
    const rec = await c.cards.gate(id, { handbackId: opts.handback });
    console.log(`gate ${rec.verdict} for ${rec.card} at ${rec.stage} (${rec.handback.branch}@${rec.handback.head.slice(0, 8)})`);
    for (const f of rec.findings) console.log(`  - ${f}`);
    await c.close();
    if (rec.verdict === 'fail') process.exit(1);
  }));

cardCommand
  .command('worktree <id>')
  .description("Create (or reuse) the story's own git worktree and branch; prints the path and branch")
  .action(guard(async (id: string) => {
    const c = client();
    const w = await c.cards.worktree(id);
    console.log(`${w.path}\n${w.branch}`);
    for (const h of w.hooks ?? []) console.log(`hooks: ${h.name}${h.reason ? ` (${h.reason})` : ''}`);
    await c.close();
  }));

cardCommand
  .command('merge <id>')
  .description("Merge the story's branch into the trunk once its gate passed; prints the sha. Exit 2 when refused")
  .action(guard(async (id: string) => {
    const c = client();
    const m = await c.cards.merge(id);
    console.log(m.sha);
    await c.close();
  }));

cardCommand
  .command('activity <id>')
  .description("What happened on a card, oldest first: edits, commands, checks, commits and gates. --follow keeps printing as it happens")
  .option('--follow', 'Keep printing new lines until interrupted')
  .option('--limit <n>', 'Most lines to print without --follow', '200')
  .option('--json', 'One JSON line per activity line')
  .action(guard(async (id: string, opts: { follow?: boolean; limit: string; json?: boolean }) => {
    const out = (l: ActivityEntry) => console.log(opts.json ? JSON.stringify(l) : activityText(l));
    const c = client();
    if (!opts.follow) {
      const { lines, next } = await c.cards.activity(id, { limit: Number(opts.limit) || 200 });
      if (!lines.length && !opts.json) console.log(chalk.dim('  no activity yet'));
      lines.forEach(out);
      if (next && !opts.json) console.log(chalk.dim(`  more after cursor ${next}`));
      await c.close();
      return;
    }
    // The index's watcher does not hold the process open, so following does.
    const keepAlive = setInterval(() => undefined, 1 << 30);
    const controller = new AbortController();
    process.once('SIGINT', () => controller.abort());
    try {
      for await (const l of c.cards.activityStream(id, { after: '0', signal: controller.signal })) out(l);
    } finally {
      clearInterval(keepAlive);
      await c.close();
    }
  }));

cardCommand
  .command('show <id>')
  .description('Show a card, its current stage brief and its events')
  .option('--json', 'JSON output')
  .action(guard(async (id: string, opts: { json?: boolean }) => {
    const { card, brief: stage, hint, tasks, evidenceFiles, commits, phaseTime, stuck } = await client().cards.show(id);
    if (opts.json) {
      console.log(JSON.stringify({ ...card, brief: stage, tasks, evidenceFiles, commits, phaseTime, ...(stuck ? { stuck } : {}) }, null, 2));
      return;
    }
    console.log(line(card));
    // Printed only when the story fields are really there: a card without them, or with a `story`
    // value of another shape, prints no sentence rather than "As a undefined".
    const st = card.story as { as?: string; can?: string; so?: string } | undefined;
    if (st && typeof st === 'object' && st.as && st.can && st.so) console.log(`  As a ${st.as}, I can ${st.can}, so that ${st.so}.`);
    // A blank field is said, with the command that fills it, so empty never looks like hidden.
    if (!(st && typeof st === 'object' && st.as && st.can && st.so)) console.log(chalk.yellow(`  story: not written. codeloop card edit ${card.id} --story "As a <persona>, I can <what>, so that <outcome>"`));
    if (!card.description?.trim()) console.log(chalk.yellow(`  description: none. codeloop card edit ${card.id} --description "<text>"`));
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
    if (stuck) {
      // The same explanation the story page and the inbox show.
      console.log(chalk.yellow(`  what you must do: ${stuck.action}`));
      console.log(`  work tried: ${stuck.tried}`);
      console.log(`  shipped:    ${stuck.shipped}`);
      if (stuck.error) console.log(chalk.dim(`  the error (last line): ${stuck.error.split('\n').filter(Boolean).at(-1)}`));
    }
    if (phaseTime) console.log(chalk.dim(`  ${phaseTime.text}`));
    const moving = card.display?.moving;
    if (moving) console.log(chalk.yellow(`  ${card.display?.health} · moving: work landed since the check failed`));
    if (tasks?.length) {
      console.log(chalk.bold(`  tasks (${tasks.filter(t => t.done).length} of ${tasks.length} done)`));
      for (const t of tasks) console.log(`    [${t.done ? 'x' : ' '}] ${t.id} [${t.layer}] ${t.text}`);
    }
    if (evidenceFiles?.length) {
      console.log(chalk.bold('  evidence'));
      for (const f of evidenceFiles) console.log(`    ${f.path}  ${chalk.dim(f.mtime)}`);
    }
    if (commits?.length) {
      console.log(chalk.bold('  commits'));
      for (const c of commits) console.log(`    ${c.sha.slice(0, 8)} ${c.subject}  ${chalk.dim(c.merged ? 'merged' : `on ${c.branches.join(', ') || 'no branch'}`)}`);
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
  .option('--size <size>', 'trivial, S, M or L')
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
  .command('summary <id>')
  .description("Write the story summary's needed and done lines; what you must do comes from the board. As an agent it never replaces a line a person wrote")
  .option('--needed <text>', 'What the story needs, in one plain sentence')
  .option('--done <text>', 'What is already done, in one plain sentence')
  .option(...ROLE)
  .action(guard(async (id: string, opts: { needed?: string; done?: string; as?: string }) => {
    const { written, kept } = await client().cards.summary(id, { needed: opts.needed, done: opts.done }, { as: opts.as });
    if (written.length) console.log(`wrote ${written.join(' and ')} on ${id}`);
    if (kept.length) console.log(chalk.yellow(`kept the ${kept.join(' and ')} line a person wrote; an agent adds to the summary but never replaces a person's line`));
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
  .option(...ROLE)
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

cardCommand
  .command('place <id> <stage>')
  .description('Move a story to the stage its work has really reached (the owner decides); its checks run from there')
  .option(...ROLE)
  .action(guard(async (id: string, stage: string, opts: { as?: string }) => {
    const { card, hint } = await client().cards.place(id, stage, { as: opts.as });
    console.log(`${card.id} is at ${card.stage}`);
    console.log(chalk.cyan(hint));
  }));

cardCommand
  .command('reopen <id> [note]')
  .description('Bring a done or dropped card back to the first stage of its lane, or with --to backlog to the inbox as a proposal (the owner decides)')
  .option('--to <stage>', 'A stage of its lane, or backlog (default: the first stage)')
  .option(...ROLE)
  .action(guard(async (id: string, note: string | undefined, opts: { as?: string; to?: string }) => {
    const card = await client().cards.reopen(id, { as: opts.as, to: opts.to, note });
    console.log(`${card.id} is reopened at ${card.stage === 'proposed' ? 'backlog' : card.stage}`);
  }));

cardCommand
  .command('move <id> <stage> [note]')
  .description('Move an active card to any earlier or later stage of its lane; the note is required when moving back past a gate that was passed')
  .option(...ROLE)
  .action(guard(async (id: string, stage: string, note: string | undefined, opts: { as?: string }) => {
    const card = await client().cards.move(id, stage, note, { as: opts.as });
    console.log(`${card.id} is at ${card.stage}`);
  }));

cardCommand
  .command('edit <id>')
  .description('Edit a card: its title, story, priority, feature or size, add a line to its description, or flag it as a critical bug; the story line in its spec.md follows')
  .option('--title <title>', 'What the user can now do')
  .option('--story <story>', '"As a <persona>, I can <what>, so that <outcome>"')
  .option('--priority <p>', 'P1, P2, P3 or P4')
  .option('--feature <feature>', 'The capability this card is a slice of')
  .option('--size <size>', 'S, M or L')
  .option('--description <text>', 'Add one line "<date> owner: <text>" to the description; what is there stays')
  .option('--bug', "Flag it as a critical bug, which every pick takes first; from an agent it is a report the owner confirms")
  .option('--no-bug', 'Clear the critical-bug flag (the owner only)')
  .option(...ROLE)
  .action(guard(async (id: string, opts: { as?: string; title?: string; story?: string; description?: string; priority?: string; feature?: string; size?: string; bug?: boolean }) => {
    const { as, ...edit } = opts;
    const card = await client().cards.edit(id, edit, { as });
    console.log(`${card.id} is edited`);
  }));

cardCommand
  .command('release <id>')
  .description("Free the holds on a story so another session can work it. The owner and the orchestrator release any hold; an agent run releases only its own. The story records who released whose")
  .option(...ROLE)
  .action(guard(async (id: string, opts: { as?: string }) => {
    const { card, released } = await client().cards.release(id, { as: opts.as });
    if (!released.length) console.log(`nothing holds ${card.id}`);
    for (const r of released) console.log(`released ${r.label}'s hold on ${card.id}`);
  }));

cardCommand
  .command('park <id> [note]')
  .description('Move an active card back to your inbox, keeping its stage; frees its lane slot. Approving it later returns it to that stage')
  .option(...ROLE)
  .action(guard(async (id: string, note: string | undefined, opts: { as?: string }) => {
    const { card, hint } = await client().cards.park(id, note, { as: opts.as });
    console.log(`${card.id} is parked`);
    console.log(chalk.cyan(hint));
  }));

cardCommand
  .command('done <id> [note]')
  .description('End a card whose work is finished; frees its lane slot (the owner decides)')
  .option(...ROLE)
  .action(guard(async (id: string, note: string | undefined, opts: { as?: string }) => {
    const { card, hint } = await client().cards.close(id, 'done', note, { as: opts.as });
    console.log(`${card.id} is done`);
    console.log(chalk.cyan(hint));
  }));

cardCommand
  .command('drop <id> <why>')
  .description('Drop a card you will not do, with the reason; frees its lane slot (the owner decides)')
  .option(...ROLE)
  .action(guard(async (id: string, why: string, opts: { as?: string }) => {
    const { card, hint } = await client().cards.close(id, 'dropped', why, { as: opts.as });
    console.log(`${card.id} is dropped`);
    console.log(chalk.cyan(hint));
  }));

// Short forms of the four commands a person types most.
export const startCommand = storyOptions(new Command('start')
  .description('Start a card: `codeloop start "<title>"` makes one (same as card new, plus its spec folder); `codeloop start c-123` starts a queued or proposed story at its start stage and makes it your active story')
  .argument('<title-or-id>')
  .option('--lane <lane>', 'Lane to start in', 'build')
  .option('--id <id>', 'Card id (default: next c-NNN)')
  .option('--stage <stage>', 'Start at this stage, for work already under way (the owner decides)')
  .option('--activate', 'Make the new card the active one (this session only inside an assistant), as `card activate` does')
  .option(...ROLE))
  .action(guard((title: string, opts: { lane: string; id?: string; as?: string; ticket?: string; stage?: string; activate?: boolean } & StoryFlags) => (CARD_REF.test(title.trim()) ? startExisting(title.trim(), opts) : start(opts.lane, title, opts))));

/** `codeloop bug "<title>"`: files the bug and makes it this session's story, so the fix's commit can name it. */
export const bugCommand = new Command('bug')
  .description('File a bug in one step: a trivial build story every pick takes first, made your active story; prints the `Card: c-NNN` line for the fix\'s commit')
  .argument('<title>')
  .option('--lane <lane>', 'Lane to file it in', 'build')
  .option('--force', 'File it although the title fails the story standard')
  .option(...ROLE)
  .action(guard(async (title: string, opts: { lane: string; force?: boolean; as?: string }) => {
    const { card } = await client().cards.new({ lane: opts.lane, title, size: 'trivial', bug: true, force: opts.force }, { as: opts.as });
    // Only the owner's flag puts a bug ahead of every pick; an agent run files a report that waits at the owner's gate, with nothing to activate.
    if (card.bug_reported_by) {
      console.log(`reported ${card.id} as a bug by ${card.bug_reported_by}; it waits for the owner to approve it`);
    } else {
      console.log(`filed ${card.id} in ${card.lane} at ${card.stage}, flagged as a bug`);
      if (!activateStarted) throw new Error('bug: no activation handler attached');
      await activateStarted(card.id);
    }
    console.log(`Card: ${card.id}`);
  }));

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
