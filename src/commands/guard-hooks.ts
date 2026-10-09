import { spawnSync } from 'child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { hostname } from 'os';
import { join } from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import { getActiveCard, setActiveCard } from '../lib/active-card.js';
import { findCard, readCards } from '../lib/cards.js';
import { resolveRole } from '../lib/engine.js';
import { openQuestions } from '../lib/interview.js';
import { pathInPlan, planFiles } from '../lib/plan-scope.js';
import { cardCommand } from './card.js';
import { guard } from './guard.js';

const PRESENCE_DIR = '.codeloop/state/presence';
const safeFile = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_');

function readStdin(): Promise<string> {
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

function sessionIdFrom(input: Record<string, unknown>): string {
  const id = input.session_id ?? input.sessionId ?? input.conversation_id;
  return String(id ?? `cursor-${process.ppid}`);
}

/**
 * `codeloop card activate <id>` is attached here, not in card.ts, so that file, one of the
 * "migrated" commands the layering test holds to the SDK, stays free of a direct .codeloop/state
 * read/write. This module is the one place that state lives, for every hook below too.
 */
cardCommand
  .command('activate <id>')
  .description('Mark a card as the active one in this repo; the guard hooks, the MCP server and `codeloop whoami` all read this')
  .action(guard(async (id: string) => {
    const card = findCard(readCards(process.cwd()).cards, id);
    setActiveCard(process.cwd(), card.id);
    console.log(`  active card: ${card.id}  ${card.title}`);
  }));

export const guardCommand = new Command('guard').description('Hooks that enforce the codeloop protocol regardless of what the chat says');

guardCommand
  .command('edit [path]')
  .description('PreToolUse hook for Edit|Write|MultiEdit: exits 2 with no active card, or when the path is outside the plan and the card is past its spec gate')
  .action(async (pathArg?: string) => {
    const projectDir = process.cwd();
    const input = await readStdinJson();
    const toolInput = input.tool_input as { file_path?: string; path?: string } | undefined;
    const path = pathArg ?? toolInput?.file_path ?? toolInput?.path;
    const activeId = getActiveCard(projectDir);
    if (!activeId) {
      console.error(chalk.red('codeloop: no active card for this repo, `codeloop start "<title>"` or `codeloop card activate <id>` first'));
      process.exit(2);
    }
    let card;
    try {
      card = findCard(readCards(projectDir).cards, activeId);
    } catch {
      console.error(chalk.red(`codeloop: active card ${activeId} no longer exists`));
      process.exit(2);
    }
    if (!path) return;
    const files = planFiles(projectDir, card);
    if (!files) {
      console.error(chalk.yellow(`codeloop: ${card.id} has no \`## Files\` list in its plan.md yet; not enforced`));
      return;
    }
    if (!pathInPlan(projectDir, files, path)) {
      console.error(chalk.red(`codeloop: ${path} is outside ${card.id}'s plan (${files.join(', ')})`));
      process.exit(2);
    }
  });

guardCommand
  .command('prompt')
  .description("UserPromptSubmit hook: prints the active card, its stage and open questions; flags a prompt whose words match none of the card's title (a heuristic, not a parser)")
  .action(async () => {
    const projectDir = process.cwd();
    const input = await readStdinJson();
    const activeId = getActiveCard(projectDir);
    if (!activeId) {
      console.log('codeloop: no active card, `codeloop start "<title>"` or `codeloop card activate <id>` first');
      return;
    }
    let card;
    try {
      card = findCard(readCards(projectDir).cards, activeId);
    } catch {
      console.log(`codeloop: active card ${activeId} not found`);
      return;
    }
    const open = openQuestions(projectDir, card).length;
    const prompt = typeof input.prompt === 'string' ? input.prompt.toLowerCase() : '';
    const keywords = card.title.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3);
    const matches = keywords.length === 0 || keywords.some(k => prompt.includes(k));
    const line = `codeloop: active card ${card.id} (${card.stage}), ${open} open question(s)`;
    console.log(matches ? line : `${line}, this request looks outside the active card (heuristic: none of its title words are in the prompt)`);
  });

guardCommand
  .command('diff')
  .description("Pre-commit hook: lists changed files outside the active card's plan; exits 1 when any are found and the plan has a files list")
  .option('--staged', 'Compare the git index instead of the working tree', false)
  .action(guard((opts: { staged?: boolean }) => {
    const projectDir = process.cwd();
    const activeId = getActiveCard(projectDir);
    if (!activeId) return;
    let card;
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
    const projectDir = process.cwd();
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
    const projectDir = process.cwd();
    const input = await readStdinJson();
    const file = join(projectDir, PRESENCE_DIR, `${safeFile(sessionIdFrom(input))}.json`);
    if (existsSync(file)) unlinkSync(file);
  });

presenceCommand
  .command('event <kind>')
  .description('subagentStart/subagentStop hooks: appends an event line to the session\'s presence log')
  .action(async (kind: string) => {
    const projectDir = process.cwd();
    const input = await readStdinJson();
    const dir = join(projectDir, PRESENCE_DIR);
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, `${safeFile(sessionIdFrom(input))}.events.jsonl`), `${JSON.stringify({ at: new Date().toISOString(), kind })}\n`);
  });

export const whoamiCommand = new Command('whoami')
  .description("This repo's active card, your git identity and role, and who else is present (from Cursor session hooks)")
  .action(() => {
    const projectDir = process.cwd();
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
