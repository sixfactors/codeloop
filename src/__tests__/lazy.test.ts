import { describe, expect, it } from 'vitest';
import { COMMANDS, lazyProgram } from '../lazy.js';
import { runCli } from './cli.js';

describe('lazy command loading', () => {
  it('every mapped name loads a command of that name or alias', async () => {
    const broken: string[] = [];
    for (const name of Object.keys(COMMANDS)) {
      const program = await lazyProgram(['node', 'codeloop', name]);
      if (!program?.commands.some(c => c.name() === name || c.aliases().includes(name))) broken.push(name);
    }
    expect(broken).toEqual([]);
  }, 30000);

  // Each command module has its own import order when loaded alone; a cycle between lib modules can
  // break one of them while the full program (which loads them all in another order) works.
  it('the built CLI prints --help for every lazily loaded command', () => {
    const failed = Object.keys(COMMANDS).filter(name => runCli([name, '--help']).status !== 0);
    expect(failed).toEqual([]);
  }, 60000);

  // The card command takes subcommands from verify.ts and guard-hooks.ts; in the built binary only
  // the lazy path wires them, and command objects are shared singletons in-process, so it takes a spawn to see a gap.
  it('the built CLI keeps card diff, health, selfcheck and activate when only `card` is loaded', () => {
    for (const sub of ['diff', 'health', 'selfcheck', 'activate']) {
      const run = runCli(['card', sub, '--help']);
      expect(run.status, sub).toBe(0);
      expect(run.stdout).toContain(`Usage: codeloop card ${sub}`);
    }
  });

  it('a name outside the map still reaches the full program', () => {
    const run = runCli(['--help']);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('guard');
    expect(run.stdout).toContain('skill');
  });
});
