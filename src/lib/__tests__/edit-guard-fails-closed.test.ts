import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execute, SEPARATOR } from '../hookd.js';
import { withStdin } from '../../commands/guard-hooks.js';
import { lazyProgram } from '../../lazy.js';

let proj: string;
let savedEnv: NodeJS.ProcessEnv;
const BODY = JSON.stringify({ tool_input: { file_path: 'src/a.ts' } });

beforeEach(() => {
  savedEnv = { ...process.env };
  proj = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-edit-guard-')));
  mkdirSync(join(proj, '.codeloop'), { recursive: true });
  writeFileSync(join(proj, '.codeloop/config.yaml'), 'project:\n  name: demo\n');
  // A card record whose spec is not a path: the plan-scope check throws on it, outside any of the
  // guard's own refusals.
  writeFileSync(join(proj, '.codeloop/cards.json'), JSON.stringify({ version: 1, cards: [{ id: 'c-1', title: 'one', lane: 'build', stage: 'build', spec: 42 }] }));
});
afterEach(() => {
  process.env = savedEnv;
  rmSync(proj, { recursive: true, force: true });
});

const env = () => ({
  CODELOOP_PROJECT_DIR: proj,
  CODELOOP_CARD: 'c-1',
  CODELOOP_HOME: process.env.CODELOOP_HOME ?? '',
  CODELOOP_TEST_SANDBOX: process.env.CODELOOP_TEST_SANDBOX ?? '',
});

/** `codeloop guard edit` as the CLI runs it: the lazy program, with a non-exit throw ending as node's exit 1. */
async function cliExitCode(): Promise<number> {
  Object.assign(process.env, env());
  const program = (await lazyProgram(['node', 'codeloop', 'guard', 'edit']))!;
  const realExit = process.exit;
  let code: number | undefined;
  process.exit = ((c?: number) => {
    code = c ?? 0;
    throw new Error(`exit ${code}`);
  }) as typeof process.exit;
  try {
    await withStdin(BODY, () => program.parseAsync(['node', 'codeloop', 'guard', 'edit']));
    return code ?? 0;
  } catch {
    return code ?? 1;
  } finally {
    process.exit = realExit;
  }
}

describe('an edit guard that throws', () => {
  it('blocks the edit with exit 2 on both the daemon and the CLI path', async () => {
    const reply = await execute({ verb: 'edit', cwd: proj, args: [], env: env(), body: BODY });
    expect(reply, 'the daemon answers itself instead of handing the throw to the CLI').not.toBe('FALLBACK\n');
    expect(Number(reply.split('\n')[0])).toBe(2);
    expect(reply.slice(reply.indexOf(SEPARATOR))).toContain('edit guard failed');

    expect(await cliExitCode()).toBe(2);
  });
});
