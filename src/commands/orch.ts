import { Command } from 'commander';
import chalk from 'chalk';
import { briefPath, resolveAgent } from '../lib/agent.js';
import { findCard, readCards, RefusalError } from '../lib/cards.js';
import { loadLane } from '../lib/lane.js';
import { orchInbox, orchReport, orchResume, orchRun, orchStatus, parseBuilder, type OrchTurn } from '../lib/orch.js';
import { projectRoot } from '../lib/project-root.js';
import { reportLines, reviewPass } from '../lib/review-pass.js';
import { guard } from './guard.js';

const turnLine = (t: OrchTurn) =>
  `  turn ${t.n} ${t.stage}: ${t.outcome === 'merged' ? chalk.green('merged') : t.outcome === 'briefed' ? chalk.yellow('briefed') : chalk.red(t.outcome)}${t.merge ? ` ${t.merge.sha.slice(0, 8)}` : ''}${t.findings.length ? ` (${t.findings.join('; ')})` : ''}`;

export const orchCommand = new Command('orch').description("Run a story's current stage through a builder in its own worktree, gate the hand-back and merge it: `orch <card>`, status, report, resume, inbox");

// `run` is the default subcommand, so `orch <card>` still works while status, report, resume and
// inbox win over the card argument; a card id is never one of those words.
orchCommand
  .command('run [card]', { isDefault: true })
  .description("Run a story's current stage through a builder (agent, live session or person); with --review and no card, review the board instead")
  .option('--review', 'Review every open story and fix what is wrong (place, close, write a stage, or ask), stopping at the run budget; prints fixed, asked and could-not-tell')
  .option('--changed', 'With --review: only the stories changed since the last review pass, as before each pick')
  .option('--until <gate>', 'Keep going stage by stage until this gate or stage (any gate stops the run)')
  .option('--agent <name>', 'The agent to use (an entry under agents: in config.yaml)')
  .option('--builder <kind>', 'Who builds: agent[:name] (default), session:<id-or-label-prefix> for a live session, or person')
  .option('--wait <minutes>', 'Minutes to wait for a session or person to hand back (default orch.wait_minutes, 120)')
  .option('--no-wait', 'Write the brief and return at once with outcome briefed; finish with `codeloop orch resume <card>`')
  .option('--dry-run', 'Print the steps a turn would take and the brief path; start nothing')
  .action(guard(async (id: string | undefined, opts: { until?: string; agent?: string; dryRun?: boolean; builder?: string; wait?: string | boolean; review?: boolean; changed?: boolean }) => {
    const projectDir = projectRoot();
    if (opts.review) {
      if (id) throw new RefusalError('--review reads the whole board; drop the card id, or run `codeloop orch run <card>` without --review');
      // The pass closes and places stories, which the engine lets `review` do past the agent refusal,
      // so a process started by `run --agent` may only preview it.
      if (!opts.dryRun && process.env.CODELOOP_AGENT_RUN) throw new RefusalError('this process was started by `codeloop run --agent` and acts as agent; `orch run --review` closes and places stories, which is the owner\'s. Use --dry-run to preview it');
      reportLines(reviewPass(projectDir, { all: !opts.changed, dryRun: opts.dryRun })).forEach(l => console.log(`  ${l}`));
      return;
    }
    if (!id) throw new RefusalError('name a story: `codeloop orch run <card>`, or review the board with `codeloop orch run --review`');
    if (opts.dryRun) {
      const card = findCard(readCards(projectDir).cards, id);
      const spec = parseBuilder(opts.builder, opts.agent);
      const agent = spec.kind === 'agent' ? resolveAgent(projectDir, spec.name, loadLane(projectDir, card.lane).agent) : undefined;
      [
        `1. worktree: create or reuse ../<repo>-wt-${card.id.toLowerCase()} on the story branch`,
        `2. brief: write ${briefPath(card)} with the orchestration rules and the hand-back line`,
        agent ? `3. builder: start agent ${agent.name} in the worktree, ${agent.timeoutMinutes} minute limit, CODELOOP_CARD=${card.id}` : `3. builder: hand the brief to ${spec.kind === 'person' ? 'the person' : `session ${(spec as { ref: string }).ref}`} through .codeloop/state/orch/outbox, then wait for the hand-back`,
        '4. hand-back: take the newest hand-back recorded after the start (none fails the turn)',
        '5. gate: rerun the proof, the stage check and one claim',
        '6. merge: on a pass merge into the trunk and advance the card; on a fail keep the findings for the next brief',
        '7. report: record the turn in .codeloop/state/orch and write an orch activity line',
      ].forEach(l => console.log(`  ${l}`));
      console.log(`  dry run: nothing was started${opts.until ? ` (would run until ${opts.until})` : ''}`);
      return;
    }
    const wait = opts.wait === false ? false : opts.wait !== undefined && opts.wait !== true ? Number(opts.wait) : undefined;
    if (typeof wait === 'number' && !(wait >= 0)) throw new RefusalError('--wait takes a number of minutes');
    const result = await orchRun(projectDir, id, { agent: opts.agent, until: opts.until ?? undefined, builder: opts.builder, wait });
    result.turns.forEach(t => console.log(turnLine(t)));
    console.log(`  ${result.card}: stopped, ${result.stopped}`);
    if (result.turns.length && result.turns.every(t => t.outcome !== 'merged' && t.outcome !== 'briefed')) process.exitCode = 1;
  }));

orchCommand
  .command('status')
  .description('Every story under orchestration: stage, turns, last outcome, builder, idle minutes')
  .action(guard(async () => {
    const rows = orchStatus(projectRoot());
    if (!rows.length) return void console.log('  no story has been orchestrated');
    for (const r of rows) console.log(`  ${r.card}  ${r.gate ? chalk.yellow(`waiting: ${r.gate}`) : r.stage}  ${r.turns} turn${r.turns === 1 ? '' : 's'}, last ${r.lastOutcome ?? 'none'}, builder ${r.builder ?? 'none'}, ${r.mode}${r.lease ? ', lease held' : ''}, idle ${r.idleMinutes} min  ${r.title}`);
  }));

orchCommand
  .command('report <card>')
  .description("The owner's paragraph: what works now, proof, what is left, the next gate")
  .action(guard(async (id: string) => {
    const report = orchReport(projectRoot(), id);
    if (!report.stage) throw new RefusalError(`no report for ${id}`);
    console.log(report.text);
  }));

orchCommand
  .command('resume <card>')
  .description('Finish a briefed turn: gate, merge and advance once its hand-back exists')
  .action(guard(async (id: string) => {
    console.log(turnLine(orchResume(projectRoot(), id)));
  }));

orchCommand
  .command('inbox')
  .description('Briefs addressed to this session or to "person" that no hand-back has answered yet')
  .action(guard(async () => {
    const briefs = orchInbox(projectRoot());
    if (!briefs.length) return void console.log('  no briefs waiting');
    for (const b of briefs) console.log(`\n=== ${b.card} turn ${b.n} (for ${b.to}) ===\n${b.text}`);
  }));
