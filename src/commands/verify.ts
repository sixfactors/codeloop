import { Command } from 'commander';
import chalk from 'chalk';
import { findCard, readCards } from '../lib/cards.js';
import { RefusalError } from '../lib/engine.js';
import { loadLanes } from '../lib/lane.js';
import { computeStats, type Stats } from '../lib/stats.js';
import { verify } from '../lib/verify.js';
import { guard } from './guard.js';

export const verifyCommand = new Command('verify')
  .description('Run the use cases for a card and write evidence. Exit 2: nothing to verify, or an acceptance line has no use case; 1: a use case failed; 4: --mutate found one that cannot fail; 5: --mutate could not run')
  .argument('<nnn>', 'Card number or id')
  .option('--mutate', 'Re-run on the commit before the feature (after config verify.setup, default `npm ci && npm run build`); a use case that still passes is vacuous')
  .option('--env <name>', 'Environment: api use cases use deploy.<name>.base_url from config.yaml')
  .option('--no-record', 'Do not add the evidence to the card')
  .action(guard(async (ref: string, opts: { mutate?: boolean; env?: string; record: boolean }) => {
    const result = await verify(process.cwd(), ref, opts);
    if (result.problem) console.error(chalk.red(`  ${result.problem}`));
    result.missing.forEach(us => console.error(chalk.red(`  acceptance line ${us} has no use case in usecases/`)));
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
  console.log(`  rework (rejects/approvals) ${n(s.rework)}`);
  console.log(`  stuck rate             ${pct(s.stuck_rate)}`);
  for (const [gate, rate] of Object.entries(s.first_pass_rate_by_gate)) console.log(`  first pass at ${gate.padEnd(16)} ${pct(rate)}`);
}

export const statsCommand = new Command('stats')
  .description('Autonomy numbers computed from card events')
  .option('--card <id>', 'One card')
  .option('--lane <id>', 'One lane')
  .option('--compare <versions...>', 'Two lane versions to compare, e.g. v1 v2')
  .option('--json', 'JSON output')
  .action(guard((opts: { card?: string; lane?: string; compare?: string[]; json?: boolean }) => {
    const projectDir = process.cwd();
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
    if (opts.json) console.log(JSON.stringify(stats, null, 2));
    else print(opts.card ?? opts.lane ?? 'all cards', stats);
  }));
