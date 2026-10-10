import { Command } from 'commander';
import chalk from 'chalk';
import type { FixtureEvalResult } from '../sdk/index.js';
import { createLocalClient } from '../sdk/local.js';
import { guard, refuse } from './guard.js';

const client = () => createLocalClient(process.cwd());

function parseMin(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const min = Number(raw);
  if (Number.isNaN(min) || min < 0 || min > 1) throw refuse(`--min "${raw}" must be a number between 0 and 1`);
  return min;
}

const excerpt = (text: string, n = 120) => (text.length > n ? `${text.slice(0, n)}…` : text);

function printFixture(f: FixtureEvalResult): void {
  const status = f.pass ? chalk.green('PASS') : chalk.red('FAIL');
  const flag = f.doneCheckPassed ? '' : chalk.yellow(' [done-check failed, score capped at 0.5]');
  console.log(`\n${chalk.bold(f.fixture)}  score ${f.score.toFixed(2)} (min ${f.min})  ${status}${flag}`);
  if (f.gradeError) {
    console.log(chalk.red('  grader did not return valid JSON; raw reply:'));
    console.log(chalk.dim(`  ${excerpt(f.gradeError, 500)}`));
    return;
  }
  for (const l of f.lines) {
    console.log(`  ${l.pass ? chalk.green('yes') : chalk.red('no ')}  ${l.line}`);
    if (l.evidence) console.log(chalk.dim(`        ${excerpt(l.evidence)}`));
  }
}

export const skillCommand = new Command('skill').description('Skills (templates/skills/) and their eval fixtures');

skillCommand
  .command('list')
  .description('Every skill under the skills dir')
  .option('--skills-dir <dir>', 'Skills dir, relative to the project root (default templates/skills)')
  .option('--json', 'Print as JSON')
  .action(guard(async (opts: { skillsDir?: string; json?: boolean }) => {
    const names = await client().skills.list({ skillsDir: opts.skillsDir });
    if (opts.json) {
      console.log(JSON.stringify(names, null, 2));
      return;
    }
    if (names.length === 0) {
      console.log(`no skills under ${opts.skillsDir ?? 'templates/skills'}/`);
      return;
    }
    names.forEach(n => console.log(n));
  }));

skillCommand
  .command('show <name>')
  .description("A skill's SKILL.md: its frontmatter and its body")
  .option('--skills-dir <dir>', 'Skills dir, relative to the project root (default templates/skills)')
  .option('--json', 'Print as JSON')
  .action(guard(async (name: string, opts: { skillsDir?: string; json?: boolean }) => {
    const skill = await client().skills.show(name, { skillsDir: opts.skillsDir });
    if (opts.json) {
      console.log(JSON.stringify(skill, null, 2));
      return;
    }
    console.log(chalk.bold(skill.name));
    console.log(`  stage: ${skill.stage}`);
    console.log(`  lane: ${skill.lane}`);
    console.log(`  inputs: ${skill.inputs.join(', ') || '(none)'}`);
    console.log(`  outputs: ${skill.outputs.join(', ') || '(none)'}`);
    console.log(`  check: ${skill.check}`);
    if (skill.questions.length) console.log(`  questions: ${skill.questions.join(', ')}`);
    console.log();
    console.log(skill.body);
  }));

skillCommand
  .command('eval <name>')
  .description("Replay a skill's fixtures: the configured agent on the stage, the stage's check, then a graded run against checklist.md")
  .option('--fixture <id>', 'Only this fixture (default: every fixture under the skill)')
  .option('--agent <name>', 'The configured agent to use (default agents.default, or the only one configured)')
  .option('--min <0..1>', 'Score a fixture must reach to pass', '0.8')
  .option('--skills-dir <dir>', 'Skills dir, relative to the project root (default templates/skills)')
  .option('--fixtures-dir <dir>', 'Fixtures dir, relative to the project root (default fixtures/skills)')
  .option('--json', 'Print the report as JSON instead of a table')
  .action(guard(async (name: string, opts: { fixture?: string; agent?: string; min: string; skillsDir?: string; fixturesDir?: string; json?: boolean }) => {
    const report = await client().skills.eval(name, {
      fixture: opts.fixture,
      agent: opts.agent,
      min: parseMin(opts.min),
      skillsDir: opts.skillsDir,
      fixturesDir: opts.fixturesDir,
    });
    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
      if (!report.pass) process.exit(1);
      return;
    }
    report.fixtures.forEach(printFixture);
    const passed = report.fixtures.filter(f => f.pass).length;
    console.log(`\n${passed}/${report.fixtures.length} fixture(s) passed, agent ${report.agent}, min ${report.min}`);
    if (!report.pass) process.exit(1);
  }));
