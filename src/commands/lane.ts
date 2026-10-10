import { Command } from 'commander';
import chalk from 'chalk';
import { resolveRole } from '../lib/engine.js';
import { lintLane, loadLane, loadLanes, loadSkillsIndex } from '../lib/lane.js';
import { evalProposal, promote, propose, PROPOSALS_DIR, rollback } from '../lib/proposals.js';
import { guard } from './guard.js';

export const laneCommand = new Command('lane').description('Inspect, check and change lanes');

laneCommand
  .command('list')
  .description('List lanes')
  .action(guard(() => {
    const lanes = loadLanes(process.cwd());
    if (lanes.length === 0) console.log('  no lanes in .codeloop/lanes');
    for (const lane of lanes) {
      const trigger = lane.trigger?.cron ? `cron ${lane.trigger.cron}` : lane.trigger?.on ? `on ${lane.trigger.on}${lane.trigger.lane ? ` (${lane.trigger.lane})` : ''}` : 'manual';
      console.log(`  ${lane.id.padEnd(10)} v${lane.version}  ${lane.stages.map(s => s.id).join(' → ')}  ${chalk.dim(trigger)}`);
    }
  }));

laneCommand
  .command('show <id>')
  .description('Show one lane')
  .option('--json', 'JSON output')
  .action(guard((id: string, opts: { json?: boolean }) => {
    const lane = loadLane(process.cwd(), id);
    if (opts.json) {
      console.log(JSON.stringify(lane, null, 2));
      return;
    }
    console.log(`id: ${lane.id}`);
    console.log(`version: ${lane.version}`);
    console.log(`metric: ${lane.metric?.name} (${lane.metric?.source})${lane.metric?.target ? ` target ${lane.metric.target}` : ''}`);
    console.log(`wip: ${lane.wip ?? 'unlimited'}  retries: ${lane.retries}`);
    for (const s of lane.stages) {
      const gate = s.gate ? chalk.yellow(`  gate ${s.gate.name} (${s.gate.approver}${s.gate.outward ? ', public step' : ''})`) : '';
      console.log(`  ${s.id.padEnd(10)} ${(s.skill ?? [s.role ?? ''].flat().join(',')).padEnd(28)} ${chalk.dim(s.done?.cmd ?? `event ${s.done?.event}`)}${gate}`);
      for (const note of s.notes ?? []) console.log(chalk.dim(`             note: ${note}`));
    }
    if (lane.on_done?.start) console.log(`on_done: start ${lane.on_done.start}`);
    if (lane.on_done?.queue) console.log(`on_done: queue ${lane.on_done.queue}`);
  }));

laneCommand
  .command('lint')
  .description('Check every lane; exits 2 on any error')
  .action(guard(() => {
    const projectDir = process.cwd();
    const lanes = loadLanes(projectDir);
    const skills = loadSkillsIndex(projectDir);
    const errors = lanes.flatMap(lane => lintLane(lane, skills));
    for (const lane of lanes) {
      const target = lane.on_done?.start;
      if (target && !lanes.some(l => l.id === target)) errors.push(`lane ${lane.id}: on_done starts lane "${target}", which does not exist`);
      const queueTarget = lane.on_done?.queue;
      if (queueTarget && !lanes.some(l => l.id === queueTarget)) errors.push(`lane ${lane.id}: on_done queues lane "${queueTarget}", which does not exist`);
    }
    errors.forEach(e => console.error(chalk.red(`  ${e}`)));
    if (errors.length) process.exit(2);
    console.log(`  ${lanes.length} lanes ok${skills ? '' : chalk.dim(' (no skills index; skill names not checked)')}`);
  }));

laneCommand
  .command('propose')
  .description('Write lane-change proposals from repeated rejections and stuck stages')
  .action(guard(() => {
    const created = propose(process.cwd());
    if (created.length === 0) console.log('  no proposals: no stage has 3 rejections or 2 stucks on the current lane version');
    created.forEach(id => console.log(`  proposed ${PROPOSALS_DIR}/${id}`));
  }));

laneCommand
  .command('eval <proposal>')
  .description('Lint, fixture-test and replay a proposal; writes eval-result.json')
  .action(guard((id: string) => {
    const result = evalProposal(process.cwd(), id);
    result.lint.forEach(e => console.error(chalk.red(`  lint: ${e}`)));
    result.fixtures.forEach(f => console.log(`  ${f.ok ? chalk.green('ok  ') : chalk.red('FAIL')} ${f.stage} / ${f.fixture}: expected ${f.expect}, got ${f.got}`));
    result.vacuous.forEach(e => console.error(chalk.red(`  check: ${e}`)));
    result.replayed.forEach(r => console.log(`  ${r.passed ? chalk.green('ok  ') : r.accepted ? chalk.yellow('skip') : chalk.red('FAIL')} replay ${r.card} / ${r.stage}${!r.passed && r.accepted ? ' (accepted regression)' : ''}`));
    result.replay.forEach(e => console.error(chalk.red(`  replay: ${e}`)));
    console.log(result.green ? chalk.green(`  eval green for ${id}`) : chalk.red(`  eval red for ${id}`));
    process.exit(result.exitCode);
  }));

laneCommand
  .command('promote <proposal>')
  .description('Install an evaluated proposal as the live lane')
  .option('--as <role>', 'owner | reviewer | agent')
  .action(guard((id: string, opts: { as?: string }) => {
    const r = promote(process.cwd(), id, resolveRole(opts.as));
    console.log(`  lane ${r.lane} promoted${r.from === null ? '' : ` from v${r.from}`} to v${r.to}`);
    r.weakening.forEach(w => console.log(chalk.yellow(`  accepted weakening: ${w.detail}. Reason: ${w.reason}`)));
  }));

laneCommand
  .command('rollback <lane>')
  .description('Restore the previous version of a lane')
  .option('--as <role>', 'owner | reviewer | agent')
  .action(guard((id: string, opts: { as?: string }) => {
    const r = rollback(process.cwd(), id, resolveRole(opts.as));
    console.log(`  lane ${r.lane} rolled back from v${r.from} to v${r.to}`);
  }));
