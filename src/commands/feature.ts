import { Command } from 'commander';
import chalk from 'chalk';
import type { FeatureNode, IndexedFeature, Rice } from '../sdk/index.js';
import { createLocalClient } from '../sdk/local.js';
import { guard, refuse } from './guard.js';

const client = () => createLocalClient(process.cwd());

const RICE_FLAGS = [
  ['--reach <n>', 'How many users it touches, 1–10'],
  ['--impact <n>', 'How much it moves the initiative metric, 1–10'],
  ['--confidence <n>', 'How sure the estimates are, 1–10'],
  ['--effort <weeks>', 'Weeks of work'],
] as const;

type RiceFlags = { reach?: string; impact?: string; confidence?: string; effort?: string };

/** All four flags or none; a partial set is refused so a page never carries half a score. */
function riceFrom(flags: RiceFlags): Rice | undefined {
  const given = (['reach', 'impact', 'confidence', 'effort'] as const).filter(k => flags[k] !== undefined);
  if (!given.length) return undefined;
  if (given.length < 4) throw refuse('rice needs all four: --reach, --impact, --confidence and --effort');
  const n = (k: keyof RiceFlags) => {
    const value = Number(flags[k]);
    if (!Number.isFinite(value)) throw refuse(`--${k} "${flags[k]}" is not a number`);
    return value;
  };
  return { reach: n('reach'), impact: n('impact'), confidence: n('confidence'), effort: n('effort') };
}

const rice = (f: IndexedFeature) => (f.rice ? `${f.rice.reach}·${f.rice.impact}·${f.rice.confidence}÷${f.rice.effort}` : 'unscored');
export const scoreLine = (f: IndexedFeature) => `${chalk.bold(f.band)} ${f.score === undefined ? '    -' : String(f.score).padStart(6)}`;

export function featureLine(f: IndexedFeature & Partial<Pick<FeatureNode, 'done' | 'total'>>): string {
  const chain = [f.initiative, f.epic].filter(Boolean).join(' › ');
  const stories = f.total !== undefined ? `  ${f.done}/${f.total} done` : '';
  return `  ${scoreLine(f)}  ${f.id.padEnd(28)} ${f.title}${stories}  ${chalk.dim(`${chain}  rice ${rice(f)}${f.release ? `  release ${f.release}` : ''}`)}`;
}

export const featureCommand = new Command('feature').description('Features: the capabilities stories roll up to, scored by RICE');

const newCmd = featureCommand
  .command('new <slug>')
  .description('Create .codeloop/wiki/features/<slug>.md')
  .requiredOption('--title <title>', 'What the user can now do')
  .requiredOption('--initiative <slug>', 'The initiative it serves')
  .option('--epic <slug>', 'The epic it belongs to')
  .option('--status <status>', 'planned, active, done', 'planned')
  .option('--release <tag>', 'Target release tag, or next')
  .option('--body <text>', 'A line or two on the capability');
for (const [flag, help] of RICE_FLAGS) newCmd.option(flag, help);
newCmd.action(guard(async (slug: string, opts: { title: string; initiative: string; epic?: string; status?: string; release?: string; body?: string } & RiceFlags) => {
  const feature = await client().features.new({ id: slug, title: opts.title, initiative: opts.initiative, epic: opts.epic, status: opts.status, release: opts.release, rice: riceFrom(opts), body: opts.body });
  console.log(`created feature ${feature.id} under ${[feature.initiative, feature.epic].filter(Boolean).join(' › ')}${feature.rice ? '' : ' (unscored: `codeloop feature score` sets rice)'}`);
}));

featureCommand
  .command('list')
  .description('Every feature with its score and band, highest first')
  .option('--json', 'JSON output')
  .option('--initiative <slug>')
  .option('--epic <slug>')
  .option('--band <band>', 'P1, P2, P3 or P4')
  .action(guard(async (opts: { json?: boolean; initiative?: string; epic?: string; band?: string }) => {
    const all = await client().features.list();
    const features = all
      .filter(f => (!opts.initiative || f.initiative === opts.initiative) && (!opts.epic || f.epic === opts.epic) && (!opts.band || f.band === opts.band.toUpperCase()))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.id.localeCompare(b.id));
    if (opts.json) console.log(JSON.stringify(features, null, 2));
    else if (!features.length) console.log('  no features');
    else features.forEach(f => console.log(featureLine(f)));
  }));

const scoreCmd = featureCommand.command('score <slug>').description('Set the RICE on a feature; the score and band are derived on every read');
for (const [flag, help] of RICE_FLAGS) scoreCmd.option(flag, help);
scoreCmd.action(guard(async (slug: string, opts: RiceFlags) => {
  const rice = riceFrom(opts);
  if (!rice) throw refuse('say the four numbers: --reach --impact --confidence --effort');
  await client().features.score(slug, rice);
  const scored = await client().features.get(slug);
  if (scored) console.log(featureLine(scored));
}));
