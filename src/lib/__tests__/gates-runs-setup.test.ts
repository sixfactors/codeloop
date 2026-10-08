import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { parse as parseYaml } from 'yaml';
import { createHttpClient } from '../../sdk/index.js';
import { createLocalClient } from '../../sdk/local.js';
import { findCard, readCards, type Card } from '../cards.js';
import { advanceCard, createCard, rejectCard } from '../engine.js';
import { describeAdvance, stageBrief } from '../flow.js';
import { closeIndex } from '../index/index.js';
import { runDue } from '../run.js';
import { createApp } from '../server.js';
import * as services from '../services.js';
import { computeStats } from '../stats.js';

const CLI = resolve('dist/index.js');
const TOKEN = 'test-token';
let dir: string;

function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

function lane(id: string, stages: string, extra = ''): void {
  write(`.codeloop/lanes/${id}.yaml`, `id: ${id}\nversion: 1\nmetric: { name: m, source: cards }\n${extra}stages:\n${stages}`);
}

const card = (id: string): Card => findCard(readCards(dir).cards, id);

// draft writes out/{id}.md and has an after-check gate; publish is a public step gated on entry.
const GATED_THEN_PUBLIC = `  - id: draft
    output: out/{id}.md
    done: { cmd: "test -f out/{id}.md" }
    gate: { name: copy, approver: owner }
  - id: publish
    done: { cmd: "test -f out/{id}.url" }
    gate: { name: publish, approver: owner, outward: true }
`;

/** A client over the Hono app in process, as an owner board with the write token. */
function overHttp(owner = true) {
  const { app } = createApp(dir, undefined, { token: TOKEN, owner });
  return createHttpClient({ token: TOKEN, fetch: (url, init) => app.request(url, init) });
}

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-gates-')));
  write('.codeloop/config.yaml', 'project:\n  name: demo\n');
});

afterEach(async () => {
  await closeIndex(dir);
  rmSync(dir, { recursive: true, force: true });
});

describe('reject at a gate asked on entry', () => {
  it('sends the card back to the stage before the gate, and the brief says it was a return', () => {
    lane('market', GATED_THEN_PUBLIC);
    createCard(dir, { lane: 'market', title: 'Launch post', id: 'c-001' });
    write('out/c-001.md', 'draft');
    advanceCard(dir, 'c-001');
    services.approve(dir, 'c-001', 'owner');
    expect(card('c-001')).toMatchObject({ stage: 'publish', gate: 'publish' });

    const report = services.reject(dir, 'c-001', 'owner', 'not this week');
    expect(report.summary).toBe('c-001 returned to draft: the publish gate was rejected before that stage ran; note recorded');
    expect(card('c-001').stage).toBe('draft');
    expect(card('c-001').gate).toBeUndefined();
    expect(stageBrief(dir, card('c-001'))!.feedback).toEqual([{ kind: 'returned', from: 'publish', note: 'not this week' }]);
    expect(stageBrief(dir, card('c-001'))!.rejections).toEqual(['not this week']);
  });

  it('keeps today\'s behaviour at a gate asked after the check: the card stays for a redo', () => {
    lane('market', GATED_THEN_PUBLIC);
    createCard(dir, { lane: 'market', title: 'Launch post', id: 'c-001' });
    write('out/c-001.md', 'draft');
    advanceCard(dir, 'c-001');
    const report = services.reject(dir, 'c-001', 'owner', 'no proof');
    expect(report.summary).toBe('c-001 rejected at draft; note recorded');
    expect(card('c-001').stage).toBe('draft');
    expect(card('c-001').gate).toBeUndefined();
    expect(stageBrief(dir, card('c-001'))!.feedback).toEqual([{ kind: 'rejected', note: 'no proof' }]);
  });

  it('stays put when the entry gate is on the first stage: there is nothing before it', () => {
    lane('ship', `  - id: live\n    done: { cmd: "true" }\n    gate: { name: prod, approver: owner, outward: true }\n`);
    createCard(dir, { lane: 'ship', title: 'Release', id: 'c-001' });
    rejectCard(dir, 'c-001', 'owner', 'freeze');
    expect(card('c-001').stage).toBe('live');
    expect(card('c-001').gate).toBeUndefined();
  });
});

describe('run --lane and --card', () => {
  const NIGHTLY = `  - id: capture\n    done: { cmd: "test -f nightly/{id}.md" }\n`;
  const BUILD = `  - id: ship\n    done: { cmd: "test -f out/{id}.md" }\n`;

  it('--lane runs only that lane and leaves the other lanes\' due slots for the next full run', () => {
    lane('build', BUILD);
    lane('nightly', NIGHTLY, 'trigger: { cron: "30 3 * * *" }\n');
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });
    write('out/c-001.md', 'x');
    const now = new Date('2026-10-07T03:45:00');

    const only = runDue(dir, now, { lane: 'build' });
    expect(only.advanced).toEqual([{ id: 'c-001', outcome: 'done' }]);
    expect(only.created).toEqual([]);
    expect(only.lanes).toEqual([{ lane: 'build', trigger: 'none', status: 'manual' }]);

    const full = runDue(dir, new Date('2026-10-07T03:50:00'));
    expect(full.created).toMatchObject([{ lane: 'nightly', trigger: 'cron 30 3 * * *' }]);
    expect(full.lanes).toEqual([
      { lane: 'build', trigger: 'none', status: 'manual' },
      { lane: 'nightly', trigger: 'cron 30 3 * * *', status: 'created', note: 'c-002' },
    ]);
    expect(runDue(dir, new Date('2026-10-07T03:55:00')).lanes).toMatchObject([{ lane: 'build' }, { lane: 'nightly', status: 'not due' }]);
  });

  it('--card runs one card and fires no trigger', () => {
    lane('build', BUILD);
    lane('nightly', NIGHTLY, 'trigger: { cron: "30 3 * * *" }\n');
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });
    createCard(dir, { lane: 'build', title: 'b', id: 'c-002' });
    write('out/c-002.md', 'x');
    const result = runDue(dir, new Date('2026-10-07T03:45:00'), { card: '2' });
    expect(result.advanced).toEqual([{ id: 'c-002', outcome: 'done' }]);
    expect(result.created).toEqual([]);
    expect(card('c-001').retries).toEqual({});
    expect(() => runDue(dir, new Date(), { lane: 'nope' })).toThrow(/lane "nope" not found/);
  });
});

describe('stats lane metrics', () => {
  it('derives a lane metric from the cards when the name is known, else no-data', () => {
    const at = (h: number) => new Date(Date.UTC(2026, 0, 1, h)).toISOString();
    const done = (id: string, lane: string, hours: number, reject = false): Card => ({
      id, title: id, lane, laneVersion: 1, stage: 'done', retries: {}, evidence: [], createdAt: at(0), updatedAt: at(hours),
      events: reject ? [{ at: at(1), actor: 'owner', human: true, action: 'reject', stage: 's', note: 'x' }] : [],
    });
    const cards = [done('c-1', 'build', 24), done('c-2', 'build', 72, true), { ...done('c-3', 'build', 1), stage: 'spec' }];
    const metric = (id: string, name: string, source = 'cards') => ({ id, version: 1, metric: { name, source }, retries: 3, stages: [] });
    const stats = computeStats(cards, [metric('build', 'cycle_time_days'), metric('clean', 'done_without_reject'), metric('other', 'nps'), metric('ga', 'done', 'analytics')]);
    expect(stats.metrics).toEqual([
      { lane: 'build', name: 'cycle_time_days', source: 'cards', value: 2 },
      { lane: 'clean', name: 'done_without_reject', source: 'cards', value: 0 },
      { lane: 'other', name: 'nps', source: 'cards', value: null },
      { lane: 'ga', name: 'done', source: 'analytics', value: null },
    ]);
    expect(computeStats(cards.map(c => ({ ...c, lane: 'clean' })), [metric('clean', 'done_without_reject')]).metrics[0].value).toBe(1);
  });
});

describe('adopt merges the skills index', () => {
  it('adds and updates entries from --from, keeps the rest, and drops entries whose file is gone unless --replace drops all', () => {
    write('.claude/commands/design.md', '---\ndescription: drafts\n---\n');
    write('team/skills/review/SKILL.md', '---\nname: review\ndescription: reviews\n---\n');
    // Explicit dirs throughout: the default set reaches into ~/.claude, which differs per machine.
    expect(services.adoptSkills(dir, { from: ['.claude/commands'] })).toMatchObject({ indexed: 1, added: 1, updated: 0, removed: 0 });
    expect(services.adoptSkills(dir, { from: ['team/skills'] })).toMatchObject({ indexed: 2, added: 1, updated: 0, removed: 0 });
    write('team/skills/review/SKILL.md', '---\nname: review\ndescription: reviews code\n---\n');
    expect(services.adoptSkills(dir, { from: ['team/skills'] })).toMatchObject({ indexed: 2, added: 0, updated: 1, removed: 0 });
    rmSync(join(dir, '.claude/commands/design.md'));
    expect(services.adoptSkills(dir, { from: ['team/skills'] })).toMatchObject({ indexed: 1, added: 0, updated: 0, removed: 1 });
    write('.claude/commands/design.md', '---\ndescription: drafts\n---\n');
    expect(services.adoptSkills(dir, { from: ['.claude/commands'] })).toMatchObject({ indexed: 2, added: 1 });
    expect(services.adoptSkills(dir, { from: ['team/skills'], replace: true })).toMatchObject({ indexed: 1, added: 0, removed: 1 });
  });
});

describe('init detection', () => {
  const init = (...args: string[]) => spawnSync('node', [CLI, 'init', '--tools', 'claude', '--starter', 'generic', ...args], { cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });

  it('reads package.json into quality_checks and the build lane, says what it found, and --starter still picks the config', () => {
    rmSync(join(dir, '.codeloop'), { recursive: true });
    write('package.json', JSON.stringify({ devDependencies: { next: '15', vitest: '3', typescript: '5' }, scripts: { test: 'vitest run', lint: 'eslint .', build: 'next build' } }));
    write('tsconfig.json', '{}');
    write('pnpm-lock.yaml', '');
    const out = init();
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('Detected next, vitest, scripts.test, scripts.lint, scripts.build in package.json (pnpm)');
    const config = parseYaml(readFileSync(join(dir, '.codeloop/config.yaml'), 'utf-8'));
    expect(config.quality_checks).toEqual({ all: [{ name: 'Lint', command: 'pnpm run lint' }, { name: 'Typecheck', command: 'npx tsc --noEmit' }, { name: 'Build', command: 'pnpm run build' }] });
    expect(config.scopes.all.paths).toEqual(['**/*']);
    expect(readFileSync(join(dir, '.codeloop/lanes/build.yaml'), 'utf-8')).toContain('--all-done && pnpm test"');
    expect(existsSync(join(dir, 'tasks/todo.md'))).toBe(false);
  });

  it('leaves an existing .claude/commands/ alone without --yes, and writes into it with --yes', () => {
    write('.claude/commands/mine.md', '---\ndescription: mine\n---\n');
    const out = init();
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('.claude/commands/ left alone (pass --yes to write into it)');
    expect(existsSync(join(dir, '.claude/commands/design.md'))).toBe(false);
    expect(existsSync(join(dir, '.codeloop/lanes/build.yaml'))).toBe(true);
    const again = init('--yes');
    expect(again.status).toBe(0);
    expect(existsSync(join(dir, '.claude/commands/design.md'))).toBe(true);
    expect(existsSync(join(dir, '.claude/commands/mine.md'))).toBe(true);
  });
});

describe('ticket-style titles', () => {
  it('takes the ACME-412: prefix as the ticket, checks the story on the rest, and serves it on the API', async () => {
    lane('build', `  - id: ship\n    done: { cmd: "true" }\n`);
    const local = createLocalClient(dir, { role: 'owner' });
    const made = await local.cards.new({ lane: 'build', title: 'ACME-412: add CSV export to invoices' });
    expect(made.card).toMatchObject({ id: 'c-001', ticket: 'ACME-412', title: 'add CSV export to invoices' });
    const flagged = await local.cards.new({ lane: 'build', title: 'Email invoices', ticket: 'ACME-9' });
    expect(flagged.card).toMatchObject({ ticket: 'ACME-9', title: 'Email invoices' });
    // A colon that is not a ticket is still a mechanism title, and the ticket does not excuse one.
    await expect(local.cards.new({ lane: 'build', title: 'fix: the export' })).rejects.toThrow(/title carries ":"/);
    await expect(local.cards.new({ lane: 'build', title: 'ACME-1: use `csv` from src/export.ts' })).rejects.toThrow(/title carries/);
    await local.close();

    const http = overHttp();
    expect((await http.cards.get('c-001'))?.ticket).toBe('ACME-412');
    expect((await http.cards.show('1')).card.ticket).toBe('ACME-412');
    const cli = spawnSync('node', [CLI, 'card', 'show', 'c-001'], { cwd: dir, encoding: 'utf-8' });
    expect(cli.stdout).toContain('ticket ACME-412');
    await http.close();
  });
});

describe('on_done is opt-in', () => {
  const BUILD = `  - id: ship\n    done: { cmd: "true" }\n`;
  const MARKET = `  - id: brief\n    done: { cmd: "true" }\n`;

  it('announces what it would start and starts nothing until lanes.auto_start is true', () => {
    lane('build', BUILD, 'on_done: { start: market }\n');
    lane('market', MARKET);
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });
    const off = advanceCard(dir, 'c-001');
    expect(off.outcome).toBe('done');
    expect(off.started).toEqual([]);
    expect(readCards(dir).cards).toHaveLength(1);
    expect(describeAdvance(dir, off).lines).toContain('on_done: would start market (lanes.auto_start is off); set lanes.auto_start: true in .codeloop/config.yaml to start it');

    write('.codeloop/config.yaml', 'lanes:\n  auto_start: true\n');
    createCard(dir, { lane: 'build', title: 'b', id: 'c-002' });
    const on = advanceCard(dir, 'c-002');
    expect(on.started.map(c => c.lane)).toEqual(['market']);
    expect(on.because).toEqual({ 'c-003': 'build.on_done' });
    expect(describeAdvance(dir, on).lines).toContain('started c-003 in market because build.on_done');
  });

  it('names the trigger when the follow-on lane declared it', () => {
    lane('build', BUILD);
    lane('market', MARKET, 'trigger: { on: lane.done, lane: build }\n');
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });
    const result = advanceCard(dir, 'c-001');
    expect(result.because).toEqual({ 'c-002': 'market.trigger lane.done' });
  });
});

describe('API: a stage run', () => {
  // The agent reads the brief and writes the Output file it names.
  const WRITES_OUTPUT = `sh -c 'out=$(sed -n "s/^Output: //p" | head -1); mkdir -p "$(dirname "$out")"; echo by-agent > "$out"' < {brief}`;
  const TWO = `  - id: draft\n    output: out/{id}.md\n    done: { cmd: "test -f out/{id}.md" }\n  - id: polish\n    done: { cmd: "test -f out/{id}.polished" }\n`;

  it('POST run answers at once; GET and the stream follow the check, the agent and the advance', async () => {
    lane('build', TWO);
    write('.codeloop/config.yaml', `agents:\n  default: fake\n  fake: { cmd: ${JSON.stringify(WRITES_OUTPUT)} }\n`);
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });
    const http = overHttp();
    const { runId } = await http.cards.run('c-001');
    expect(runId).toBe('c-001-draft-1');
    const early = await http.runs.get(runId);
    expect(early).toMatchObject({ runId, cardId: 'c-001', stage: 'draft', agent: 'fake', status: 'running' });
    expect(early!.startedAt).toMatch(/T/);

    const lines: string[] = [];
    let end: unknown;
    for await (const item of http.runs.stream(runId)) {
      if ('line' in item) lines.push(item.line);
      else end = item.end;
    }
    expect(end).toMatchObject({ runId, status: 'done', exit: 0, outcome: 'moved' });
    expect(lines[0]).toBe('run c-001-draft-1: c-001 draft');
    expect(lines).toContain('check: test -f out/c-001.md');
    expect(lines.at(-1)).toBe('c-001: moved');
    const final = await http.runs.get(runId);
    expect(final).toMatchObject({ status: 'done', exit: 0, outcome: 'moved' });
    expect(final!.endedAt).toMatch(/T/);
    expect(final!.log).toContain('agent fake exited 0');
    expect(card('c-001')).toMatchObject({ stage: 'polish' });
    expect(card('c-001').events.find(e => e.action === 'agent-run')).toMatchObject({ log: '.codeloop/state/agent-runs/c-001-draft-1.log' });
    expect(existsSync(join(dir, '.codeloop/state/agent-runs/c-001-draft-1.json'))).toBe(true);
    await http.close();
  });

  it('with no agent configured the check alone decides, a failing check is a failed run, and a parked card is refused', async () => {
    lane('build', TWO);
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });
    const http = overHttp();
    const { runId } = await http.cards.run('c-001');
    expect(await http.runs.wait(runId)).toMatchObject({ status: 'failed', exit: 1, outcome: 'failed' });
    expect((await http.runs.get(runId))!.log).toContain('no agent configured');
    expect(card('c-001').retries.draft).toBe(1);
    await expect(http.cards.run('c-001', { agent: 'nope' })).rejects.toThrow(/no agent is configured/);
    expect(await http.runs.get('c-001-draft-9')).toBeUndefined();

    lane('market', GATED_THEN_PUBLIC);
    createCard(dir, { lane: 'market', title: 'b', id: 'c-002' });
    write('out/c-002.md', 'x');
    advanceCard(dir, 'c-002');
    await expect(http.cards.run('c-002')).rejects.toThrow(/waiting for you at gate "copy"/);
    await http.close();
  });

  it('card run on the CLI waits for the run and prints its log', () => {
    lane('build', TWO);
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });
    write('out/c-001.md', 'by hand');
    const cli = spawnSync('node', [CLI, 'card', 'run', 'c-001'], { cwd: dir, encoding: 'utf-8' });
    expect(cli.status).toBe(0);
    expect(cli.stdout).toContain('run c-001-draft-1 started');
    expect(cli.stdout).toContain('c-001: moved');
    expect(cli.stdout).toMatch(/done: moved/);
  });
});

describe('API: the stage output file', () => {
  it('GET is null until PUT writes it under the lane\'s path, making the folders', async () => {
    lane('build', `  - id: draft\n    output: out/{nnn}/draft.md\n    done: { cmd: "true" }\n`);
    createCard(dir, { lane: 'build', title: 'a', id: 'c-007' });
    const http = overHttp();
    expect(await http.cards.output('c-007')).toEqual({ path: 'out/007/draft.md', text: null });
    expect(await http.cards.writeOutput('7', '# Draft\n')).toEqual({ path: 'out/007/draft.md', text: '# Draft\n' });
    expect(readFileSync(join(dir, 'out/007/draft.md'), 'utf-8')).toBe('# Draft\n');
    expect(await http.cards.output('c-007')).toEqual({ path: 'out/007/draft.md', text: '# Draft\n' });
    expect(card('c-007').events.at(-1)).toMatchObject({ action: 'output', note: 'out/007/draft.md' });
    await expect(http.cards.writeOutput('c-007', undefined as unknown as string)).rejects.toThrow(/text .* required/);
    await http.close();
  });

  it('refuses a path outside the project and a stage with no output', async () => {
    lane('build', `  - id: draft\n    output: "../{id}.md"\n    done: { cmd: "true" }\n  - id: ship\n    done: { cmd: "true" }\n`);
    createCard(dir, { lane: 'build', title: 'a', id: 'c-001' });
    const http = overHttp();
    await expect(http.cards.output('c-001')).rejects.toThrow(/outside the project/);
    await expect(http.cards.writeOutput('c-001', 'x')).rejects.toThrow(/outside the project/);
    expect(existsSync(join(dir, '..', 'c-001.md'))).toBe(false);
    advanceCard(dir, 'c-001');
    await expect(http.cards.output('c-001')).rejects.toThrow(/names no output file/);
    await http.close();
  });
});

describe('API: split', () => {
  it('makes siblings under the same feature with split_from, and refuses every title before making any', async () => {
    lane('build', `  - id: ship\n    done: { cmd: "true" }\n`);
    createCard(dir, { lane: 'build', title: 'Invoices export', id: 'c-001', fields: { feature: 'exports', initiative: 'billing', ticket: 'ACME-1' } });
    const http = overHttp();
    await expect(http.cards.split('c-001', ['Export as CSV', 'use src/export.ts'])).rejects.toThrow(/title carries/);
    expect(readCards(dir).cards).toHaveLength(1);
    const made = await http.cards.split('c-001', ['Export as CSV', 'ACME-2: Export as PDF']);
    expect(made.cards.map(c => ({ id: c.id, title: c.title, feature: c.feature, initiative: c.initiative, split_from: c.split_from, ticket: c.ticket, lane: c.lane }))).toEqual([
      { id: 'c-002', title: 'Export as CSV', feature: 'exports', initiative: 'billing', split_from: 'c-001', ticket: 'ACME-1', lane: 'build' },
      { id: 'c-003', title: 'Export as PDF', feature: 'exports', initiative: 'billing', split_from: 'c-001', ticket: 'ACME-2', lane: 'build' },
    ]);
    expect(made.hints).toHaveLength(2);
    expect(card('c-001').events.at(-1)).toMatchObject({ action: 'split', note: 'into c-002, c-003' });
    expect((await http.cards.get('c-003'))?.split_from).toBe('c-001');
    await expect(http.cards.split('c-001', [])).rejects.toThrow(/titles .* required/);
    await http.close();
  });
});

describe('API: setup', () => {
  it('detect, adopt and status answer over http what init and adopt do on the CLI', async () => {
    write('package.json', JSON.stringify({ dependencies: { express: '4' }, devDependencies: { jest: '29' }, scripts: { test: 'jest' } }));
    write('.claude/commands/design.md', '---\ndescription: drafts\n---\n');
    lane('build', `  - id: ship\n    done: { cmd: "true" }\n`);
    const http = overHttp();
    expect(await http.setup.status()).toEqual({ initialised: true, lanes: 1, skillsIndexed: 0, agentsConfigured: 0, agents: [] });
    expect(await http.setup.detect()).toMatchObject({ frameworks: ['express', 'jest'], packageManager: 'npm', scripts: { test: 'jest' }, testCommand: 'npm test', qualityChecks: [] });
    expect(await http.setup.adopt({ from: ['.claude/commands'] })).toEqual({ indexed: 1, added: 1, updated: 0, removed: 0, duplicates: [] });
    write('.codeloop/config.yaml', 'agents:\n  claude: { cmd: "claude -p < {brief}" }\n');
    expect(await http.setup.status()).toMatchObject({ skillsIndexed: 1, agentsConfigured: 1, agents: ['claude'] });
    await http.close();
  });
});
