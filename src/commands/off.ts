import { spawnSync } from 'child_process';
import { Command } from 'commander';
import { RefusalError } from '../lib/cards.js';
import { clearOff, offLine, parseDuration, readOff, writeOff } from '../lib/off.js';
import { projectRoot } from '../lib/project-root.js';
import { guard } from './guard.js';

export const offCommand = new Command('off')
  .description('Pause codeloop in this repo: hooks stop enforcing and recording, and no orch turn, run or doctor tick starts, until `codeloop on` or the --for time passes')
  .option('--for <duration>', 'How long: 45m, 2h, 1h30m. Without it the pause lasts until `codeloop on`')
  .option('--why <text>', 'Why, shown in the refusal and at session start', '')
  .action(guard((opts: { for?: string; why: string }) => {
    const projectDir = projectRoot();
    let until: string | null = null;
    if (opts.for) {
      const ms = parseDuration(opts.for);
      if (!ms) throw new RefusalError(`--for "${opts.for}" is not a duration; use 45m, 2h or 1h30m`);
      until = new Date(Date.now() + ms).toISOString();
    }
    const by = spawnSync('git', ['config', 'user.name'], { cwd: projectDir, encoding: 'utf-8' }).stdout.trim() || 'unknown';
    writeOff(projectDir, { until, why: opts.why, by, at: new Date().toISOString() });
    console.log(`  ${offLine(readOff(projectDir)!)}`);
    if (!until) console.log('  turn it back on with `codeloop on`');
  }));

export const onCommand = new Command('on')
  .description('End a `codeloop off` pause')
  .action(guard(() => {
    console.log(clearOff(projectRoot()) ? '  codeloop is on again' : '  codeloop was not off here');
    if (process.env.CODELOOP_OFF === '1') console.log('  CODELOOP_OFF=1 is still set in this environment; unset it');
  }));
