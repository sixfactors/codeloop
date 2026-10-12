import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getActiveCard, setActiveCard } from '../active-card.js';
import { render } from '../render.js';
import { guardSignal, WARNINGS_PATH } from '../../watch/guard.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'dist/index.js');
let dir: string;

function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

/** A card file written directly (no lane needed): one card at `stage`, optionally with a spec folder. */
function writeCard(id: string, stage: string, extra: Record<string, unknown> = {}): void {
  const now = new Date().toISOString();
  write('.codeloop/cards.json', JSON.stringify({
    version: 1,
    cards: [{ id, title: `Card ${id}`, lane: 'build', laneVersion: 1, stage, retries: {}, evidence: [], events: [], createdAt: now, updatedAt: now, ...extra }],
  }, null, 2));
}

function cli(args: string[], opts: { input?: string; env?: NodeJS.ProcessEnv } = {}): { status: number | null; stdout: string; stderr: string } {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf-8', input: opts.input ?? '', env: { ...process.env, ...opts.env } });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-enforce-'));
  write('.codeloop/lanes/build.yaml', `id: build
version: 1
metric: { name: m, source: cards }
stages:
  - id: spec
    output: specs/{id}/plan.md
    done: { cmd: "true" }
`);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('render: protocol block', () => {
  it('fills the active-card line, is idempotent, and only the marked block changes when it does', () => {
    write('CLAUDE.md', '# My rules\n\nKeep this.\n');
    writeCard('c-1', 'spec');

    const first = render(dir, []);
    expect(first.written).toContain('CLAUDE.md');
    const claudeMdV1 = readFileSync(join(dir, 'CLAUDE.md'), 'utf-8');
    expect(claudeMdV1).toContain('# My rules\n\nKeep this.\n');
    expect(claudeMdV1).toContain('Active card: none');

    // Unchanged input -> unchanged output.
    const second = render(dir, []);
    expect(second.written).toEqual([]);
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf-8')).toBe(claudeMdV1);

    // Activating a card changes only the marked block's content, not the text around it.
    setActiveCard(dir, 'c-1');
    const third = render(dir, []);
    expect(third.written).toContain('CLAUDE.md');
    const claudeMdV2 = readFileSync(join(dir, 'CLAUDE.md'), 'utf-8');
    expect(claudeMdV2).toContain('# My rules\n\nKeep this.\n');
    expect(claudeMdV2).toContain('Active card: c-1');
    expect(claudeMdV2.split('<!-- codeloop:start -->')[0]).toBe(claudeMdV1.split('<!-- codeloop:start -->')[0]);
  });

  it('writes .cursor/rules/codeloop.mdc with alwaysApply: true and .github/copilot-instructions.md as a marked block', () => {
    mkdirSync(join(dir, '.github'), { recursive: true });
    render(dir, []);
    expect(readFileSync(join(dir, '.cursor/rules/codeloop.mdc'), 'utf-8')).toMatch(/alwaysApply: true/);
    expect(readFileSync(join(dir, '.github/copilot-instructions.md'), 'utf-8')).toMatch(/<!-- codeloop:start -->[\s\S]*<!-- codeloop:end -->/);
  });
});

describe('active-card state', () => {
  it('round-trips through setActiveCard/getActiveCard and `codeloop card activate`', () => {
    expect(getActiveCard(dir)).toBeUndefined();
    writeCard('c-9', 'spec');
    const result = cli(['card', 'activate', 'c-9']);
    expect(result.status).toBe(0);
    expect(getActiveCard(dir)).toBe('c-9');
  });
});

describe('guard edit (PreToolUse hook)', () => {
  it('exits 2 with no active card', () => {
    const result = cli(['guard', 'edit', 'src/x.ts']);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/no active card/);
  });

  it('exits 2 for a path outside the plan once the plan names files, and 0 for a path inside it', () => {
    writeCard('c-2', 'spec', { spec: 'specs/c-2' });
    write('specs/c-2/plan.md', '# c-2 plan\n\n## Files\n\n- src/allowed.ts\n- src/also/ok.ts\n');
    setActiveCard(dir, 'c-2');

    const outside = cli(['guard', 'edit', 'src/other.ts']);
    expect(outside.status).toBe(2);
    expect(outside.stderr).toMatch(/outside c-2's plan/);

    const inside = cli(['guard', 'edit', 'src/allowed.ts']);
    expect(inside.status).toBe(0);
    // The second file in the list counts too, not only the first.
    expect(cli(['guard', 'edit', 'src/also/ok.ts']).status).toBe(0);
  });

  it('never governs paths outside the repo, the codeloop folder, or the story\'s own working papers', () => {
    writeCard('c-2', 'build', { spec: 'specs/c-2' });
    write('specs/c-2/plan.md', '# c-2 plan\n\n## Files\n\n- src/allowed.ts\n');
    setActiveCard(dir, 'c-2');
    for (const p of [join(tmpdir(), 'scratch', 'notes.md'), '.codeloop/wiki/gotchas/x.md', 'specs/c-2/research.md', 'evidence/002/verify.md', 'usecases/002/uc-002-01.yaml']) {
      expect(cli(['guard', 'edit', p]).status, p).toBe(0);
    }
    expect(cli(['guard', 'edit', 'src/other.ts']).status).toBe(2);
  });

  it('only warns, and exits 0, when the plan has no `## Files` list yet', () => {
    writeCard('c-3', 'spec', { spec: 'specs/c-3' });
    write('specs/c-3/plan.md', '# c-3 plan\n\n## Files\n\n');
    setActiveCard(dir, 'c-3');

    const result = cli(['guard', 'edit', 'src/anything.ts']);
    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/no `## Files` list/);
  });

  it('reads tool_input.file_path from stdin JSON when no path argument is given (the real Claude Code hook shape)', () => {
    writeCard('c-4', 'spec', { spec: 'specs/c-4' });
    write('specs/c-4/plan.md', '# c-4 plan\n\n## Files\n\n- src/ok.ts\n');
    setActiveCard(dir, 'c-4');

    const result = cli(['guard', 'edit'], { input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'src/elsewhere.ts' } }) });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/outside c-4's plan/);
  });
});

describe('a story per session', () => {
  const now = new Date().toISOString();
  const twoCards = () => {
    write('.codeloop/cards.json', JSON.stringify({ version: 1, cards: ['c-1', 'c-2'].map(id => ({ id, title: `Card ${id}`, lane: 'build', laneVersion: 1, stage: 'spec', spec: `specs/${id}`, retries: {}, evidence: [], events: [], createdAt: now, updatedAt: now })) }, null, 2));
    write('specs/c-1/plan.md', '# plan\n\n## Files\n\n- src/one.ts\n');
    write('specs/c-2/plan.md', '# plan\n\n## Files\n\n- src/two.ts\n');
  };
  const edit = (session: string, file: string) => cli(['guard', 'edit'], { input: JSON.stringify({ session_id: session, tool_name: 'Edit', tool_input: { file_path: file } }) });

  it('two sessions activate different stories and each guard reads its own', () => {
    twoCards();
    expect(cli(['card', 'activate', 'c-1'], { env: { CLAUDE_CODE_SESSION_ID: 's-a' } }).status).toBe(0);
    expect(cli(['card', 'activate', 'c-2'], { env: { CLAUDE_CODE_SESSION_ID: 's-b' } }).status).toBe(0);
    expect(edit('s-a', 'src/one.ts').status).toBe(0);
    expect(edit('s-b', 'src/two.ts').status).toBe(0);
  });

  it("refuses a file in another live session's story, naming that story", () => {
    twoCards();
    cli(['card', 'activate', 'c-1'], { env: { CLAUDE_CODE_SESSION_ID: 's-a' } });
    cli(['card', 'activate', 'c-2'], { env: { CLAUDE_CODE_SESSION_ID: 's-b' } });
    const r = edit('s-a', 'src/two.ts');
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/belongs to c-2/);
  });

  it("a session with no story of its own falls back to the repo's card, and release frees a session's story", () => {
    twoCards();
    setActiveCard(dir, 'c-1');
    expect(edit('s-new', 'src/one.ts').status).toBe(0);
    cli(['card', 'activate', 'c-2'], { env: { CLAUDE_CODE_SESSION_ID: 's-b' } });
    expect(edit('s-a', 'src/two.ts').status).toBe(2);
    cli(['guard', 'release'], { input: JSON.stringify({ session_id: 's-b' }) });
    expect(edit('s-a', 'src/two.ts').stderr).not.toMatch(/belongs to/);
  });
});

describe('shared paths are never leased', () => {
  it('matches exact files, folders and globs from leases.shared', async () => {
    const { isSharedPath } = await import('../plan-scope.js');
    write('.codeloop/config.yaml', 'leases:\n  shared:\n    - docs/README.md\n    - make/*.mk\n    - "**/openapi.json"\n    - generated/\n');
    expect(isSharedPath(dir, 'docs/README.md')).toBe(true);
    expect(isSharedPath(dir, 'make/db.mk')).toBe(true);
    expect(isSharedPath(dir, 'make/sub/db.mk')).toBe(false);
    expect(isSharedPath(dir, 'services/auth/openapi.json')).toBe(true);
    expect(isSharedPath(dir, 'openapi.json')).toBe(true);
    expect(isSharedPath(dir, 'generated/x/y.ts')).toBe(true);
    expect(isSharedPath(dir, 'src/one.ts')).toBe(false);
  });

  it("lets a session edit a shared file that another session's plan lists", () => {
    const now = new Date().toISOString();
    write('.codeloop/cards.json', JSON.stringify({ version: 1, cards: ['c-1', 'c-2'].map(id => ({ id, title: `Card ${id}`, lane: 'build', laneVersion: 1, stage: 'spec', spec: `specs/${id}`, retries: {}, evidence: [], events: [], createdAt: now, updatedAt: now })) }, null, 2));
    write('specs/c-1/plan.md', '# plan\n\n## Files\n\n- src/one.ts\n- make/db.mk\n');
    write('specs/c-2/plan.md', '# plan\n\n## Files\n\n- src/two.ts\n- make/db.mk\n');
    write('.codeloop/config.yaml', 'leases:\n  shared:\n    - make/*.mk\n');
    cli(['card', 'activate', 'c-1'], { env: { CLAUDE_CODE_SESSION_ID: 's-a' } });
    cli(['card', 'activate', 'c-2'], { env: { CLAUDE_CODE_SESSION_ID: 's-b' } });
    const r = cli(['guard', 'edit'], { input: JSON.stringify({ session_id: 's-a', tool_name: 'Edit', tool_input: { file_path: 'make/db.mk' } }) });
    expect(r.stderr).not.toMatch(/belongs to/);
    expect(r.status).toBe(0);
  });
});

describe('guard bash (assistant shell tool hook)', () => {
  const call = (command: string, format?: string) =>
    cli(['guard', 'bash', ...(format ? ['--format', format] : [])], { input: JSON.stringify({ tool_input: { command } }) });

  it('sends owner actions to the person as a permission prompt instead of running them silently', () => {
    for (const command of ['codeloop approve c-5', 'cd x && codeloop reject c-5 "no"', 'codeloop answer c-5 1 --accept', 'codeloop next c-5 --as owner', 'codeloop card done c-5']) {
      const r = call(command);
      expect(r.status, command).toBe(0);
      expect(JSON.parse(r.stdout).hookSpecificOutput, command).toMatchObject({ hookEventName: 'PreToolUse', permissionDecision: 'ask' });
    }
  });

  it('lets ordinary commands through, including agent-safe codeloop ones', () => {
    for (const command of ['npm test', 'codeloop brief c-5', 'codeloop next c-5', 'codeloop ask c-5 --file q.md', 'git commit -m "approve the copy"']) {
      const r = call(command);
      expect(r.status, command).toBe(0);
      expect(r.stdout.trim(), command).toBe('');
    }
  });

  it('answers Cursor in its beforeShellExecution format', () => {
    expect(JSON.parse(call('codeloop approve c-5', 'cursor').stdout)).toMatchObject({ permission: 'ask' });
    expect(JSON.parse(call('npm test', 'cursor').stdout)).toEqual({ permission: 'allow' });
  });
});

describe('guard prompt (UserPromptSubmit hook)', () => {
  it('prints the active card, its stage and its open-question count', () => {
    writeCard('c-5', 'spec');
    setActiveCard(dir, 'c-5');

    const result = cli(['guard', 'prompt'], { input: JSON.stringify({ prompt: 'anything' }) });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/active card c-5 \(spec\), 0 open question\(s\)/);
  });

  it('prints a no-active-card line and exits 0 when the repo has no stories at all', () => {
    const result = cli(['guard', 'prompt'], { input: '{}' });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/no active card/);
  });

  it('exits 2 and lists the open stories when stories exist and none is active', () => {
    writeCard('c-7', 'spec');
    const result = cli(['guard', 'prompt'], { input: JSON.stringify({ prompt: 'anything' }) });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/no active story/);
    expect(result.stderr).toMatch(/c-7/);
    expect(result.stderr).toMatch(/codeloop card activate c-7/);
  });
});

describe('headless runs (CODELOOP_CARD)', () => {
  it('guard prompt and guard edit treat the card named in CODELOOP_CARD as active, with no active-card file', () => {
    writeCard('c-9', 'build');
    const prompt = cli(['guard', 'prompt'], { input: JSON.stringify({ prompt: 'anything' }), env: { CODELOOP_CARD: 'c-9' } });
    expect(prompt.status).toBe(0);
    expect(prompt.stdout).toMatch(/active card c-9 \(build\)/);
    const edit = cli(['guard', 'edit'], { input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 'src/x.ts' } }), env: { CODELOOP_CARD: 'c-9' } });
    expect(edit.status).toBe(0);
  });
});

describe('git hooks when the repo already has one', () => {
  it('appends the guard under a marker after the existing script, once', () => {
    spawnSync('git', ['init', '-q'], { cwd: dir });
    write('.git/hooks/pre-commit', '#!/bin/sh\npnpm -s verify || exit 1\n');
    const result = cli(['init', '--hooks']);
    expect(result.status).toBe(0);
    const hook = readFileSync(join(dir, '.git/hooks/pre-commit'), 'utf-8');
    expect(hook.indexOf('pnpm -s verify')).toBeLessThan(hook.indexOf('# codeloop pre-commit'));
    expect(hook).toContain('codeloop guard diff --staged');
    cli(['init', '--hooks']);
    expect(readFileSync(join(dir, '.git/hooks/pre-commit'), 'utf-8').match(/# codeloop pre-commit/g)).toHaveLength(1);
  });
});

describe('git hooks under core.hooksPath (husky layout)', () => {
  it('appends the guards to .husky/<hook> instead of writing .git/hooks', () => {
    spawnSync('git', ['init', '-q'], { cwd: dir });
    spawnSync('git', ['config', 'core.hooksPath', '.husky/_'], { cwd: dir });
    write('.husky/pre-commit', '#!/bin/sh\nnpm test\n');
    const result = cli(['init', '--hooks']);
    expect(result.status).toBe(0);
    const hook = readFileSync(join(dir, '.husky/pre-commit'), 'utf-8');
    expect(hook).toContain('npm test');
    expect(hook).toContain('# codeloop pre-commit');
    expect(hook).toContain('codeloop guard diff --staged');
    expect(readFileSync(join(dir, '.husky/pre-push'), 'utf-8')).toContain('# codeloop pre-push');
    expect(existsSync(join(dir, '.git/hooks/pre-commit'))).toBe(false);
    const again = cli(['init', '--hooks']);
    expect(again.stdout).toContain('(unchanged)');
    expect(readFileSync(join(dir, '.husky/pre-commit'), 'utf-8').match(/# codeloop pre-commit/g)).toHaveLength(1);
  });
});

describe('guard session (SessionStart hook)', () => {
  it('prints the active story and the brief instruction when one is active', () => {
    writeCard('c-5', 'spec');
    setActiveCard(dir, 'c-5');
    const result = cli(['guard', 'session']);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/active story c-5 Card c-5 \(build\/spec, 0 open question\(s\)\)/);
    expect(result.stdout).toMatch(/codeloop brief c-5/);
  });

  it('lists the top open stories and the activate command when none is active', () => {
    writeCard('c-7', 'spec');
    const result = cli(['guard', 'session']);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/no active story/);
    expect(result.stdout).toMatch(/c-7 .*Card c-7/);
    expect(result.stdout).toMatch(/codeloop card activate c-7/);
  });

  it('is installed as a SessionStart hook by the Claude hooks template', () => {
    const template = JSON.parse(readFileSync(join(ROOT, 'templates/hooks/claude-hooks.json'), 'utf-8'));
    expect(JSON.stringify(template.hooks.SessionStart)).toContain('codeloop guard session');
  });
});

describe('guard diff (pre-commit hook)', () => {
  it('exits 1 listing a staged file outside the plan, and 0 when every staged file is inside it', () => {
    spawnSync('git', ['init', '-q'], { cwd: dir });
    writeCard('c-6', 'spec', { spec: 'specs/c-6' });
    write('specs/c-6/plan.md', '# c-6 plan\n\n## Files\n\n- src/ok.ts\n');
    setActiveCard(dir, 'c-6');

    write('src/ok.ts', 'ok\n');
    write('src/bad.ts', 'bad\n');
    spawnSync('git', ['add', 'src/ok.ts', 'src/bad.ts'], { cwd: dir });

    const refused = cli(['guard', 'diff', '--staged']);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/outside c-6's plan/);
    expect(refused.stderr).toMatch(/src\/bad\.ts/);

    spawnSync('git', ['reset', 'src/bad.ts'], { cwd: dir });
    const ok = cli(['guard', 'diff', '--staged']);
    expect(ok.status).toBe(0);
  });
});

describe('pre-commit and pre-push git hooks (templates/hooks/)', () => {
  function installedRepo(): string {
    spawnSync('git', ['init', '-q'], { cwd: dir });
    const hooksDir = join(dir, '.git/hooks');
    mkdirSync(hooksDir, { recursive: true });
    for (const name of ['pre-commit', 'pre-push']) {
      const source = readFileSync(join(ROOT, 'templates/hooks', name), 'utf-8');
      writeFileSync(join(hooksDir, name), source);
      chmodSync(join(hooksDir, name), 0o755);
    }
    // A fake `codeloop` on PATH that runs the real built CLI, so the hooks (which shell out to
    // `codeloop`) exercise the actual guard/gate commands instead of a stub.
    const binDir = join(dir, '.bin');
    mkdirSync(binDir, { recursive: true });
    writeFileSync(join(binDir, 'codeloop'), `#!/bin/sh\nexec "${process.execPath}" "${CLI}" "$@"\n`);
    chmodSync(join(binDir, 'codeloop'), 0o755);
    return `${binDir}:${process.env.PATH}`;
  }

  it('pre-commit refuses a staged file outside the plan and allows one inside', () => {
    const PATH = installedRepo();
    writeCard('c-7', 'spec', { spec: 'specs/c-7' });
    write('specs/c-7/plan.md', '# c-7 plan\n\n## Files\n\n- src/ok.ts\n');
    setActiveCard(dir, 'c-7');

    write('src/ok.ts', 'ok\n');
    write('src/bad.ts', 'bad\n');
    spawnSync('git', ['add', 'src/ok.ts', 'src/bad.ts'], { cwd: dir });
    const refused = spawnSync(join(dir, '.git/hooks/pre-commit'), [], { cwd: dir, encoding: 'utf-8', env: { ...process.env, PATH } });
    expect(refused.status).toBe(1);

    spawnSync('git', ['reset', 'src/bad.ts'], { cwd: dir });
    const ok = spawnSync(join(dir, '.git/hooks/pre-commit'), [], { cwd: dir, encoding: 'utf-8', env: { ...process.env, PATH } });
    expect(ok.status).toBe(0);
  });

  it('pre-push refuses before the local gate is approved', () => {
    const PATH = installedRepo();
    writeCard('c-8', 'spec');
    setActiveCard(dir, 'c-8');

    write('.codeloop/lanes/build.yaml', `id: build
version: 1
metric: { name: m, source: cards }
stages:
  - id: spec
    output: specs/{id}/plan.md
    done: { cmd: "true" }
    gate: { name: local, approver: owner }
`);
    const result = spawnSync(join(dir, '.git/hooks/pre-push'), [], { cwd: dir, encoding: 'utf-8', env: { ...process.env, PATH } });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/no approval for gate "local"/);
  });

  it('both hooks skip cleanly with CODELOOP_GUARD=off', () => {
    const PATH = installedRepo();
    const commit = spawnSync(join(dir, '.git/hooks/pre-commit'), [], { cwd: dir, encoding: 'utf-8', env: { ...process.env, PATH, CODELOOP_GUARD: 'off' } });
    const push = spawnSync(join(dir, '.git/hooks/pre-push'), [], { cwd: dir, encoding: 'utf-8', env: { ...process.env, PATH, CODELOOP_GUARD: 'off' } });
    expect(commit.status).toBe(0);
    expect(push.status).toBe(0);
  });
});

describe('watch --guard', () => {
  it('appends a warning to .codeloop/state/warnings.jsonl on a file change with no active card, and nothing when one is active', () => {
    guardSignal(dir, { type: 'file_change' }, true);
    const lines = readFileSync(join(dir, WARNINGS_PATH), 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ kind: 'no-active-card' });

    writeCard('c-10', 'spec');
    setActiveCard(dir, 'c-10');
    guardSignal(dir, { type: 'file_change' }, true);
    // Still one line: no new warning once a card is active.
    expect(readFileSync(join(dir, WARNINGS_PATH), 'utf-8').trim().split('\n')).toHaveLength(1);
  });

  it('writes nothing when --guard was not passed', () => {
    guardSignal(dir, { type: 'file_change' }, false);
    expect(() => readFileSync(join(dir, WARNINGS_PATH), 'utf-8')).toThrow();
  });
});

describe('MCP tools: brief, ask, answer, check, propose', () => {
  async function session(calls: { method: string; params?: unknown }[]): Promise<any[]> {
    const child = spawn(process.execPath, [CLI, 'mcp'], { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] });
    const responses = new Map<number, any>();
    let buffer = '';
    const done = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`mcp server did not answer; got ${responses.size} responses`)), 15_000);
      child.stdout.on('data', chunk => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop()!;
        for (const line of lines.filter(Boolean)) {
          const msg = JSON.parse(line);
          if (msg.id !== undefined) responses.set(msg.id, msg);
        }
        if (responses.size === calls.length + 1) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    const send = (msg: object) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);
    send({ id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } } });
    send({ method: 'notifications/initialized' });
    calls.forEach((call, i) => send({ id: i + 1, ...call }));
    try {
      await done;
    } finally {
      child.kill();
    }
    return calls.map((_, i) => responses.get(i + 1));
  }

  it('check returns the refusal message for a card that does not exist', async () => {
    const [result] = await session([{ method: 'tools/call', params: { name: 'check', arguments: { id: 'c-404' } } }]);
    expect(result.result.isError).toBe(true);
    expect(result.result.content[0].text).toMatch(/card "c-404" not found/);
  }, 20_000);

  it('check runs the stage command and reports pass/fail plus output', async () => {
    writeCard('c-11', 'spec');
    const [result] = await session([{ method: 'tools/call', params: { name: 'check', arguments: { id: 'c-11' } } }]);
    expect(JSON.parse(result.result.content[0].text)).toMatchObject({ passed: true });
  }, 20_000);

  it('brief returns the stage brief as plain text, not JSON-quoted', async () => {
    writeCard('c-12', 'spec');
    const [result] = await session([{ method: 'tools/call', params: { name: 'brief', arguments: { id: 'c-12' } } }]);
    expect(result.result.content[0].text).toMatch(/^# Stage brief: c-12 spec/);
  }, 20_000);

  it('ask adds a question and answer resolves it', async () => {
    writeCard('c-13', 'spec', { spec: 'specs/c-13' });
    const [asked, answered] = await session([
      { method: 'tools/call', params: { name: 'ask', arguments: { id: 'c-13', questions: ['Which provider?'] } } },
      { method: 'tools/call', params: { name: 'answer', arguments: { id: 'c-13', n: 1, text: 'Stripe' } } },
    ]);
    expect(JSON.parse(asked.result.content[0].text).added).toMatchObject([{ n: 1, question: 'Which provider?' }]);
    expect(JSON.parse(answered.result.content[0].text)).toMatchObject({ n: 1, answer: 'Stripe' });
  }, 20_000);

  it('propose creates a proposal that does not start work', async () => {
    // Same path as `codeloop card propose` / newProposal: titles must pass the story check.
    const [result] = await session([{ method: 'tools/call', params: { name: 'propose', arguments: { lane: 'build', title: 'Download every invoice as one CSV' } } }]);
    expect(JSON.parse(result.result.content[0].text)).toMatchObject({ lane: 'build', created: true });
  }, 20_000);
});
