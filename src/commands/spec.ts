import { Command } from 'commander';
import chalk from 'chalk';
import { RefusalError, resolveRole } from '../lib/engine.js';
import { checkSpec, newSpec, readTasks, resolveSpecDir, tickTask } from '../lib/spec.js';
import { guard } from './guard.js';

export const specCommand = new Command('spec').description("A card's spec folder: research, spec, plan, tasks");

specCommand
  .command('new <card-id>')
  .description('Create specs/<nnn>-<slug>/ from the templates and record it on the card')
  .option('--as <role>', 'owner | reviewer | agent')
  .action(guard((cardId: string, opts: { as?: string }) => {
    const { dir, created } = newSpec(process.cwd(), cardId, resolveRole(opts.as));
    console.log(`  ${dir} (${created.length} files created)`);
  }));

specCommand
  .command('check <nnn>')
  .description('Exit 2 unless every task is tagged and every acceptance line has a task')
  .action(guard((ref: string) => {
    const dir = resolveSpecDir(process.cwd(), ref);
    const errors = checkSpec(process.cwd(), dir);
    errors.forEach(e => console.error(chalk.red(`  ${e}`)));
    if (errors.length) process.exit(2);
    const { tasks } = readTasks(process.cwd(), dir);
    console.log(`  ${dir} ok: ${tasks.length} tasks, ${tasks.filter(t => t.done).length} done`);
  }));

export const taskCommand = new Command('task').description('Tasks in a spec folder');

taskCommand
  .command('list <nnn>')
  .description('List tasks, optionally one layer')
  .option('--layer <layer>', 'api | sdk | ui | test | docs')
  .option('--json', 'JSON output')
  .action(guard((ref: string, opts: { layer?: string; json?: boolean }) => {
    const { tasks } = readTasks(process.cwd(), resolveSpecDir(process.cwd(), ref));
    const mine = tasks.filter(t => !opts.layer || t.layer === opts.layer);
    if (opts.json) console.log(JSON.stringify(mine, null, 2));
    else mine.forEach(t => console.log(`  [${t.done ? 'x' : ' '}] ${t.id} ${t.accept ?? '   '} ${t.layer.padEnd(4)} ${t.text}`));
  }));

taskCommand
  .command('done <nnn> <task>')
  .description('Tick a task')
  .action(guard((ref: string, task: string) => {
    tickTask(process.cwd(), resolveSpecDir(process.cwd(), ref), task);
    console.log(`  ${task} done`);
  }));

taskCommand
  .command('check <nnn>')
  .description('Exit 1 while any task is open')
  .option('--all-done', 'Require every task ticked')
  .action(guard((ref: string, opts: { allDone?: boolean }) => {
    if (!opts.allDone) throw new RefusalError('usage: codeloop task check <nnn> --all-done');
    const { tasks } = readTasks(process.cwd(), resolveSpecDir(process.cwd(), ref));
    const open = tasks.filter(t => !t.done);
    open.forEach(t => console.error(`  open: ${t.id} [${t.layer}] ${t.text}`));
    if (open.length || tasks.length === 0) {
      console.error(chalk.red(tasks.length ? `  ${open.length} of ${tasks.length} tasks open` : '  no tasks'));
      process.exit(1);
    }
    console.log(`  all ${tasks.length} tasks done`);
  }));
