import { spawnSync } from 'child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, unlinkSync, writeFileSync } from 'fs';
import { hostname } from 'os';
import { basename, dirname, isAbsolute, join, relative } from 'path';
import { Command } from 'commander';

// The libraries behind the board, engine and plan scope are imported inside the actions that use
// them: `guard` runs on every tool call, and most calls (no active card, a shell command) need none.
const cardsLib = () => import('../lib/cards.js');
const planLib = () => import('../lib/plan-scope.js');
const servicesLib = () => import('../lib/services.js');
const interviewLib = () => import('../lib/interview.js');
import chalk from 'chalk';
import { activeSessions, clearActiveCard, currentSession, detectHost, getActiveCard, setActiveCard } from '../lib/active-card.js';
import { appendActivity } from '../lib/activity.js';
import { guard } from './guard.js';
import type { Card } from '../lib/cards.js';
import { projectRoot, workDir } from '../lib/project-root.js';
import { offLine, readOff } from '../lib/off.js';

/** True while `codeloop off` is in force here; checked first by every hook so a paused repo costs one file read and nothing else. */
const paused = (projectDir: string): boolean => readOff(projectDir) !== undefined;

const PRESENCE_DIR = '.codeloop/state/presence';
const safeFile = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_');

/** Set by the hook daemon, which receives the hook's stdin in the request instead of from a pipe. */
let stdinText: string | undefined;
export async function withStdin<T>(text: string, fn: () => Promise<T>): Promise<T> {
  stdinText = text;
  try {
    return await fn();
  } finally {
    stdinText = undefined;
  }
}

function readStdin(): Promise<string> {
  if (stdinText !== undefined) return Promise.resolve(stdinText);
  return new Promise(resolve => {
    if (process.stdin.isTTY) {
      resolve('');
      return;
    }
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

async function readStdinJson(): Promise<Record<string, unknown>> {
  const text = await readStdin();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/**
 * The edited file as the activity line names it, from the project root. A host may name it through
 * a symlinked prefix (macOS /var is /private/var), so a path that seems to sit outside the project
 * is compared again on real paths, through its nearest existing folder since the file may be new.
 */
function projectRelative(root: string, path: string): string {
  const projectDir = workDir(root);
  const abs = isAbsolute(path) ? path : join(projectDir, path);
  const rel = relative(projectDir, abs);
  if (!rel.startsWith('..')) return rel || path;
  try {
    let probe = abs;
    let rest = '';
    while (!existsSync(probe) && dirname(probe) !== probe) {
      rest = rest ? join(basename(probe), rest) : basename(probe);
      probe = dirname(probe);
    }
    const real = relative(realpathSync(projectDir), join(realpathSync(probe), rest));
    return real.startsWith('..') ? abs : real;
  } catch {
    return abs;
  }
}

function sessionIdFrom(input: Record<string, unknown>): string {
  const id = input.session_id ?? input.sessionId ?? input.conversation_id;
  return String(id ?? `cursor-${process.ppid}`);
}

/**
 * `codeloop card activate <id>` is attached here, not in card.ts, so that file, one of the
 * "migrated" commands the layering test holds to the SDK, stays free of a direct .codeloop/state
 * read/write. This module is the one place that state lives, for every hook below too.
 * Attached by the caller that loads card.ts, so the guard hooks do not load the card command.
 */
export function attachCardActivate(cardCommand: Command): void {
  if (cardCommand.commands.some(c => c.name() === 'activate')) return;
  cardCommand
    .command('activate <id>')
    .description('Mark a card as the active one in this repo; the guard hooks, the MCP server and `codeloop whoami` all read this')
    .action(guard(activateCard));
}

/** Marks the card active for this session (or the repo, in a plain terminal): `card activate` and `start --activate`. */
export async function activateCard(id: string): Promise<void> {
  const { findCard, readCards } = await cardsLib();
  const card = findCard(readCards(projectRoot()).cards, id);
  const session = currentSession();
  setActiveCard(projectRoot(), card.id, session);
  console.log(`  active card: ${card.id}  ${card.title}${session ? ' (this session only)' : ''}`);
}

export const guardCommand = new Command('guard').description('Hooks that enforce the codeloop protocol regardless of what the chat says');

guardCommand
  .command('edit [path]')
  .description('PreToolUse hook for Edit|Write|MultiEdit: exits 2 with no active card, or when the path is outside the plan and the card is past its spec gate')
  .action(async (path?: string) => {
    try {
      await guardEdit(path);
    } catch (e) {
      // A hook that exits 1 lets the edit through, so a guard that cannot decide refuses instead.
      console.error(editGuardFailed(e));
      process.exit(2);
    }
  });

/** The refusal printed when the edit guard throws, on the CLI and the daemon path alike. */
export const editGuardFailed = (e: unknown): string =>
  chalk.red(`codeloop: the edit guard failed (${e instanceof Error ? e.message : String(e)}), so the edit is refused until it can check`);

// Open stories by priority band, then score, then age: what a session with nothing active should pick from.
async function candidates(projectDir: string, limit: number): Promise<{ id: string; title: string; stage: string; band?: string }[]> {
  const order: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
  const { inLane } = await cardsLib();
  const { listCards } = await servicesLib();
  const open = (await listCards(projectDir)).filter(c => inLane(c as unknown as Card) && !c.gate);
  return open
    .sort((a, b) => (order[a.band ?? ''] ?? 9) - (order[b.band ?? ''] ?? 9) || (b.score ?? 0) - (a.score ?? 0) || a.createdAt.localeCompare(b.createdAt))
    .slice(0, limit)
    .map(c => ({ id: c.id, title: c.title, stage: c.stage, band: c.band }));
}

function candidateLines(list: { id: string; title: string; stage: string; band?: string }[]): string[] {
  return list.map(c => `  ${c.id}  ${c.band ?? '--'}  ${c.stage.padEnd(9)} ${c.title}`);
}

guardCommand
  .command('session')
  .description('SessionStart hook: prints the active story and its brief, or the top open stories by priority when none is active')
  .action(guardSession);

// Owner actions an assistant must never take in its own shell tool. The hook only fires for the
// assistant's tool calls, never for a command the person types (a terminal, or `!` in Claude Code).
const OWNER_ACTION = /\bcodeloop\s+(approve|reject|answer|cards?\s+(?:done|drop|approve|reject))\b|--as[ =](owner|reviewer)\b/;

guardCommand
  .command('bash')
  .description("PreToolUse hook for the assistant's shell tool: `codeloop approve`, `reject`, `answer`, `card done|drop` and `--as owner|reviewer` go to the person as a permission prompt; their Allow is the decision")
  .option('--format <format>', 'claude (PreToolUse JSON) or cursor (beforeShellExecution JSON)', 'claude')
  .action(guardBash);

guardCommand
  .command('release')
  .description("SessionEnd hook: releases this session's active story, so its files are free for other sessions")
  .action(async () => {
    if (paused(projectRoot())) return;
    const input = await readStdinJson();
    const session = currentSession(typeof input.session_id === 'string' ? input.session_id : undefined);
    if (session && existsSync(join(projectRoot(), '.codeloop'))) appendActivity(projectRoot(), getActiveCard(projectRoot(), session), { session, kind: 'end' });
    if (session) clearActiveCard(projectRoot(), session);
  });

guardCommand
  .command('stop')
  .description("Stop hook: records in the active story's activity that the session finished a turn")
  .action(async () => {
    const projectDir = projectRoot();
    if (paused(projectDir) || !existsSync(join(projectDir, '.codeloop'))) return;
    const input = await readStdinJson();
    const session = currentSession(typeof input.session_id === 'string' ? input.session_id : undefined);
    appendActivity(projectDir, getActiveCard(projectDir, session), { session, kind: 'stop' });
  });

guardCommand
  .command('commit')
  .description("post-commit hook: records the commit in the activity of each card its `Card:` (or `Feature:`) trailer names")
  .action(async () => {
    const projectDir = projectRoot();
    if (paused(projectDir) || !existsSync(join(projectDir, '.codeloop'))) return;
    const log = spawnSync('git', ['log', '-1', '--format=%H%x00%s%x00%(trailers:key=Card,valueonly,separator=%x2C)%x00%(trailers:key=Feature,valueonly,separator=%x2C)%x00%(trailers:key=Task,valueonly,separator=%x2C)'], { cwd: projectDir, encoding: 'utf-8' });
    if (log.status !== 0) return;
    const [sha, subject, cardTrailer, featureTrailer, taskTrailer] = log.stdout.replace(/\n$/, '').split('\0');
    const ids = (cardTrailer?.trim() ? cardTrailer : featureTrailer ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const { readCards } = await cardsLib();
    const { tickTaskFromCommit } = await import('../lib/spec.js');
    let known: Set<string>;
    try { known = new Set(readCards(projectDir).cards.map(c => c.id)); } catch { return; }
    const session = currentSession();
    for (const id of new Set(ids)) {
      if (!known.has(id)) continue;
      appendActivity(projectDir, id, { session, kind: 'commit', sha: sha.slice(0, 12), subject });
      for (const task of new Set((taskTrailer ?? '').split(',').map(s => s.trim()).filter(Boolean))) {
        const result = tickTaskFromCommit(projectDir, id, task);
        if (result === 'ticked') appendActivity(projectDir, id, { session, kind: 'task', task, sha: sha.slice(0, 12) });
        else if (result === 'unknown') console.error(`codeloop: ${id} has no task ${task} in tasks.md; trailer ignored`);
      }
    }
  });

guardCommand
  .command('prompt')
  .description("UserPromptSubmit hook: prints the active card, its stage and open questions; flags a prompt whose words match none of the card's title (a heuristic, not a parser)")
  .action(guardPrompt);

guardCommand
  .command('diff')
  .description("Pre-commit hook: lists changed files outside the active card's plan; exits 1 when any are found and the plan has a files list")
  .option('--staged', 'Compare the git index instead of the working tree', false)
  .action(guard(async (opts: { staged?: boolean }) => {
    const projectDir = projectRoot();
    if (paused(projectDir)) return;
    const activeId = getActiveCard(projectDir);
    if (!activeId) return;
    const { findCard, readCards } = await cardsLib();
    const { pathInPlan, planFiles } = await planLib();
    let card: Card;
    try {
      card = findCard(readCards(projectDir).cards, activeId);
    } catch {
      return;
    }
    const files = planFiles(projectDir, card);
    if (!files) {
      console.log(chalk.yellow(`  warning: ${card.id} has no \`## Files\` list in its plan.md; nothing enforced`));
      return;
    }
    const run = spawnSync('git', ['diff', '--name-only', ...(opts.staged ? ['--cached'] : [])], { cwd: projectDir, encoding: 'utf-8' });
    const changed = run.stdout.split('\n').map(s => s.trim()).filter(Boolean);
    const outside = changed.filter(f => !pathInPlan(projectDir, files, f));
    if (outside.length) {
      console.error(chalk.red(`  refused: these files are outside ${card.id}'s plan:`));
      outside.forEach(f => console.error(`    ${f}`));
      console.error(`  plan: ${files.join(', ')}`);
      process.exit(1);
    }
    console.log(`  ok: every changed file is in ${card.id}'s plan`);
  }));

export const presenceCommand = new Command('presence').description('Presence files Cursor session hooks write under .codeloop/state/presence/ (serving this over HTTP as GET /api/presence is not built yet)');

presenceCommand
  .command('start')
  .description('sessionStart hook: records host, session id and machine')
  .action(async () => {
    const projectDir = projectRoot();
    if (paused(projectDir)) return;
    const input = await readStdinJson();
    const sessionId = sessionIdFrom(input);
    const dir = join(projectDir, PRESENCE_DIR);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${safeFile(sessionId)}.json`), `${JSON.stringify({ host: 'cursor', sessionId, machine: hostname(), startedAt: new Date().toISOString() }, null, 2)}\n`);
  });

presenceCommand
  .command('end')
  .description('sessionEnd hook: clears the presence file')
  .action(async () => {
    const projectDir = projectRoot();
    if (paused(projectDir)) return;
    const input = await readStdinJson();
    const file = join(projectDir, PRESENCE_DIR, `${safeFile(sessionIdFrom(input))}.json`);
    if (existsSync(file)) unlinkSync(file);
  });

presenceCommand
  .command('event <kind>')
  .description('subagentStart/subagentStop hooks: appends an event line to the session\'s presence log')
  .action(async (kind: string) => {
    const projectDir = projectRoot();
    if (paused(projectDir)) return;
    const input = await readStdinJson();
    const dir = join(projectDir, PRESENCE_DIR);
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, `${safeFile(sessionIdFrom(input))}.events.jsonl`), `${JSON.stringify({ at: new Date().toISOString(), kind })}\n`);
  });

export const whoamiCommand = new Command('whoami')
  .description("This repo's active card, your git identity and role, and who else is present (from Cursor session hooks)")
  .action(async () => {
    const { resolveRole } = await import('../lib/engine.js');
    const projectDir = projectRoot();
    const active = getActiveCard(projectDir);
    console.log(active ? `  active card: ${active}` : '  active card: none');
    const name = spawnSync('git', ['config', 'user.name'], { cwd: projectDir, encoding: 'utf-8' }).stdout.trim();
    const email = spawnSync('git', ['config', 'user.email'], { cwd: projectDir, encoding: 'utf-8' }).stdout.trim();
    console.log(`  you: ${name || 'unknown'}${email ? ` <${email}>` : ''}  role: ${resolveRole()}`);
    const dir = join(projectDir, PRESENCE_DIR);
    const sessions = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')) : [];
    if (!sessions.length) {
      console.log('  no other sessions present');
      return;
    }
    console.log('  present:');
    for (const file of sessions) {
      try {
        const p = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
        console.log(`    ${p.host ?? '?'}  session ${p.sessionId ?? file.replace('.json', '')}  on ${p.machine ?? '?'}  since ${p.startedAt ?? '?'}`);
      } catch {
        // a malformed presence file is skipped, not fatal to whoami
      }
    }
  });

export const monitorCommand = new Command('monitor').description('What the monitor sees');
monitorCommand
  .command('stalled')
  .description('Builders holding a card that have written nothing to it for monitor.stall_minutes (default 30)')
  .action(async () => {
    const { stalledBuilders, stalledLines } = await servicesLib();
    const rows = stalledBuilders(projectRoot());
    for (const line of rows.length ? stalledLines(rows) : ['No stalled builders.']) console.log(line);
  });

/** Behind `guard edit` and the hook daemon. */
export async function guardEdit(pathArg?: string): Promise<void> {
  const projectDir = projectRoot();
  if (paused(projectDir)) return;
  const input = await readStdinJson();
  const toolInput = input.tool_input as { file_path?: string; path?: string } | undefined;
  const path = pathArg ?? toolInput?.file_path ?? toolInput?.path;
  const session = currentSession(typeof input.session_id === 'string' ? input.session_id : undefined);
  const activeId = getActiveCard(projectDir, session);
  if (!activeId) {
    console.error(chalk.red('codeloop: no active card for this repo, `codeloop start "<title>"` or `codeloop card activate <id>` first'));
    process.exit(2);
  }
  const { findCard, readCards } = await cardsLib();
  const { outsidePlanScope, isSharedPath, pathInPlan, planFiles } = await planLib();
  let card: Card;
  try {
    card = findCard(readCards(projectDir).cards, activeId);
  } catch {
    console.error(chalk.red(`codeloop: active card ${activeId} no longer exists`));
    process.exit(2);
  }
  if (!path) return;
  const file = projectRelative(projectDir, path);
  const edited = () => appendActivity(projectDir, card.id, { session, kind: 'edit', file });
  if (outsidePlanScope(projectDir, card, path)) {
    edited();
    return;
  }
  // Another live session's card claims the files its plan lists: refused here, naming that card,
  // so two sessions in one repo never edit the same file from different stories.
  for (const other of isSharedPath(projectDir, path) ? [] : activeSessions(projectDir)) {
    if (other.session === session || other.card === card.id) continue;
    let theirs;
    try { theirs = findCard(readCards(projectDir).cards, other.card); } catch { continue; }
    const leased = planFiles(projectDir, theirs);
    if (leased && pathInPlan(projectDir, leased, path)) {
      console.error(chalk.red(`codeloop: ${path} belongs to ${theirs.id} (${theirs.title}), which another session is working. Pick another file, or wait for it to finish.`));
      process.exit(2);
    }
  }
  const files = planFiles(projectDir, card);
  if (!files) {
    console.error(chalk.yellow(`codeloop: ${card.id} has no \`## Files\` list in its plan.md yet; not enforced`));
    edited();
    return;
  }
  if (!pathInPlan(projectDir, files, path)) {
    console.error(chalk.red(`codeloop: ${path} is outside ${card.id}'s plan (${files.join(', ')})`));
    process.exit(2);
  }
  edited();
}

/** Behind `guard session` and the hook daemon. */
export async function guardSession(): Promise<void> {
  const projectDir = projectRoot();
  if (!existsSync(join(projectDir, '.codeloop'))) return;
  const off = readOff(projectDir);
  if (off) {
    console.log(offLine(off));
    return;
  }
  const input = await readStdinJson();
  const session = currentSession(typeof input.session_id === 'string' ? input.session_id : undefined);
  const { DONE, DROPPED, findCard, findCardOrNone, readCards } = await cardsLib();
  const { monitorLines, monitorReport, stalledBuilders, stalledLines } = await servicesLib();
  const { ensureMonitorSchedule } = await import('../lib/schedule.js');
  const { monitorEnabled } = await import('../lib/run.js');
  const { loadAgents } = await import('../lib/agent.js');
  const { openQuestions } = await interviewLib();
  // The monitor first: what waits on a person, what is failing and its fix, what is stale.
  const { withCommitIndex } = await import('../lib/diff-budget.js');
  const { withCardsReadCache } = await cardsLib();
  const report = withCardsReadCache(() => withCommitIndex(projectDir, () => [...monitorLines(monitorReport(projectDir)), ...stalledLines(stalledBuilders(projectDir))]));
  for (const line of report) console.log(line);
  // And make sure something keeps acting on it between sessions.
  const scheduled = ensureMonitorSchedule(projectDir, { hasAgents: Object.keys(loadAgents(projectDir).agents).length > 0, monitorOn: monitorEnabled(projectDir) });
  if (scheduled) console.log(scheduled);
  let activeId = getActiveCard(projectDir, session);
  const pointed = activeId ? findCardOrNone(readCards(projectDir).cards, activeId) : undefined;
  // A finished story is never the one a session works: clear the pointer instead of naming it.
  if (activeId && pointed && (pointed.stage === DONE || pointed.stage === DROPPED)) {
    clearActiveCard(projectDir, session);
    if (getActiveCard(projectDir, session) === activeId) clearActiveCard(projectDir, undefined);
    console.log(`codeloop: ${pointed.id} is ${pointed.stage}, so it is no longer the active story`);
    activeId = undefined;
  }
  if (activeId) {
    appendActivity(projectDir, activeId, { session, kind: 'start', ...(detectHost(input) ? { host: detectHost(input) } : {}) });
    let card: Card;
    try {
      card = findCard(readCards(projectDir).cards, activeId);
    } catch {
      console.log(`codeloop: active story ${activeId} not found; \`codeloop card activate <id>\` to pick another`);
      return;
    }
    const open = openQuestions(projectDir, card).length;
    console.log(`codeloop: active story ${card.id} ${card.title} (${card.lane}/${card.stage}${card.gate ? `, waiting at gate ${card.gate}` : ''}, ${open} open question(s))`);
    console.log(`Run \`codeloop brief ${card.id}\` before any work; it names the stage, the skill, the output and the check.`);
    return;
  }
  const top = await candidates(projectDir, 3);
  if (top.length === 0) {
    console.log('codeloop: no stories yet. `codeloop start "<title>"` opens one; `codeloop card propose build "<title>"` queues one for the owner.');
    return;
  }
  console.log(`codeloop: no active story. ${top.length === 1 ? 'The open story' : 'Top open stories'} by priority:`);
  for (const line of candidateLines(top)) console.log(line);
  console.log(`\`codeloop card activate ${top[0].id}\` to take the first; \`codeloop inbox\` for what waits on a person.`);
}

/** Behind `guard bash` and the hook daemon. Each `codeloop card move` up to the next shell separator. */
const CARD_MOVE = /\bcodeloop\s+cards?\s+move\b[^;&|\n]*/g;
const WORD = /"([^"]*)"|'([^']*)'|(\S+)/g;

/** The id and stage of one `card move`, with options dropped wherever they sit. `--opt value` drops both. */
function moveArgs(text: string): { id?: string; stage?: string } {
  const words = [...text.replace(/^.*?\bmove\b/, '').matchAll(WORD)].map(w => ({ text: w[1] ?? w[2] ?? w[3], quoted: w[3] === undefined }));
  const positional: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w.quoted && w.text.startsWith('-')) {
      if (!w.text.includes('=') && words[i + 1] && !(words[i + 1].text.startsWith('-') && !words[i + 1].quoted)) i++;
      continue;
    }
    positional.push(w.text);
  }
  return { id: positional[0], stage: positional[1] };
}

/**
 * `card move` that crosses a gate (skips one ahead, undoes one passed, or clears the wait the card is
 * parked at) is the person's decision; a move between stages on one side of every gate is not.
 * Every move in a compound command is judged, and one that cannot be read against the board (an
 * unknown card or stage, an option where the id should be) is asked about rather than let through.
 * Reads the board, so it runs only when the command holds a card move.
 */
async function gateCrossingMove(command: string): Promise<string | undefined> {
  const moves = [...command.matchAll(CARD_MOVE)].map(m => m[0].trim());
  if (moves.length === 0) return undefined;
  let lib: { cards: Awaited<ReturnType<typeof cardsLib>>; loadLane: typeof import('../lib/lane.js').loadLane; projectDir: string };
  try {
    lib = { cards: await cardsLib(), loadLane: (await import('../lib/lane.js')).loadLane, projectDir: projectRoot() };
  } catch {
    return moves[0];
  }
  for (const move of moves) {
    try {
      const { id, stage } = moveArgs(move);
      if (!id || !stage) return move;
      const card = lib.cards.findCard(lib.cards.readCards(lib.projectDir).cards, id);
      const stages = lib.loadLane(lib.projectDir, card.lane).stages;
      const from = stages.findIndex(st => st.id === card.stage);
      const to = stages.findIndex(st => st.id === stage);
      if (from < 0 || to < 0) return move;
      const crossed = stages.slice(Math.min(from, to), Math.max(from, to)).some(st => st.gate);
      if (card.gate || crossed) return move;
    } catch {
      return move;
    }
  }
  return undefined;
}

export async function guardBash(opts: { format: string }): Promise<void> {
  const input = await readStdinJson();
  const toolInput = (input.tool_input ?? {}) as Record<string, unknown>;
  const command = String(toolInput.command ?? input.command ?? '');
  const moved = await gateCrossingMove(command);
  const hit = moved ? [moved] : OWNER_ACTION.exec(command);
  if (!hit) {
    // An owner action is not logged here: it runs only if the person allows it, and the engine
    // event it writes is mirrored into the stream then.
    const session = currentSession(typeof input.session_id === 'string' ? input.session_id : undefined);
    if (command && !paused(projectRoot()) && existsSync(join(projectRoot(), '.codeloop'))) appendActivity(projectRoot(), getActiveCard(projectRoot(), session), { session, kind: 'cmd', text: command });
    if (opts.format === 'cursor') console.log(JSON.stringify({ permission: 'allow' }));
    return;
  }
  // Asking, not refusing: the person sees the exact command and clicks Allow or Deny in their own
  // tool, so the decision stays theirs without them leaving the chat to type it.
  const reason = `codeloop: \`${hit[0].trim()}\` is your decision. Allow to run it as you, or Deny.`;
  if (opts.format === 'cursor') {
    console.log(JSON.stringify({ permission: 'ask', userMessage: reason, agentMessage: 'Waiting for the person to allow this codeloop decision.' }));
    return;
  }
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason } }));
}

/** `guard.prompt` in config.yaml: `nudge` (default) lets a prompt with no active story through with the open stories as context; `block` stops it. */
export async function promptGuardMode(projectDir: string): Promise<'nudge' | 'block'> {
  const { loadConfig } = await import('../lib/config.js');
  const guard = (loadConfig(projectDir) as { guard?: { prompt?: unknown } }).guard;
  return guard && typeof guard === 'object' && guard.prompt === 'block' ? 'block' : 'nudge';
}

function nudgeLines(top: { id: string; title: string; stage: string; band?: string }[]): string[] {
  return [
    'codeloop: no active story. Put this request on one before changing files:',
    '- it is one of these open stories: `codeloop card activate <id>`',
    ...candidateLines(top),
    '- it is new and small (one sitting: a fix, a doc, a page): `codeloop start "<title>" --size trivial --activate` (`--size S` for a few hours); it enters at build and skips research and spec',
    '- it is new and bigger, or it needs the person\'s call (approve, drop, scope): say which command they should run and why, and do not run it',
    'Then continue with the request.',
  ];
}

/** Behind `guard prompt` and the hook daemon. */
export async function guardPrompt(): Promise<void> {
  const projectDir = projectRoot();
  if (paused(projectDir)) return;
  // Not a codeloop project: nothing to say, and nothing worth loading the board libraries for.
  if (!existsSync(join(projectDir, '.codeloop'))) return;
  const input = await readStdinJson();
  const session = currentSession(typeof input.session_id === 'string' ? input.session_id : undefined);
  const activeId = getActiveCard(projectDir, session);
  if (!activeId) {
    // A repo with open stories and none active: the board's priority order decides what a session
    // works on, not the chat. The default (nudge) lets the prompt through with that list as context;
    // `guard.prompt: block` exits 2, which blocks the prompt. A repo with no stories yet is left
    // alone so the first session can start one.
    const top = await candidates(projectDir, 3);
    if (top.length === 0) {
      console.log('codeloop: no active card, `codeloop start "<title>"` or `codeloop card activate <id>` first');
      return;
    }
    // Nudge (the default): the prompt goes through with the board's picks as context, so the agent
    // puts the ask on a story itself. A small ask gets a trivial or S story, which enters at build.
    if (await promptGuardMode(projectDir) === 'nudge') {
      for (const line of nudgeLines(top)) console.log(line);
      return;
    }
    console.error(`codeloop: no active story, and ${top.length === 1 ? 'one is' : 'these are'} open. Activate one before working:`);
    for (const line of candidateLines(top)) console.error(line);
    console.error(`\`codeloop card activate ${top[0].id}\`, or \`codeloop start "<title>"\` for new work.`);
    process.exit(2);
  }
  const { findCard, readCards } = await cardsLib();
  const { openQuestions } = await interviewLib();
  let card: Card;
  try {
    card = findCard(readCards(projectDir).cards, activeId);
  } catch {
    console.log(`codeloop: active card ${activeId} not found`);
    return;
  }
  appendActivity(projectDir, card.id, { session, kind: 'prompt', ...(typeof input.prompt === 'string' ? { text: input.prompt } : {}) });
  const open = openQuestions(projectDir, card).length;
  const prompt = typeof input.prompt === 'string' ? input.prompt.toLowerCase() : '';
  const keywords = card.title.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3);
  const matches = keywords.length === 0 || keywords.some(k => prompt.includes(k));
  const line = `codeloop: active card ${card.id} (${card.stage}), ${open} open question(s)`;
  console.log(matches ? line : `${line}, this request looks outside the active card (heuristic: none of its title words are in the prompt)`);
}
