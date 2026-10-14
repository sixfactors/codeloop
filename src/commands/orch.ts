import { Command } from 'commander';
import chalk from 'chalk';
import { briefPath, resolveAgent } from '../lib/agent.js';
import { findCard, readCards, RefusalError } from '../lib/cards.js';
import { loadLane } from '../lib/lane.js';
import { orchReport, orchRun, orchStatus, type OrchTurn } from '../lib/orch.js';
import { projectRoot } from '../lib/project-root.js';
import { guard } from './guard.js';

const turnLine = (t: OrchTurn) =>
  `  turn ${t.n} ${t.stage}: ${t.outcome === 'merged' ? chalk.green('merged') : chalk.red(t.outcome)}${t.merge ? ` ${t.merge.sha.slice(0, 8)}` : ''}${t.findings.length ? ` (${t.findings.join('; ')})` : ''}`;

export const orchCommand = new Command('orch')
  .description("Run a story's current stage through a builder agent in its own worktree, gate the hand-back and merge it")
  .argument('<card>')
  .option('--until <gate>', 'Keep going stage by stage until this gate or stage (any gate stops the run)')
  .option('--agent <name>', 'The agent to use (an entry under agents: in config.yaml)')
  .option('--dry-run', 'Print the steps a turn would take and the brief path; start nothing')
  .action(guard(async (id: string, opts: { until?: string; agent?: string; dryRun?: boolean }) => {
    const projectDir = projectRoot();
    if (opts.dryRun) {
      const card = findCard(readCards(projectDir).cards, id);
      const agent = resolveAgent(projectDir, opts.agent, loadLane(projectDir, card.lane).agent);
      [
        `1. worktree: create or reuse ../<repo>-wt-${card.id.toLowerCase()} on the story branch`,
        `2. brief: write ${briefPath(card)} with the orchestration rules and the hand-back line`,
        `3. builder: start agent ${agent.name} in the worktree, ${agent.timeoutMinutes} minute limit, CODELOOP_CARD=${card.id}`,
        '4. hand-back: take the newest hand-back recorded after the start (none fails the turn)',
        '5. gate: rerun the proof, the stage check and one claim',
        '6. merge: on a pass merge into the trunk and advance the card; on a fail keep the findings for the next brief',
        '7. report: record the turn in .codeloop/state/orch and write an orch activity line',
      ].forEach(l => console.log(`  ${l}`));
      console.log(`  dry run: nothing was started${opts.until ? ` (would run until ${opts.until})` : ''}`);
      return;
    }
    const result = await orchRun(projectDir, id, { agent: opts.agent, until: opts.until ?? undefined });
    result.turns.forEach(t => console.log(turnLine(t)));
    console.log(`  ${result.card}: stopped, ${result.stopped}`);
    if (result.turns.length && result.turns.every(t => t.outcome !== 'merged')) process.exitCode = 1;
  }));

orchCommand
  .command('status')
  .description('Every story under orchestration: stage, turns, last outcome, builder, idle minutes')
  .action(guard(async () => {
    const rows = orchStatus(projectRoot());
    if (!rows.length) return void console.log('  no story has been orchestrated');
    for (const r of rows) console.log(`  ${r.card}  ${r.gate ? chalk.yellow(`waiting: ${r.gate}`) : r.stage}  ${r.turns} turn${r.turns === 1 ? '' : 's'}, last ${r.lastOutcome ?? 'none'}, builder ${r.builder ?? 'none'}, idle ${r.idleMinutes} min  ${r.title}`);
  }));

orchCommand
  .command('report <card>')
  .description("The owner's paragraph: what works now, proof, what is left, the next gate")
  .action(guard(async (id: string) => {
    const report = orchReport(projectRoot(), id);
    if (!report.stage) throw new RefusalError(`no report for ${id}`);
    console.log(report.text);
  }));
