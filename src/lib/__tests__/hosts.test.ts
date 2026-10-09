import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { saveBoard, createBoard, addTask } from '../board.js';
import { createCard } from '../engine.js';
import { render } from '../render.js';
import { installCi } from '../scaffold.js';
import { createApp } from '../server.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
let dir: string;

function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

function snapshot(root: string, rel = ''): Record<string, string> {
  return Object.assign({}, ...readdirSync(join(root, rel)).map(name => {
    const path = join(rel, name);
    return statSync(join(root, path)).isDirectory() ? snapshot(root, path) : { [path]: readFileSync(join(root, path), 'utf-8') };
  }));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-hosts-'));
  write('.codeloop/lanes/market.yaml', `id: market
version: 1
metric: { name: m, source: cards }
stages:
  - id: draft
    skill: blog
    output: marketing/{id}/blog.md
    done: { cmd: "true" }
    gate: { name: copy, approver: owner }
  - id: publish
    done: { cmd: "true" }
    gate: { name: publish, approver: owner, outward: true }
`);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('render', () => {
  it('changes nothing on a second run and keeps AGENTS.md text outside its block', () => {
    write('AGENTS.md', '# Agents\n\nHouse rules stay here.\n');

    const first = render(dir, ['claude', 'cursor', 'codex']);
    expect(first.written.sort()).toEqual([
      '.agents/skills/codeloop-market/SKILL.md',
      '.claude/agents/codeloop-market-draft.md',
      '.claude/agents/codeloop-market-publish.md',
      '.cursor/rules/codeloop-market.mdc',
      '.cursor/rules/codeloop.mdc',
      '.github/copilot-instructions.md',
      'AGENTS.md',
      'CLAUDE.md',
    ]);
    const before = snapshot(dir);

    expect(render(dir, ['claude', 'cursor', 'codex']).written).toEqual([]);
    expect(snapshot(dir)).toEqual(before);
    expect(before['AGENTS.md']).toMatch(/^# Agents\n\nHouse rules stay here\.\n\n<!-- codeloop:start -->[\s\S]*<!-- codeloop:end -->\n$/);
    expect(before['CLAUDE.md']).toMatch(/^<!-- codeloop:start -->[\s\S]*Active card: none[\s\S]*<!-- codeloop:end -->\n$/);
    expect(before['.github/copilot-instructions.md']).toMatch(/^<!-- codeloop:start -->[\s\S]*<!-- codeloop:end -->\n$/);
    expect(before['.cursor/rules/codeloop.mdc']).toMatch(/alwaysApply: true/);
  });
});

describe('init --ci', () => {
  it('writes the three workflows and leaves an existing one alone', () => {
    write('.github/workflows/codeloop-pr.yml', 'mine\n');

    const result = installCi(dir);
    expect(result.created.sort()).toEqual(['.github/workflows/codeloop-prod.yml', '.github/workflows/codeloop-staging.yml']);
    expect(readFileSync(join(dir, '.github/workflows/codeloop-pr.yml'), 'utf-8')).toBe('mine\n');
  });
});

describe('board server', () => {
  it('cannot change cards.json through PATCH /api/tasks/:id', async () => {
    createCard(dir, { lane: 'market', title: 't', id: 'c-1' });
    saveBoard(dir, addTask(createBoard(), { title: 'task' }));
    const cards = readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8');
    const { app, token } = createApp(dir);

    for (const id of ['t-001', 'c-1']) {
      await app.request(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-codeloop-token': token }, body: JSON.stringify({ status: 'done', stage: 'done', gate: null }) });
    }
    expect(readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8')).toBe(cards);
  });
});

describe('mcp server', () => {
  async function session(calls: { method: string; params?: unknown }[], env: NodeJS.ProcessEnv = {}): Promise<any[]> {
    const { CODELOOP_ROLE: _role, ...clean } = process.env;
    const child = spawn(process.execPath, [join(ROOT, 'dist/index.js'), 'mcp'], { cwd: dir, env: { ...clean, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
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

  it('lists its tools, returns a card over stdio, and refuses an approval without an owner role', async () => {
    createCard(dir, { lane: 'market', title: 'Launch post', id: 'c-1' });

    const [list, got, advanced, approved] = await session([
      { method: 'tools/list' },
      { method: 'tools/call', params: { name: 'get_card', arguments: { id: 'c-1' } } },
      { method: 'tools/call', params: { name: 'advance', arguments: { id: 'c-1' } } },
      { method: 'tools/call', params: { name: 'approve', arguments: { id: 'c-1' } } },
    ]);

    expect(list.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(['advance', 'answer', 'approve', 'ask', 'brief', 'check', 'get_card', 'inbox', 'next_up', 'propose', 'reject', 'task_done', 'wiki_capture', 'wiki_inject']);
    expect(JSON.parse(got.result.content[0].text)).toMatchObject({ id: 'c-1', title: 'Launch post', stage: 'draft', brief: { skill: 'blog', output: 'marketing/c-1/blog.md' } });
    expect(JSON.parse(advanced.result.content[0].text)).toMatchObject({ outcome: 'parked', gate: 'copy' });
    expect(approved.result.isError).toBe(true);
    expect(approved.result.content[0].text).toMatch(/needs owner; agent cannot approve/);
  }, 30_000);
});
