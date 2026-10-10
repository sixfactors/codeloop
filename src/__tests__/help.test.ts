import { describe, expect, it } from 'vitest';
import { spawnSync } from 'child_process';
import { resolve } from 'path';
import type { Command } from 'commander';
import { buildProgram } from '../program.js';

const CLI = resolve('dist/index.js');

/** Every command path in the tree, nested ones included: `['card', 'new']`, `['import', 'speckit']`. */
function paths(command: Command, prefix: string[] = []): string[][] {
  return command.commands.flatMap(sub => {
    const path = [...prefix, sub.name()];
    return [path, ...paths(sub, path)];
  });
}

/** Prints a command's help in process; commander would exit, so exit is overridden on every node. */
function help(path: string[]): { ok: boolean; text: string } {
  const program = buildProgram();
  let text = '';
  const walk = (c: Command) => {
    c.exitOverride();
    c.configureOutput({ writeOut: s => (text += s), writeErr: s => (text += s) });
    c.commands.forEach(walk);
  };
  walk(program);
  try {
    program.parse(['node', 'codeloop', ...path, '--help']);
    return { ok: false, text };
  } catch (e) {
    return { ok: (e as { code?: string }).code === 'commander.helpDisplayed', text };
  }
}

describe('--help on every command, nested ones included', () => {
  const all = paths(buildProgram());

  it('the tree has the nested commands the docs name', () => {
    expect(all).toContainEqual(['card', 'new']);
    expect(all).toContainEqual(['import', 'speckit']);
    expect(all.length).toBeGreaterThan(60);
  });

  it('prints usage with the full path for each one', () => {
    const broken = all.map(path => ({ path, ...help(path) })).filter(r => !r.ok || !r.text.includes(`Usage: codeloop ${r.path.join(' ')}`));
    expect(broken.map(b => `${b.path.join(' ')}: ${b.text.split('\n')[0]}`)).toEqual([]);
  });

  it('the built CLI answers the same for a nested command (the in-process check could pass on a tree the binary does not ship)', () => {
    for (const path of [['card', 'new'], ['import', 'speckit'], ['card', 'run']]) {
      const run = spawnSync('node', [CLI, ...path, '--help'], { encoding: 'utf-8' });
      expect(run.status, path.join(' ')).toBe(0);
      expect(run.stdout).toContain(`Usage: codeloop ${path.join(' ')}`);
    }
  });
});
