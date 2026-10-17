/**
 * The gate runs the proof before a story merges. It does not trust the hand-back's own report: it
 * reruns the proof command where the builder worked, runs the card's stage check without advancing,
 * and confirms one concrete claim from the hand-back against git. The verdict and findings are
 * written as a record the board and the orchestrator read.
 */
import { spawnSync } from 'child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { isAbsolute, join, normalize } from 'path';
import { appendActivity } from './activity.js';
import { currentSession } from './active-card.js';
import { findCard, readCards, RefusalError } from './cards.js';
import { currentStage, recordEvent, runCheck } from './engine.js';
import { listHandbacks, type HandbackRecord } from './handback.js';
import { loadLane } from './lane.js';
import { scrubOutput } from './scrub.js';

export const GATES_DIR = '.codeloop/state/gates';
const PROOF_TIMEOUT_MS = 10 * 60 * 1000;
const OUTPUT_TAIL = 16 * 1024;

export interface GateInput {
  handbackId?: string;
  /** A tree-mode story's commit range (`<base>..<head>`): the scope check reads only the story's trailered commits in it. */
  storyRef?: string;
}

export interface GateRecord {
  card: string;
  stage: string;
  handback: { branch: string; head: string; at: string };
  proof: { cmd: string; exit: number; output: string };
  check: { pass: boolean | null; output: string };
  claim: { path: string; found: boolean } | null;
  verdict: 'pass' | 'fail';
  findings: string[];
  /** The output tail when the stage check command itself crashed; the work was not judged. */
  checkCrashed?: string;
  at: string;
}

const safe = (text: string) => text.replace(/[^A-Za-z0-9._-]/g, '_');
const dirOf = (projectDir: string) => join(projectDir, GATES_DIR);

// A path-like token: optional folders, a name, and a letter-bearing extension. Versions (0.5.0)
// and sentence ends (e.g.) have no letter-led extension of 1-5 chars after a folder or name.
const PATH_TOKEN = /(?:[\w.-]+\/)*[\w-][\w.-]*\.[A-Za-z][A-Za-z0-9]{0,4}\b/g;

/** The first file path in the text that points inside the repo, relative to it. */
export function firstRepoPath(text: string): string | undefined {
  for (const m of text.matchAll(PATH_TOKEN)) {
    const token = m[0].replace(/^\.\//, '');
    if (isAbsolute(token) || /^[A-Za-z]+:\/\//.test(token)) continue;
    const norm = normalize(token);
    if (norm.startsWith('..')) continue;
    return norm;
  }
  return undefined;
}

/**
 * The file a hand-back claims: the first path-like token that contains a folder separator, or a
 * bare file name that exists under the card's spec folder. A bare name that matches nothing is no
 * claim, so "research.md" in a note never reads as a file at the repo root.
 */
export function claimedPath(text: string, spec: string | undefined, exists: (path: string) => boolean): string | undefined {
  for (const m of text.matchAll(PATH_TOKEN)) {
    const token = m[0].replace(/^\.\//, '');
    if (isAbsolute(token) || /^[A-Za-z]+:\/\//.test(token)) continue;
    const norm = normalize(token);
    if (norm.startsWith('..')) continue;
    if (norm.includes('/')) return norm;
    const inSpec = spec ? `${spec.replace(/\/$/, '')}/${norm}` : undefined;
    if (inSpec && exists(inSpec)) return inSpec;
  }
  return undefined;
}

export function runGate(projectDir: string, cardRef: string, input: GateInput = {}): GateRecord {
  const card = findCard(readCards(projectDir).cards, cardRef);
  const all = listHandbacks(projectDir, card.id);
  const hb: HandbackRecord | undefined = input.handbackId
    ? all.find(h => `${h.branch}@${h.head}` === input.handbackId || h.head === input.handbackId || h.head.startsWith(input.handbackId!))
    : all[0];
  if (!hb) throw new RefusalError(input.handbackId ? `no hand-back "${input.handbackId}" to gate` : 'no hand-back to gate');

  const findings: string[] = [];
  const workDir = hb.worktree || projectDir;

  const ref = input.storyRef ?? hb.head;
  const env = hb.worktree ? { ...process.env, CODELOOP_PROJECT_DIR: projectDir, CODELOOP_WORK_DIR: hb.worktree, CODELOOP_STORY_REF: ref } : input.storyRef ? { ...process.env, CODELOOP_STORY_REF: ref } : process.env;
  const ran = spawnSync(hb.proof.cmd, { shell: true, cwd: workDir, env, encoding: 'utf8', timeout: PROOF_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
  const proof = { cmd: hb.proof.cmd, exit: ran.status ?? 1, output: `${ran.stdout ?? ''}${ran.stderr ?? ''}`.slice(-OUTPUT_TAIL) };
  const why = (out: string) => {
    const tail = out.trim().split('\n').slice(-4).join(' | ').slice(-500);
    return tail ? `: ${tail}` : '';
  };
  if (proof.exit !== 0) findings.push(`proof "${hb.proof.cmd}" exited ${proof.exit}${why(proof.output)}`);

  const stage = currentStage(loadLane(projectDir, card.lane), card);
  // A selfcheck that passed at this exact head already ran the stage check, scope, rubric and budget
  // there; only the proof is rerun. A failed or missing selfcheck changes nothing.
  const skipCheck = hb.selfcheck?.pass === true;
  const checked = skipCheck ? { passed: true, output: `skipped: selfcheck passed at ${hb.head.slice(0, 8)}` } : runCheck(projectDir, card, stage, hb.worktree || undefined, hb.worktree ? hb.head : input.storyRef);
  if (checked && !checked.passed) findings.push(`stage ${stage.id} check ${checked.crashed !== undefined ? 'crashed' : 'failed'}${why(checked.output)}`);

  let claim: GateRecord['claim'] = null;
  const onHead = (p: string) => spawnSync('git', ['cat-file', '-e', `${hb.head}:${p}`], { cwd: workDir, encoding: 'utf8' }).status === 0;
  const path = claimedPath(`${hb.left}\n${proof.output}`, card.spec, onHead);
  if (path) {
    const found = onHead(path);
    claim = { path, found };
    if (!found) findings.push(`claimed file ${path} is not on ${hb.branch}@${hb.head.slice(0, 8)}`);
  }

  const verdict: GateRecord['verdict'] = findings.length ? 'fail' : 'pass';
  // Scrubbed only here: the claim check above reads paths from the raw output.
  for (let i = 0; i < findings.length; i++) findings[i] = scrubOutput(findings[i]);
  const record: GateRecord = {
    card: card.id,
    stage: card.stage,
    handback: { branch: hb.branch, head: hb.head, at: hb.at },
    proof: { ...proof, output: scrubOutput(proof.output) },
    check: { pass: checked ? checked.passed : null, output: scrubOutput(checked?.output ?? '') },
    claim,
    verdict,
    findings,
    ...(checked?.crashed !== undefined ? { checkCrashed: checked.crashed } : {}),
    at: new Date().toISOString(),
  };

  const prefix = `${safe(card.id)}-${safe(card.stage)}-`;
  const n = Math.max(0, ...numbers(projectDir, prefix)) + 1;
  mkdirSync(dirOf(projectDir), { recursive: true });
  writeFileSync(join(dirOf(projectDir), `${prefix}${n}.json`), `${JSON.stringify(record, null, 2)}\n`);

  appendActivity(projectDir, card.id, { session: currentSession(), kind: 'gate', stage: card.stage, verdict, findings });
  recordEvent(projectDir, card.id, () => ({ action: 'gate', note: findings.length ? `${verdict}: ${findings.join('; ')}` : verdict }));
  return record;
}

function numbers(projectDir: string, prefix: string): number[] {
  try {
    return readdirSync(dirOf(projectDir))
      .filter(f => f.startsWith(prefix) && /^\d+\.json$/.test(f.slice(prefix.length)))
      .map(f => parseInt(f.slice(prefix.length), 10));
  } catch {
    return [];
  }
}

/** Every gate record for the card, newest first. */
export function listGates(projectDir: string, cardRef: string): GateRecord[] {
  const id = findCard(readCards(projectDir).cards, cardRef).id;
  let files: string[];
  try {
    files = readdirSync(dirOf(projectDir));
  } catch {
    return [];
  }
  const out: (GateRecord & { n: number })[] = [];
  for (const f of files) {
    if (!f.endsWith('.json') || !f.startsWith(`${safe(id)}-`)) continue;
    try {
      const rec = JSON.parse(readFileSync(join(dirOf(projectDir), f), 'utf8')) as GateRecord;
      if (rec.card === id) out.push({ ...rec, n: parseInt(f.replace(/\.json$/, '').split('-').pop() ?? '0', 10) });
    } catch {
      /* a half-written file is skipped, not fatal */
    }
  }
  return out.sort((a, b) => b.n - a.n).map(({ n: _n, ...rec }) => rec);
}
