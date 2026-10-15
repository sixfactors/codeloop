import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, sep } from 'path';
import { RefusalError } from './cards.js';
import { cronError } from './cron.js';
import { readOff } from './off.js';

export const RUN_LOG = '.codeloop/state/run.log';

const quote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;
const marker = (projectDir: string) => `# codeloop:${projectDir}`;

/** `30m`, `1h`, `6h`: only intervals that divide the hour or the day, since cron cannot say "every 45 minutes". */
export function everyToCron(every: string): string {
  const m = /^(\d+)(m|h)$/.exec(every);
  const n = m ? parseInt(m[1], 10) : 0;
  if (m?.[2] === 'm' && n >= 1 && n < 60 && 60 % n === 0) return `*/${n} * * * *`;
  if (m?.[2] === 'h' && n >= 1 && n <= 24 && 24 % n === 0) return n === 1 ? '0 * * * *' : n === 24 ? '0 0 * * *' : `0 */${n} * * *`;
  throw new RefusalError(`--every "${every}" is not an interval cron can run (5m, 10m, 15m, 20m, 30m, 1h, 2h, 3h, 4h, 6h, 12h, 24h); use --cron for anything else`);
}

/**
 * One crontab line. cron starts with a bare PATH, so the PATH of the installing shell is written
 * into the line: the agent command (claude, codex) has to be found at 3am too.
 */
export function scheduleLine(
  projectDir: string,
  opts: { cron: string; agent?: string | true; entry?: string; path?: string },
): string {
  const problem = cronError(opts.cron);
  if (problem) throw new RefusalError(problem);
  const entry = opts.entry ?? process.argv[1];
  const run = opts.agent ? ` --agent${opts.agent === true ? '' : ` ${opts.agent}`}` : '';
  const command = `cd ${quote(projectDir)} && PATH=${quote(opts.path ?? process.env.PATH ?? '')} ${quote(process.execPath)} ${quote(entry)} run${run} >> ${RUN_LOG} 2>&1`;
  // cron reads an unescaped % as the end of the command.
  return `${opts.cron} ${command.replaceAll('%', '\\%')} ${marker(projectDir)}`;
}

function readTable(crontab: string): string[] {
  const run = spawnSync(crontab, ['-l'], { encoding: 'utf-8' });
  if (run.error) throw new RefusalError(`could not run ${crontab}: ${run.error.message}`);
  // `crontab -l` exits 1 when the user has no crontab yet.
  return run.status === 0 ? run.stdout.split('\n').filter(l => l !== '') : [];
}

function writeTable(crontab: string, lines: string[]): void {
  const run = spawnSync(crontab, ['-'], { input: lines.length ? lines.join('\n') + '\n' : '', encoding: 'utf-8' });
  if (run.error || run.status !== 0) throw new RefusalError(`${crontab} refused the new table: ${run.error?.message ?? run.stderr.trim()}`);
}

const mine = (projectDir: string) => (line: string) => line.endsWith(marker(projectDir));

export function installSchedule(projectDir: string, line: string, crontab = 'crontab'): void {
  mkdirSync(dirname(join(projectDir, RUN_LOG)), { recursive: true });
  writeTable(crontab, [...readTable(crontab).filter(l => !mine(projectDir)(l)), line]);
}

export function removeSchedule(projectDir: string, crontab = 'crontab'): boolean {
  const table = readTable(crontab);
  const kept = table.filter(l => !mine(projectDir)(l));
  if (kept.length === table.length) return false;
  writeTable(crontab, kept);
  return true;
}

export function scheduleStatus(projectDir: string, crontab = 'crontab'): { line?: string; lastRun?: Date; lastOutput?: string } {
  const log = join(projectDir, RUN_LOG);
  const ran = existsSync(log);
  return {
    line: readTable(crontab).find(mine(projectDir)),
    ...(ran ? { lastRun: statSync(log).mtime, lastOutput: readFileSync(log, 'utf-8').trimEnd().split('\n').slice(-5).join('\n') } : {}),
  };
}

/**
 * What `guard session` does so the monitor keeps running without a person: when this repo has
 * agents configured and no crontab entry, install an hourly `run --agent`. Skipped with
 * `monitor: off`, with CODELOOP_NO_SCHEDULE=1, and for a project under the system temp folder (a
 * test fixture must never reach the user's crontab). Returns the one line to print, or undefined.
 */
export function ensureMonitorSchedule(projectDir: string, opts: { crontab?: string; hasAgents: boolean; monitorOn: boolean; entry?: string }): string | undefined {
  if (!opts.monitorOn || !opts.hasAgents || process.env.CODELOOP_NO_SCHEDULE === '1' || readOff(projectDir)) return undefined;
  const real = realpathSync(projectDir);
  if (real.startsWith(realpathSync(tmpdir()) + sep)) return undefined;
  const crontab = opts.crontab ?? 'crontab';
  try {
    if (scheduleStatus(projectDir, crontab).line) return undefined;
    installSchedule(projectDir, scheduleLine(projectDir, { cron: everyToCron('1h'), agent: true, ...(opts.entry ? { entry: opts.entry } : {}) }), crontab);
    return 'codeloop monitor: installed an hourly `codeloop run --agent` in your crontab (doctor tick included); `codeloop schedule remove` or `monitor: off` in config.yaml stops it';
  } catch (e) {
    return `codeloop monitor: not scheduled (${e instanceof Error ? e.message : String(e)}); \`codeloop schedule install --every 1h\` sets it up`;
  }
}
