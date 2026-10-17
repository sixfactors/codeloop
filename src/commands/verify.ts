import { Command } from 'commander';
import { isUnavailable, todaysStarts } from '../lib/agent-ledger.js';
import { loadAgents } from '../lib/agent.js';
import chalk from 'chalk';
import { findCard, readCards } from '../lib/cards.js';
import { runSelfcheck } from '../lib/selfcheck.js';
import { checkBudget } from '../lib/diff-budget.js';
import { checkHealth, formatHealth, projectHealth } from '../lib/health.js';
import { RefusalError } from '../lib/engine.js';
import { loadLanes } from '../lib/lane.js';
import { computeStats, type Stats } from '../lib/stats.js';
import { verify } from '../lib/verify.js';
import { guard } from './guard.js';
import { projectRoot } from '../lib/project-root.js';

export const verifyCommand = new Command('verify')
  .description('Run the use cases for a card and write evidence. Exit 2: nothing to verify, or an acceptance line has no use case; 1: a use case failed; 4: --mutate found one that cannot fail; 5: --mutate could not run')
  .argument('<nnn>', 'Card number or id')
  .option('--mutate', 'Re-run on the commit before the feature (after config verify.setup, default `npm ci && npm run build`); a use case that still passes is vacuous')
  .option('--env <name>', 'Environment: api use cases use deploy.<name>.base_url from config.yaml')
  .option('--no-record', 'Do not add the evidence to the card')
  .action(guard(async (ref: string, opts: { mutate?: boolean; env?: string; record: boolean }) => {
    const result = await verify(projectRoot(), ref, opts);
    if (result.problem) console.error(chalk.red(`  ${result.problem}`));
    result.missing.forEach(us => console.error(chalk.red(`  acceptance line ${us} has no use case: add a file in ${result.usecaseDir}/ whose \`accept:\` is ${us}`)));
    if (result.missing.length) {
      const n = result.usecaseDir?.split('/').pop() ?? 'nnn';
      console.error(chalk.dim(`  for example ${result.usecaseDir}/uc-${n}-01.yaml:\n    id: uc-${n}-01\n    accept: ${result.missing[0]}\n    failure_mode: "what breaks if this is wrong"\n    layers:\n      cli: { run: "npm test -- <the test>", expect: { exit: 0 } }`));
    }
    for (const c of result.cases) {
      console.log(`  ${c.pass ? chalk.green('pass') : chalk.red('FAIL')} ${c.id} (${c.accept}) ${c.layers.map(l => l.layer).join(', ') || 'no runnable layer'}`);
      c.layers.filter(l => !l.pass).forEach(l => console.error(chalk.dim(l.output.split('\n').map(x => `      ${x}`).join('\n'))));
    }
    if (result.mutate) console.log(`  mutate: ${result.mutate}`);
    result.vacuous.forEach(id => console.error(chalk.red(`  vacuous: ${id} still passes without the feature`)));
    if (result.cases.length) console.log(`  result: ${result.exitCode === 0 ? 'pass' : 'fail'} (${result.cases.filter(c => c.pass).length}/${result.cases.length} use cases, sha ${result.sha.slice(0, 7) || 'none'})`);
    process.exit(result.exitCode);
  }));

function print(label: string, s: Stats): void {
  const n = (v: number | null, unit = '') => (v === null ? '-' : `${Math.round(v * 100) / 100}${unit}`);
  const pct = (v: number | null) => (v === null ? '-' : `${Math.round(v * 100)}%`);
  console.log(chalk.bold(label));
  for (const m of s.metrics) console.log(`  ${m.lane.padEnd(10)} metric ${m.name}: ${m.value === null ? 'no-data' : m.value}${m.target ? ` (target ${m.target})` : ''}`);
  console.log(`  cards ${s.cards}, done ${s.done}`);
  console.log(`  human turns per card   ${n(s.human_turns_per_card)}`);
  console.log(`  unattended span        ${n(s.unattended_span_hours, 'h')}`);
  console.log(`  cycle time             ${n(s.cycle_time_hours, 'h')}`);
  console.log(`  trivial cycle time     ${n(s.trivial_cycle_time_hours, 'h')}`);
  console.log(`  rework (rejects/approvals) ${n(s.rework)}`);
  console.log(`  stuck rate             ${pct(s.stuck_rate)}`);
  for (const [gate, rate] of Object.entries(s.first_pass_rate_by_gate)) console.log(`  first pass at ${gate.padEnd(16)} ${pct(rate)}`);
  for (const [size, a] of Object.entries(s.agent_starts_by_size)) console.log(`  agent starts, ${size.padEnd(7)} to the first gate ${n(a.to_first_gate)}, build to done ${n(a.from_build)}`);
  if (s.agent_starts.length === 1) {
    const a = s.agent_starts[0];
    console.log(`  agent starts on ${a.card}: to the first gate ${a.to_first_gate ?? '-'}, from build ${a.from_build ?? '-'}`);
  }
}

export const statsCommand = new Command('stats')
  .description('Autonomy numbers computed from card events')
  .option('--card <id>', 'One card')
  .option('--lane <id>', 'One lane')
  .option('--compare <versions...>', 'Two lane versions to compare, e.g. v1 v2')
  .option('--json', 'JSON output')
  .action(guard((opts: { card?: string; lane?: string; compare?: string[]; json?: boolean }) => {
    const projectDir = projectRoot();
    const lanes = loadLanes(projectDir).filter(l => !opts.lane || l.id === opts.lane);
    const all = readCards(projectDir).cards;
    const one = opts.card ? findCard(all, opts.card).id : undefined;
    const cards = all.filter(c => (!one || c.id === one) && (!opts.lane || c.lane === opts.lane));

    if (opts.compare) {
      if (opts.compare.length !== 2) throw new RefusalError('--compare takes two versions, e.g. --compare v1 v2');
      const split = Object.fromEntries(opts.compare.map(v => {
        const version = parseInt(v.replace(/^v/, ''), 10);
        return [`v${version}`, computeStats(cards.filter(c => c.laneVersion === version), lanes)];
      }));
      if (opts.json) console.log(JSON.stringify(split, null, 2));
      else Object.entries(split).forEach(([v, s]) => print(`${opts.lane ?? 'all lanes'} ${v}`, s));
      return;
    }
    const stats = computeStats(cards, lanes);
    const agentStartsToday = todaysStarts(projectDir);
    if (opts.json) console.log(JSON.stringify({ ...stats, agentStartsToday }, null, 2));
    else {
      print(opts.card ?? opts.lane ?? 'all cards', stats);
      const agents = loadAgents(projectDir).agents;
      const rows = Object.entries(agents).map(([name, a]) => `${name} ${agentStartsToday[name] ?? 0}/${a.maxRunsPerDay}${isUnavailable(projectDir, name) ? ' (unavailable)' : ''}`);
      if (rows.length) console.log(`  agent starts today: ${rows.join(', ')}`);
    }
  }));

/** Registered under `card` in program.ts; it lives here because it shares verify's budget check. */
export const cardDiffCommand = new Command('diff')
  .description("Files, lines and commits in a card's diff and the verdict against its size budget, without running verify. Exit 1 when over budget")
  .argument('<id>', 'Card number or id')
  .action(guard((ref: string) => {
    const projectDir = projectRoot();
    const card = findCard(readCards(projectDir).cards, ref);
    const v = checkBudget(projectDir, card.id, card.size);
    console.log(`  files ${v.files}, lines ${v.lines}, commits ${v.commits}`);
    console.log(v.pass ? chalk.green(`  ${v.message}`) : chalk.red(`  ${v.message}`));
    if (!v.pass) process.exit(1);
  }));

/** Registered under `card` in program.ts: the builder's own run of what the gate would fail it on. */
export const cardSelfcheckCommand = new Command('selfcheck')
  .description("Run the stage check, check scope, check rubric and the diff budget in this work dir, one line each. Exit 1 if any fails; the result rides the hand-back and lets the gate skip the stage check")
  .argument('<id>', 'Card number or id')
  .action(guard((ref: string) => {
    const r = runSelfcheck(projectRoot(), ref);
    for (const s of r.steps) console.log(`  ${s.name}: ${s.pass ? chalk.green('pass') : chalk.red('fail')} - ${s.detail.replace(/\s+/g, ' ').slice(0, 200)}`);
    if (!r.pass) process.exit(1);
  }));

export const healthCommand = new Command('health')
  .description('Project health score: tests, lint, type errors, critical gotchas and TODOs. --ref scores an older commit')
  .option('--ref <sha>', 'Score this commit (exported to a temp dir) instead of the working tree')
  .action(guard((opts: { ref?: string }) => {
    formatHealth(projectHealth(projectRoot(), { ref: opts.ref })).forEach(l => console.log(`  ${l}`));
  }));

/** Registered under `card` in program.ts. */
export const cardHealthCommand = new Command('health')
  .description("Health score at the start of a card's story, at HEAD, and the change. Exit 1 when it fell beyond health.tolerance")
  .argument('<id>', 'Card number or id')
  .action(guard((ref: string) => {
    const projectDir = projectRoot();
    const card = findCard(readCards(projectDir).cards, ref);
    const v = checkHealth(projectDir, card.id);
    if (v.state === 'off') return console.log('  health: off');
    if (v.state === 'no-base') return console.log('  no commit before the story to compare against');
    console.log(`  before ${v.before!.score}`);
    console.log(`  after  ${v.after!.score}`);
    console.log(`  delta  ${v.delta! > 0 ? '+' : ''}${v.delta}`);
    if (!v.pass) {
      console.error(chalk.red(`  health fell beyond tolerance ${v.tolerance}`));
      process.exit(1);
    }
  }));
