import { spawn } from 'child_process';
import { Command } from 'commander';
import { fileURLToPath } from 'url';

// --jitless and a 1 MB young generation take the resident size from about 68 to 59 MiB (a bare node
// is 48); the daemon's work is a few file reads per request, so the slower code costs nothing. V8
// flags cannot change after start, so the daemon starts itself again with them and the first
// process returns, which is also what lets `codeloop hookd &` from a hook script finish at once.
const V8_FLAGS = ['--jitless', '--max-semi-space-size=1'];

export const hookdCommand = new Command('hookd')
  .description('The hook daemon: answers guard edit, bash, prompt and session for every session of this user over a socket (started by bin/codeloop-hook, exits after 10 idle minutes)')
  .option('--idle-minutes <n>', 'Minutes without a request before the daemon exits', '10')
  .action((opts: { idleMinutes: string }) => {
    const entry = fileURLToPath(new URL('../hookd-main.js', import.meta.url));
    spawn(process.execPath, [...V8_FLAGS, entry, opts.idleMinutes], { detached: true, stdio: 'ignore' }).unref();
  });
