import { Command } from 'commander';
import { loadAgents, resolveAgent } from '../lib/agent.js';
import { RefusalError } from '../lib/cards.js';
import { clock } from '../lib/clock.js';
import { doctorTick, planRun, runDue, runDueWithAgent, type AgentWanted } from '../lib/run.js';
import { guard } from './guard.js';
import { projectRoot } from '../sdk/local.js';

interface RunOptions {
  due?: boolean;
  now?: string;
  json?: boolean;
  agent?: string | boolean;
  dryRun?: boolean;
  lane?: string;
  card?: string;
}

export const runCommand = new Command('run')
  .description('Start cards for due cron lanes, then advance every card that is not waiting for you until it stops on its own')
  .option('--due', 'Run what is due (the default; kept so older scripts still work)')
  .option('--agent [name]', 'First start a headless agent on each stage whose check does not pass yet (an entry under agents: in config.yaml)')
  .option('--no-agent', 'Only check and advance, even when config.yaml has run.agent: true')
  .option('--lane <id>', "Only this lane: its trigger and its cards; the other lanes' due slots are kept for the next full run")
  .option('--card <id>', 'Only this card; no lane trigger fires')
  .option('--dry-run', 'Print what would run; start nothing and change nothing')
  .option('--now <iso>', 'Treat this as the current time')
  .option('--json', 'JSON output')
  .action(guard(async (opts: RunOptions) => {
    const projectDir = projectRoot();
    const now = opts.now ? new Date(opts.now) : clock();
    if (Number.isNaN(now.getTime())) throw new RefusalError(`--now "${opts.now}" is not a date`);
    const requested = opts.agent ?? loadAgents(projectDir).runByDefault;
    const wanted: AgentWanted | null = requested ? { name: requested === true ? undefined : requested } : null;
    // Validated here, against no particular lane, so `--agent` with nothing configured (or a
    // name nobody set up) is refused at once rather than only when a card happens to be active.
    if (wanted) resolveAgent(projectDir, wanted.name);
    if (opts.lane && opts.card) throw new RefusalError('--lane and --card do not combine; name one');
    const filter = { lane: opts.lane, card: opts.card };
    if (opts.dryRun) {
      const plan = planRun(projectDir, wanted, now, filter);
      plan.forEach(l => console.log(`  ${l}`));
      console.log(`  dry run: nothing was started (${plan.length} ${plan.length === 1 ? 'card' : 'cards'} not waiting for you)`);
      return;
    }
    const result = wanted ? await runDueWithAgent(projectDir, wanted, now, filter) : runDue(projectDir, now, filter);
    // The doctor tick runs on a full run only: a run aimed at one card or lane does what it was asked.
    const doctor = filter.card || filter.lane ? [] : await doctorTick(projectDir, now, { skip: new Set(wanted ? result.advanced.map(a => a.id) : []), agent: wanted?.name });
    if (opts.json) {
      console.log(JSON.stringify({ ...result, doctor }, null, 2));
      return;
    }
    result.created.forEach(c => console.log(`  created ${c.id} in ${c.lane} (trigger: ${c.trigger})`));
    result.skipped.forEach(s => console.log(`  skipped ${s.lane}: ${s.reason}`));
    for (const l of result.lanes) {
      if (l.status === 'created') continue;
      console.log(`  lane ${l.lane} ${l.status === 'manual' ? 'has no trigger' : `${l.status} (${l.trigger}${l.note ? `: ${l.note}` : ''})`}`);
    }
    result.agents?.forEach(a => console.log(a.started
      ? `  ${a.id}: agent ${a.agent} ran ${a.stage} (${a.exit === 0 ? 'exit 0' : a.exit === null ? 'killed' : `exit ${a.exit}`}, ${Math.round(a.durationMs! / 1000)}s, ${a.log})`
      : `  ${a.id}: agent ${a.agent} not started: ${a.reason}`));
    result.advanced.forEach(a => {
      console.log(`  ${a.id}: ${a.outcome === 'unchanged' ? 'unchanged, waiting for work' : a.outcome === 'parked' ? 'waiting for you' : a.outcome}${a.note ? ` (${a.note})` : ''}`);
      if (a.next) console.log(`    ${a.next}`);
    });
    doctor.forEach(d => console.log(`  doctor ${d.id}: ${d.note}`));
    console.log(`  ${result.created.length} created, ${result.advanced.length} advanced${result.agents ? `, ${result.agents.filter(a => a.started).length} agent runs` : ''}${doctor.length ? `, ${doctor.length} doctor actions` : ''}`);
  }));

export const doctorCommand = new Command('doctor')
  .description('Run one doctor tick now: rerun the check of a stuck or failing story that work has landed on, nudge quiet builders, ask to park stale stories')
  .option('--json', 'JSON output')
  .action(guard(async (opts: { json?: boolean }) => {
    const actions = await doctorTick(process.cwd(), clock());
    if (opts.json) {
      console.log(JSON.stringify(actions, null, 2));
      return;
    }
    if (!actions.length) console.log('doctor: nothing to do');
    actions.forEach(d => console.log(`  doctor ${d.id}: ${d.note}`));
  }));
