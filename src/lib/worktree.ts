/**
 * Each story builds in its own git worktree on its own branch, and merges back only after its gate
 * passed. Merging never rebases and never touches a file the main tree has uncommitted edits to, so
 * a person working in the main tree is not overwritten by a story landing.
 */
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { basename, dirname, join } from 'path';
import { appendActivity } from './activity.js';
import { currentSession } from './active-card.js';
import { cardKey, findCard, readCards, RefusalError, writeCards, type Card } from './cards.js';
import { loadConfig } from './config.js';
import { recordEvent } from './engine.js';
import { listGates } from './gate.js';
import { hasGitGuardHooks, installHostHooks, type HookInstall } from './host-hooks.js';
import { slugify } from './spec.js';

export interface WorktreeOptions {
  /** The branch stories are cut from and merged into; default `git.trunk` in config, else the branch checked out in the project. */
  trunk?: string;
  /** The branch name's scope; default the card's feature, else its lane. */
  scope?: string;
}

export interface StoryWorktree {
  card: string;
  path: string;
  branch: string;
  trunk: string;
  created: boolean;
  /** What was rendered into a new worktree: host hook files and git hooks. */
  hooks?: HookInstall[];
}

export interface MergeResult {
  card: string;
  branch: string;
  trunk: string;
  sha: string;
  mode: 'ff' | 'merge';
  /** Story files that conflicted with the trunk and were taken from the branch. */
  resolved?: string[];
}

/** A conflict outside the story's own folders: the builder has to merge the trunk into its branch. */
export class MergeConflictError extends RefusalError {
  constructor(readonly path: string) {
    super(`merge conflict in ${path}: merge the trunk into the branch and hand back again`);
  }
}

/** The folders and files a story owns: its spec folder, evidence and shape files. */
function storyPaths(card: Card): string[] {
  const key = cardKey(card);
  return [...(card.spec ? [`${card.spec.replace(/\/$/, '')}/`] : []), `specs/${key}-`, `specs/${key}/`, `evidence/${key}/`, `shape/${card.id}/`];
}

const git = (cwd: string, args: string[]) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
};

function must(cwd: string, args: string[], what: string): string {
  const r = git(cwd, args);
  if (!r.ok) throw new RefusalError(`${what}: ${r.err || r.out || `git ${args[0]} failed`}`);
  return r.out;
}

function trunkOf(projectDir: string, given?: string): string {
  if (given) return given;
  const configured = (loadConfig(projectDir).git as { trunk?: string } | undefined)?.trunk;
  if (configured) return configured;
  return must(projectDir, ['rev-parse', '--abbrev-ref', 'HEAD'], 'cannot tell the trunk');
}

function setFields(projectDir: string, id: string, fields: Pick<Card, 'worktree' | 'branch'>): void {
  const file = readCards(projectDir);
  const card = findCard(file.cards, id);
  const next = { ...card, ...fields, updatedAt: new Date().toISOString() };
  for (const k of Object.keys(next) as (keyof Card)[]) if (next[k] === undefined) delete next[k];
  writeCards(projectDir, file, file.cards.map(c => (c.id === card.id ? next : c)));
}

export function ensureStoryWorktree(projectDir: string, cardRef: string, opts: WorktreeOptions = {}): StoryWorktree {
  const card = findCard(readCards(projectDir).cards, cardRef);
  const trunk = trunkOf(projectDir, opts.trunk);
  const scope = slugify(opts.scope ?? card.feature ?? card.lane) || 'story';
  const branch = card.branch ?? `feat/${`${scope}-${slugify(card.title) || card.id.toLowerCase()}`.slice(0, 40).replace(/-+$/, "")}`;
  const path = card.worktree ?? join(dirname(projectDir), `${basename(projectDir)}-wt-${card.id.toLowerCase()}`);

  if (existsSync(path)) {
    const onBranch = git(path, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (!onBranch.ok || onBranch.out !== branch) throw new RefusalError(`${path} exists but is not the worktree on ${branch}`);
    if (card.worktree !== path || card.branch !== branch) setFields(projectDir, card.id, { worktree: path, branch });
    return { card: card.id, path, branch, trunk, created: false };
  }

  const branchExists = git(projectDir, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).ok;
  must(projectDir, branchExists ? ['worktree', 'add', path, branch] : ['worktree', 'add', '-b', branch, path, trunk], 'cannot create the worktree');
  setFields(projectDir, card.id, { worktree: path, branch });
  appendActivity(projectDir, card.id, { session: currentSession(), kind: 'worktree', path, branch, trunk });
  // A worktree is a fresh checkout: the host hooks the project rendered into its main tree (which
  // are not always tracked) are missing there, and a builder inside it would run unguarded and
  // write no activity.
  // Git hooks live in the repository's shared hooks folder, so writing them from a worktree writes
  // them for the main tree too; only a project that already runs the guard gets it here.
  const hooks = installHostHooks(path, { hostsOf: projectDir, gitHooks: hasGitGuardHooks(projectDir) });
  appendActivity(projectDir, card.id, { session: currentSession(), kind: 'hooks', path, text: hooks.map(h => `${h.name}${h.reason ? ` (${h.reason})` : ''}`).join(', ') });
  return { card: card.id, path, branch, trunk, created: true, hooks };
}

export function mergeStory(projectDir: string, cardRef: string, opts: Pick<WorktreeOptions, 'trunk'> = {}): MergeResult {
  const card = findCard(readCards(projectDir).cards, cardRef);
  if (!card.branch) throw new RefusalError(`${card.id} has no story branch; run card worktree first`);
  const branch = card.branch;
  const gate = listGates(projectDir, card.id)[0];
  if (!gate) throw new RefusalError(`${card.id} has no gate record; run card gate first`);
  if (gate.verdict !== 'pass') throw new RefusalError(`the latest gate for ${card.id} is ${gate.verdict}; it must pass before merging`);

  const trunk = trunkOf(projectDir, opts.trunk);
  const current = must(projectDir, ['rev-parse', '--abbrev-ref', 'HEAD'], 'cannot read the checked-out branch');
  if (current !== trunk) throw new RefusalError(`the project has ${current} checked out, not ${trunk}`);

  const changed = must(projectDir, ['diff', '--name-only', `${trunk}...${branch}`], 'cannot diff the branch').split('\n').filter(Boolean);
  // Raw output: trimming would eat the leading space of " M path" and shift every path by one.
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: projectDir, encoding: 'utf8' });
  if (status.status !== 0) throw new RefusalError(`cannot read the working tree: ${status.stderr}`);
  const dirty = status.stdout
    .split('\n')
    .filter(Boolean)
    .map(l => l.slice(3).split(' -> ').pop()!.replace(/^"|"$/g, ''));
  const overlap = changed.filter(f => dirty.includes(f));
  if (overlap.length) throw new RefusalError(`uncommitted edits in the project overlap the branch: ${overlap.join(', ')}`);

  const ff = git(projectDir, ['merge', '--ff-only', branch]);
  let mode: MergeResult['mode'] = 'ff';
  const resolved: string[] = [];
  if (!ff.ok) {
    const who = ['-c', 'user.name=codeloop', '-c', 'user.email=codeloop@localhost'];
    // The main tree is never left mid-merge: every failure below aborts before it throws.
    const abort = () => {
      git(projectDir, ['merge', '--abort']);
    };
    const merged = git(projectDir, [...who, 'merge', '--no-commit', '--no-ff', branch]);
    if (!merged.ok) {
      const conflicted = git(projectDir, ['diff', '--name-only', '--diff-filter=U']).out.split('\n').filter(Boolean);
      if (!conflicted.length) {
        abort();
        throw new RefusalError(`merge of ${branch} into ${trunk} failed: ${merged.err || merged.out}`);
      }
      // The builder's story files are authoritative: the trunk may only hold a scaffolded stub of them.
      const own = storyPaths(card);
      const outside = conflicted.find(p => !own.some(o => p === o || p.startsWith(o)));
      if (outside) {
        abort();
        throw new MergeConflictError(outside);
      }
      for (const p of conflicted) {
        const taken = git(projectDir, ['checkout', '--theirs', '--', p]);
        const added = taken.ok && git(projectDir, ['add', '--', p]).ok;
        if (!added) {
          abort();
          throw new RefusalError(`cannot take the branch's ${p}: ${taken.err || taken.out}`);
        }
        resolved.push(p);
      }
    }
    const committed = git(projectDir, [...who, 'commit', '--no-edit', '-m', `Merge branch '${branch}' into ${trunk}`]);
    if (!committed.ok) {
      abort();
      throw new RefusalError(`merge of ${branch} into ${trunk} failed: ${committed.err || committed.out}`);
    }
    mode = 'merge';
  }
  const sha = must(projectDir, ['rev-parse', 'HEAD'], 'cannot read the merge commit');
  appendActivity(projectDir, card.id, { session: currentSession(), kind: 'merge', branch, trunk, sha, mode, ...(resolved.length ? { resolved } : {}) });
  recordEvent(projectDir, card.id, () => ({ action: 'merge', note: `${branch} into ${trunk} at ${sha.slice(0, 8)} (${mode})${resolved.length ? `; took the branch's ${resolved.join(', ')}` : ''}` }));
  return { card: card.id, branch, trunk, sha, mode, ...(resolved.length ? { resolved } : {}) };
}

/** Removes the story's worktree directory once it has merged. The branch stays. */
export function removeStoryWorktree(projectDir: string, cardRef: string): void {
  const card = findCard(readCards(projectDir).cards, cardRef);
  if (!card.worktree) return;
  if (existsSync(card.worktree)) must(projectDir, ['worktree', 'remove', card.worktree], 'cannot remove the worktree');
  setFields(projectDir, card.id, { worktree: undefined, branch: card.branch });
}
