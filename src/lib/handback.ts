/**
 * A hand-back is what a builder reports when it stops: the branch and head it worked on, the proof
 * command it ran and what that printed, and what it left or could not do. The proof is run here, not
 * taken from the builder's word, so the gate reads an exit code and output this process captured.
 * A failing proof is recorded as it is: refusing it would hide the failure from the gate.
 */
import { spawnSync } from 'child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { appendActivity } from './activity.js';
import { currentSession } from './active-card.js';
import { findCard, readCards, RefusalError } from './cards.js';
import { recordEvent } from './engine.js';

export const HANDBACKS_DIR = '.codeloop/state/handbacks';
const PROOF_TIMEOUT_MS = 10 * 60 * 1000;
const OUTPUT_TAIL = 16 * 1024;

export interface HandbackInput {
  branch: string;
  head: string;
  proof: string;
  left?: string;
  blocked?: string;
  session?: string;
  /** The git worktree the work is in; the proof is run there. Defaults to the project root. */
  worktree?: string;
}

export interface HandbackRecord {
  card: string;
  stage: string;
  branch: string;
  head: string;
  proof: { cmd: string; exit: number; output: string };
  left: string;
  blocked: string;
  at: string;
  session?: string;
  worktree?: string;
}

const safe = (text: string) => text.replace(/[^A-Za-z0-9._-]/g, '_');
const dirOf = (projectDir: string) => join(projectDir, HANDBACKS_DIR);

export function recordHandback(projectDir: string, cardRef: string, input: HandbackInput): HandbackRecord {
  const cmd = (input.proof ?? '').trim();
  if (!cmd) throw new RefusalError('a hand-back needs a proof command');
  const card = findCard(readCards(projectDir).cards, cardRef);

  const ran = spawnSync(cmd, { shell: true, cwd: input.worktree || projectDir, encoding: 'utf8', timeout: PROOF_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
  const output = `${ran.stdout ?? ''}${ran.stderr ?? ''}`.slice(-OUTPUT_TAIL);
  // A killed or unspawnable proof has no status; 1 keeps "not 0" meaning "did not pass".
  const exit = ran.status ?? 1;

  const prefix = `${safe(card.id)}-${safe(card.stage)}-`;
  const taken = existsNumbers(projectDir, prefix);
  const n = (taken.length ? Math.max(...taken) : 0) + 1;
  const record: HandbackRecord = {
    card: card.id,
    stage: card.stage,
    branch: input.branch,
    head: input.head,
    proof: { cmd, exit, output },
    left: input.left ?? '',
    blocked: input.blocked ?? '',
    at: new Date().toISOString(),
    ...(input.worktree ? { worktree: input.worktree } : {}),
    ...((input.session ?? currentSession()) ? { session: input.session ?? currentSession() } : {}),
  };
  mkdirSync(dirOf(projectDir), { recursive: true });
  writeFileSync(join(dirOf(projectDir), `${prefix}${n}.json`), `${JSON.stringify(record, null, 2)}\n`);

  appendActivity(projectDir, card.id, { session: record.session, kind: 'handback', stage: card.stage, branch: record.branch, head: record.head, pass: exit === 0, exit });
  recordEvent(projectDir, card.id, () => ({ action: 'handback', note: `${record.branch}@${record.head.slice(0, 8)} proof exit ${exit}` }));
  return record;
}

function existsNumbers(projectDir: string, prefix: string): number[] {
  try {
    return readdirSync(dirOf(projectDir))
      .filter(f => f.startsWith(prefix) && /^\d+\.json$/.test(f.slice(prefix.length)))
      .map(f => parseInt(f.slice(prefix.length), 10));
  } catch {
    return [];
  }
}

/** Every hand-back for the card, newest first. */
export function listHandbacks(projectDir: string, cardRef: string): HandbackRecord[] {
  const id = findCard(readCards(projectDir).cards, cardRef).id;
  let files: string[];
  try {
    files = readdirSync(dirOf(projectDir));
  } catch {
    return [];
  }
  const records: (HandbackRecord & { n: number })[] = [];
  for (const f of files) {
    if (!f.endsWith('.json') || !f.startsWith(`${safe(id)}-`)) continue;
    try {
      const rec = JSON.parse(readFileSync(join(dirOf(projectDir), f), 'utf8')) as HandbackRecord;
      if (rec.card === id) records.push({ ...rec, n: parseInt(f.replace(/\.json$/, '').split('-').pop() ?? '0', 10) });
    } catch {
      /* a half-written file is skipped, not fatal */
    }
  }
  // The file number is the order they were written; the clock can tie within a millisecond.
  return records.sort((a, b) => b.n - a.n).map(({ n: _n, ...rec }) => rec);
}
