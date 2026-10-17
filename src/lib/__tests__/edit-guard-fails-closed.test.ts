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

/** `codeloop guard <verb>` as the CLI runs it: the lazy program, with a non-exit throw ending as node's exit 1. */
async function cliExitCode(argv: string[] = ['guard', 'edit'], vars: Record<string, string> = env(), body = BODY): Promise<number> {
  Object.assign(process.env, vars);
  const program = (await lazyProgram(['node', 'codeloop', ...argv]))!;
  const realExit = process.exit;
  let code: number | undefined;
  process.exit = ((c?: number) => {
    code = c ?? 0;
    throw new Error(`exit ${code}`);
  }) as typeof process.exit;
  try {
    await withStdin(body, () => program.parseAsync(['node', 'codeloop', ...argv]));
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

describe('a shell guard', () => {
  const SHELL = JSON.stringify({ tool_input: { command: 'ls' } });
  // No card from the run and no session, so the guard reads the repo's active-card file.
  const shellEnv = () => {
    for (const k of ['CODELOOP_CARD', 'CLAUDE_CODE_SESSION_ID', 'CURSOR_SESSION_ID']) delete process.env[k];
    const { CODELOOP_CARD: _card, ...rest } = env();
    return rest;
  };

  it('that throws blocks the command with exit 2 on both the daemon and the CLI path', async () => {
    // A folder where the active-card file belongs: reading it throws EISDIR inside the guard.
    mkdirSync(join(proj, '.codeloop/state/active-card'), { recursive: true });
    const reply = await execute({ verb: 'bash', cwd: proj, args: ['--format', 'claude'], env: shellEnv(), body: SHELL });
    expect(reply, 'the daemon answers itself instead of handing the throw to the CLI').not.toBe('FALLBACK\n');
    expect(Number(reply.split('\n')[0])).toBe(2);
    expect(reply.slice(reply.indexOf(SEPARATOR))).toContain('shell guard failed');

    expect(await cliExitCode(['guard', 'bash'], shellEnv(), SHELL)).toBe(2);
  });

  it('lets a command through in a fresh repo with no cards.json', async () => {
    rmSync(join(proj, '.codeloop/cards.json'));
    const reply = await execute({ verb: 'bash', cwd: proj, args: ['--format', 'claude'], env: shellEnv(), body: SHELL });
    expect(reply.split('\n')[0]).toBe('0');

    expect(await cliExitCode(['guard', 'bash'], shellEnv(), SHELL)).toBe(0);
  });
});
