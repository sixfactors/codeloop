/**
 * Work that landed on a story after its check last failed: a stuck story whose builder kept
 * going is moving, not dead. Four sources count, whichever is newest: the story's own files
 * (tasks.md, evidence), activity lines a builder writes, and commits carrying its trailer on any
 * branch. The doctor's, the check's and the hooks' own lines are left out so the tool's reactions
 * never count as the story's progress.
 */
import { evidenceOf } from './paths.js';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { readActivity } from './activity.js';
import { cardKey, type Card } from './cards.js';
import { storyCommitTimes } from './diff-budget.js';
import { readTasks, type Task } from './spec.js';

const PROGRESS_KINDS = new Set(['edit', 'cmd', 'commit', 'handback']);

export interface EvidenceFile {
  path: string;
  mtime: string;
}

/** The roots a story's files can sit in: the main tree and its own worktree. */
function roots(projectDir: string, card: Card): string[] {
  return [projectDir, ...(card.worktree && existsSync(card.worktree) ? [card.worktree] : [])];
}

/** The current tasks.md list: id, done, layer and text, from whichever tree holds the newer file. */
export function storyTasks(projectDir: string, card: Card): Pick<Task, 'id' | 'done' | 'layer' | 'text'>[] {
  if (!card.spec) return [];
  let best: { root: string; mtime: number } | undefined;
  for (const root of roots(projectDir, card)) {
    try {
      const mtime = statSync(join(root, card.spec, 'tasks.md')).mtimeMs;
      if (!best || mtime > best.mtime) best = { root, mtime };
    } catch { /* no tasks.md in this tree */ }
  }
  if (!best) return [];
  return readTasks(best.root, card.spec).tasks.map(t => ({ id: t.id, done: t.done, layer: t.layer, text: t.text }));
}

/** Files under evidence/<nnn>/ with their modification times, newest first. */
export function evidenceFiles(projectDir: string, card: Card): EvidenceFile[] {
  const out = new Map<string, number>();
  for (const root of roots(projectDir, card)) {
    const rel = evidenceOf(projectDir, cardKey(card));
    const walk = (dir: string) => {
      let names: string[];
      try { names = readdirSync(join(root, dir)); } catch { return; }
      for (const name of names) {
        const path = join(dir, name);
        const st = statSync(join(root, path));
        if (st.isDirectory()) walk(path);
        else out.set(path, Math.max(out.get(path) ?? 0, st.mtimeMs));
      }
    };
    walk(rel);
  }
  return [...out].map(([path, ms]) => ({ path, mtime: new Date(ms).toISOString() })).sort((a, b) => b.mtime.localeCompare(a.mtime));
}

/** When the story's check last failed or parked it stuck; the line progress must be newer than. */
function sinceAt(card: Card): number | undefined {
  const e = [...(card.events ?? [])].reverse().find(x => x.action === 'fail' || x.action === 'stuck');
  return e ? Date.parse(e.at) : undefined;
}

/** The newest time work landed on the story after its last failed check; undefined when none did. */
export function progressSince(projectDir: string, card: Card): number | undefined {
  const since = sinceAt(card);
  if (since === undefined || Number.isNaN(since)) return undefined;
  let newest = 0;
  const bump = (ms: number | undefined) => {
    if (ms !== undefined && !Number.isNaN(ms) && ms > since && ms > newest) newest = ms;
  };
  for (const root of roots(projectDir, card)) {
    if (card.spec) {
      try { bump(statSync(join(root, card.spec, 'tasks.md')).mtimeMs); } catch { /* none */ }
    }
  }
  for (const f of evidenceFiles(projectDir, card)) bump(Date.parse(f.mtime));
  for (let page = readActivity(projectDir, card.id, { limit: 1000 }); ; page = readActivity(projectDir, card.id, { after: page.next, limit: 1000 })) {
    for (const l of page.items) if (PROGRESS_KINDS.has(String(l.kind))) bump(Date.parse(l.at));
    if (!page.next) break;
  }
  for (const at of storyCommitTimes(projectDir, card.id)) bump(at);
  return newest || undefined;
}
