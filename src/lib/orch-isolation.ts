/**
 * Where an orchestrated builder works (`orch.isolation`). `tree`, the default: in the main tree on the
 * branch it has checked out, next to other builders on other stories, each holding a lease on its
 * plan's files. `worktree`: in its own git worktree on its own branch, merged after the gate. `auto`:
 * tree, but a worktree for an L story. A story whose plan files overlap another live story's lease
 * waits (`orch.on_conflict: wait`, the default) or takes a worktree (`on_conflict: worktree`).
 * `orch.max_builders` (default 2) caps how many builders run at once across both modes.
 */
import { spawnSync } from 'child_process';
import { existsSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { activeSessions, ACTIVE_SESSIONS_DIR, setActiveCard } from './active-card.js';
import { findCard, readCards, type Card } from './cards.js';
import { loadConfig } from './config.js';
import { isSharedPath, pathInPlan, planFiles } from './plan-scope.js';

export type Isolation = 'tree' | 'worktree' | 'auto';
export type Mode = 'tree' | 'worktree';

/** The lease session a builder holds while its turn runs, in both modes: `orch-<card>`. */
export const LEASE_PREFIX = 'orch-';
export const leaseSession = (cardId: string) => `${LEASE_PREFIX}${cardId}`;

function orchConfig(projectDir: string): { isolation?: unknown; on_conflict?: unknown; max_builders?: unknown } {
  const orch = (loadConfig(projectDir) as { orch?: unknown }).orch;
  return orch && typeof orch === 'object' ? (orch as Record<string, unknown>) : {};
}

export function isolation(projectDir: string): Isolation {
  const v = orchConfig(projectDir).isolation;
  return v === 'worktree' || v === 'auto' ? v : 'tree';
}

export const onConflict = (projectDir: string): 'wait' | 'worktree' => (orchConfig(projectDir).on_conflict === 'worktree' ? 'worktree' : 'wait');

export function maxBuilders(projectDir: string): number {
  const v = orchConfig(projectDir).max_builders;
  return typeof v === 'number' && v >= 1 ? Math.floor(v) : 2;
}

/** Cards whose builder holds a lease now (an orchestrated turn is running for them), other than `except`. */
export function runningBuilders(projectDir: string, except?: string): string[] {
  return activeSessions(projectDir).filter(s => s.session.startsWith(LEASE_PREFIX) && s.card !== except).map(s => s.card);
}

/** The first live story, other than this one, whose plan leases a file this story's plan names. */
export function leaseHolder(projectDir: string, card: Card): { card: string; title: string; session: string; file: string } | undefined {
  const mine = planFiles(projectDir, card);
  if (!mine) return undefined;
  const cards = readCards(projectDir).cards;
  for (const other of activeSessions(projectDir)) {
    if (other.card === card.id) continue;
    const theirs = cards.find(c => c.id === other.card);
    const leased = theirs ? planFiles(projectDir, theirs) : undefined;
    if (!theirs || !leased) continue;
    const file = mine.find(f => !isSharedPath(projectDir, f) && (pathInPlan(projectDir, leased, f) || leased.some(l => pathInPlan(projectDir, [f], l))));
    if (file) return { card: theirs.id, title: theirs.title, session: other.session, file };
  }
  return undefined;
}

export type Placement =
  | { mode: Mode; why: string }
  | { wait: 'lease'; holder: NonNullable<ReturnType<typeof leaseHolder>>; why: string }
  | { wait: 'builders'; running: string[]; why: string };

/** Where this turn runs, or why it waits: the builder cap, then a conflicting lease, then the configured isolation. */
export function placeTurn(projectDir: string, cardRef: string): Placement {
  const card = findCard(readCards(projectDir).cards, cardRef);
  const running = runningBuilders(projectDir, card.id);
  const cap = maxBuilders(projectDir);
  if (running.length >= cap) return { wait: 'builders', running, why: `${running.length} builder(s) already running (${running.join(', ')}); orch.max_builders is ${cap}` };
  const chosen = isolation(projectDir);
  if (chosen === 'worktree') return { mode: 'worktree', why: 'orch.isolation is worktree' };
  const holder = leaseHolder(projectDir, card);
  if (holder) {
    const why = `${holder.file} is leased by ${holder.card} (${holder.title}), held by ${holder.session}`;
    return onConflict(projectDir) === 'worktree' ? { mode: 'worktree', why: `${why}; orch.on_conflict is worktree` } : { wait: 'lease', holder, why };
  }
  if (chosen === 'auto' && card.size === 'L') return { mode: 'worktree', why: 'an L story under orch.isolation auto' };
  return { mode: 'tree', why: chosen === 'auto' ? 'no conflicting lease' : 'orch.isolation is tree' };
}

export const takeLease = (projectDir: string, cardId: string) => setActiveCard(projectDir, cardId, leaseSession(cardId), undefined);

export function dropLease(projectDir: string, cardId: string): void {
  const file = join(projectDir, ACTIVE_SESSIONS_DIR, `${leaseSession(cardId)}.json`);
  if (existsSync(file)) unlinkSync(file);
}

export const holdsLease = (projectDir: string, cardId: string) => existsSync(join(projectDir, ACTIVE_SESSIONS_DIR, `${leaseSession(cardId)}.json`));

/** Every lease file, for status: card id by lease session. */
export function leases(projectDir: string): string[] {
  const dir = join(projectDir, ACTIVE_SESSIONS_DIR);
  return existsSync(dir) ? readdirSync(dir).filter(f => f.startsWith(LEASE_PREFIX) && f.endsWith('.json')).map(f => f.slice(LEASE_PREFIX.length, -5)) : [];
}

const TRAILER = (cardId: string) => new RegExp(`^(Card|Feature):\\s*${cardId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'mi');

/**
 * A tree-mode story's own commits as a git range: from the parent of its first trailered commit
 * reachable from `head` to `head`. Other stories' commits interleave on the same branch, so the
 * scope check reads only the trailered ones inside this range.
 */
export function treeRange(projectDir: string, cardId: string, head: string): string {
  const log = spawnSync('git', ['log', '--reverse', '--format=%H%x00%B%x01', head], { cwd: projectDir, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  const first = (log.stdout ?? '').split('\u0001').map(r => r.replace(/^\n/, '').split('\u0000')).find(([sha, body]) => sha && body && TRAILER(cardId).test(body))?.[0];
  if (!first) return head;
  const hasParent = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${first}^`], { cwd: projectDir, encoding: 'utf-8' }).status === 0;
  return hasParent ? `${first}^..${head}` : head;
}
