import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { hostname } from 'os';
import { dirname, join } from 'path';

/** The person's own active card (a terminal with no host session): one per repo, as before. */
export const ACTIVE_CARD_PATH = '.codeloop/state/active-card';
/** One file per host session: `.codeloop/state/active/<session>.json`. */
export const ACTIVE_SESSIONS_DIR = '.codeloop/state/active';
/** A session that has not touched its file in this long is treated as gone. */
const STALE_MS = 24 * 60 * 60 * 1000;

export type SessionHost = 'claude' | 'cursor' | 'codex';

export interface SessionCard {
  session: string;
  card: string;
  startedAt: string;
  updatedAt: string;
  host?: SessionHost;
  machine?: string;
  /** What a person is shown in place of the session id: "claude on dean-mbp, since 19:01". */
  label?: string;
}

/**
 * Which assistant this process runs under: the hook's own input first (Cursor sends
 * `cursor_version`, Claude Code a transcript under `.claude/`), then the environment each host sets.
 */
export function detectHost(input: Record<string, unknown> = {}, env: NodeJS.ProcessEnv = process.env): SessionHost | undefined {
  if (input.cursor_version || env.CURSOR_SESSION_ID || env.CURSOR_TRACE_ID) return 'cursor';
  if (env.CODEX_SESSION_ID || env.CODEX_SANDBOX || env.CODEX_HOME) return 'codex';
  if ((typeof input.transcript_path === 'string' && input.transcript_path.includes('.claude')) || env.CLAUDE_CODE_SESSION_ID || env.CLAUDECODE) return 'claude';
  return undefined;
}

const machineName = () => hostname().replace(/\.local$/, '');

export function sessionLabel(s: Pick<SessionCard, 'host' | 'machine' | 'startedAt'>): string {
  const since = new Date(s.startedAt);
  const hhmm = Number.isNaN(since.getTime()) ? '' : `, since ${String(since.getHours()).padStart(2, '0')}:${String(since.getMinutes()).padStart(2, '0')}`;
  return `${s.host ?? 'session'} on ${s.machine ?? 'unknown machine'}${hhmm}`;
}

/**
 * The host session this process belongs to: a hook passes the id it received on stdin; a command
 * the assistant runs in its shell reads it from the environment the host sets. A terminal with
 * neither is the person, who keeps the per-repo active card.
 */
export function currentSession(fromHook?: string): string | undefined {
  const id = fromHook?.trim() || process.env.CLAUDE_CODE_SESSION_ID?.trim() || process.env.CURSOR_SESSION_ID?.trim();
  return id ? id.replace(/[^A-Za-z0-9._-]/g, '_') : undefined;
}

const sessionFile = (projectDir: string, session: string) => join(projectDir, ACTIVE_SESSIONS_DIR, `${session}.json`);

function readSession(file: string, now = Date.now()): SessionCard | undefined {
  try {
    if (now - statSync(file).mtimeMs > STALE_MS) return undefined;
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as SessionCard;
    // Files written before labels existed get one from what they have.
    return parsed.card ? { ...parsed, label: parsed.label ?? sessionLabel(parsed) } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The card this caller works: `CODELOOP_CARD` (set by `run --agent`, and usable to pin a session),
 * then this session's own card, then the repo's card (the person's, and any session that has not
 * activated one of its own).
 * Another session activating its card never changes the answer here.
 */
export function getActiveCard(projectDir: string, session: string | undefined = currentSession()): string | undefined {
  const fromRun = process.env.CODELOOP_CARD?.trim();
  if (fromRun) return fromRun;
  if (session) {
    const own = readSession(sessionFile(projectDir, session))?.card;
    if (own) return own;
    // A session that has not activated anything yet falls back to the repo's card, so sessions
    // started before per-session cards existed keep working instead of being blocked.
  }
  const file = join(projectDir, ACTIVE_CARD_PATH);
  if (!existsSync(file)) return undefined;
  const id = readFileSync(file, 'utf-8').trim();
  return id || undefined;
}

export function setActiveCard(projectDir: string, id: string, session: string | undefined = currentSession(), host: SessionHost | undefined = detectHost()): void {
  if (session) {
    const file = sessionFile(projectDir, session);
    mkdirSync(dirname(file), { recursive: true });
    const now = new Date().toISOString();
    const before = readSession(file);
    const startedAt = before?.card === id ? before.startedAt : now;
    const who = { host: host ?? before?.host, machine: machineName(), startedAt };
    const record: SessionCard = { session, card: id, startedAt, updatedAt: now, ...(who.host ? { host: who.host } : {}), machine: who.machine, label: sessionLabel(who) };
    writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
    return;
  }
  const file = join(projectDir, ACTIVE_CARD_PATH);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${id}\n`);
}

export function clearActiveCard(projectDir: string, session: string | undefined = currentSession()): void {
  const file = session ? sessionFile(projectDir, session) : join(projectDir, ACTIVE_CARD_PATH);
  if (existsSync(file)) unlinkSync(file);
}

/** Every live session and the card it works, newest first; stale files are skipped, not deleted. */
export function activeSessions(projectDir: string): SessionCard[] {
  const dir = join(projectDir, ACTIVE_SESSIONS_DIR);
  if (!existsSync(dir)) return [];
  const now = Date.now();
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => readSession(join(dir, f), now))
    .filter((s): s is SessionCard => Boolean(s))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
