import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadConfig } from './config.js';
import { checkTimeoutMs, wasKilledForTime } from './check-timeout.js';
import { globMatches } from './glob.js';
import { findCardOrNone, readCards } from './cards.js';
import { pathInPlan, planFiles } from './plan-scope.js';
import { listPages } from './wiki.js';

export interface Health {
  tests: { files: number; cases: number };
  /** Errors from `health.lint_cmd`; null when no lint command is configured. */
  lint: number | null;
  /** `error TS` lines from `health.types_cmd`; null when the repo has no type check to run. */
  types: number | null;
  gotchas: number;
  todo: number;
  /** 0 to 100, see `scoreOf`. */
  score: number;
}

export interface Weights { tests: number; lint: number; types: number; gotchas: number; todo: number }

export const DEFAULT_WEIGHTS: Weights = { tests: 1, lint: 1, types: 1, gotchas: 2, todo: 0.2 };
/** Points the score may fall before verify fails: one TODO line moves a large repo by about 0.05. */
export const DEFAULT_TOLERANCE = 1;
export const DEFAULT_TEST_GLOBS = ['**/*.test.ts', '**/*.test.js', '**/*.test.py', '**/__tests__/**'];
export const DEFAULT_SOURCE_GLOBS = ['src/**'];

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.next', '.venv', 'venv', '__pycache__']);
const DEPENDENCY_DIRS = ['node_modules', '.venv', 'venv'];

interface HealthConfig {
  health?: unknown;
}
interface Settings {
  off: boolean;
  tests: string[];
  source: string[];
  lintCmd?: string;
  typesCmd?: string;
  weights: Weights;
  tolerance: number;
  /** `checks.timeout_minutes` in ms: the limit on the lint and type commands. */
  timeoutMs: number;
}

const strings = (v: unknown, fallback: string[]) => (Array.isArray(v) && v.every(x => typeof x === 'string') && v.length ? (v as string[]) : fallback);

export function healthSettings(projectDir: string): Settings {
  const raw = (loadConfig(projectDir) as HealthConfig).health;
  // YAML reads a bare `health: off` as false.
  if (raw === false || raw === 'off') return { off: true, tests: [], source: [], weights: DEFAULT_WEIGHTS, tolerance: DEFAULT_TOLERANCE, timeoutMs: checkTimeoutMs(projectDir) };
  const h = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, any>;
  const w = (typeof h.weights === 'object' && h.weights !== null ? h.weights : {}) as Record<string, unknown>;
  const weights = { ...DEFAULT_WEIGHTS };
  for (const k of Object.keys(weights) as (keyof Weights)[]) if (typeof w[k] === 'number' && (w[k] as number) >= 0) weights[k] = w[k] as number;
  return {
    off: false,
    tests: strings(h.tests, DEFAULT_TEST_GLOBS),
    source: strings(h.source, DEFAULT_SOURCE_GLOBS),
    lintCmd: typeof h.lint_cmd === 'string' && h.lint_cmd ? h.lint_cmd : undefined,
    typesCmd: typeof h.types_cmd === 'string' && h.types_cmd ? h.types_cmd : undefined,
    weights,
    tolerance: typeof h.tolerance === 'number' && h.tolerance >= 0 ? h.tolerance : DEFAULT_TOLERANCE,
    timeoutMs: checkTimeoutMs(projectDir),
  };
}

/**
 * Score = 100 * tests / (1 + penalty / 10), where tests = t / (t + 10) for t = weight.tests * cases
 * and penalty = lint*w.lint + types*w.types + gotchas*w.gotchas + todo*w.todo. More test cases
 * raise it toward 100 with diminishing returns; each problem divides it, so a repo that already has
 * hundreds of cases still sees a new type error. Rounded to two decimals.
 */
export function scoreOf(h: Omit<Health, 'score'>, w: Weights = DEFAULT_WEIGHTS): number {
  const t = w.tests * h.tests.cases;
  const tests = t <= 0 ? 0 : t / (t + 10);
  const penalty = (h.lint ?? 0) * w.lint + (h.types ?? 0) * w.types + h.gotchas * w.gotchas + h.todo * w.todo;
  return Math.round((100 * tests) / (1 + penalty / 10) * 100) / 100;
}

function walk(root: string, dir = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    if (SKIP_DIRS.has(name)) continue;
    const rel = dir ? `${dir}/${name}` : name;
    const st = statSync(join(root, rel));
    if (st.isDirectory()) out.push(...walk(root, rel));
    else if (st.isFile()) out.push(rel);
  }
  return out;
}

const CASE = /^\s*(?:(?:it|test)(?:\.\w+)*\s*\(|(?:async\s+)?def\s+test_|(?:it|test)\.each\b)/;

function countTests(root: string, files: string[]): { files: number; cases: number } {
  let cases = 0;
  for (const f of files) for (const line of readFileSync(join(root, f), 'utf-8').split('\n')) if (CASE.test(line)) cases++;
  return { files: files.length, cases };
}

function countTodo(root: string, files: string[]): number {
  let n = 0;
  for (const f of files) {
    let text: string;
    try { text = readFileSync(join(root, f), 'utf-8'); } catch { continue; }
    for (const line of text.split('\n')) if (/\b(?:TODO|FIXME)\b/.test(line)) n++;
  }
  return n;
}

/** null when the command was killed at the time limit: a half-run lint or type check says nothing about the count. */
function run(cmd: string, cwd: string, timeoutMs: number): string | null {
  const p = spawnSync(cmd, { cwd, shell: true, encoding: 'utf-8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  if (wasKilledForTime(p)) return null;
  return `${p.stdout ?? ''}\n${p.stderr ?? ''}`;
}

/** ESLint's summary line when there is one ("3 problems (2 errors, 1 warning)"), else lines that say "error". */
export function parseLintErrors(output: string): number {
  const summary = /\((\d+) errors?\b/.exec(output);
  if (summary) return Number(summary[1]);
  return output.split('\n').filter(l => /\berror\b/i.test(l)).length;
}

const countOf = (output: string | null, parse: (o: string) => number): number | null => (output === null ? null : parse(output));

export const parseTypeErrors = (output: string): number => output.split('\n').filter(l => /error TS\d+/.test(l)).length;

/** A gotcha with no scope (what `wiki capture` writes by default) applies to every file. */
const inScope = (scope: string[], files?: string[]) => !files || !scope.length || scope.some(g => files.some(f => globMatches(g, f)));

/**
 * `files`: count only the critical gotchas whose scope matches one of these paths. A story's before
 * and after are both measured on its own files, so a gotcha another story adds elsewhere in the
 * repo between the two refs does not move this story's delta.
 */
function measure(root: string, s: Settings, wikiRoot: string, files?: string[]): Health {
  const all = walk(root);
  const testFiles = all.filter(f => s.tests.some(g => globMatches(g, f)));
  const tests = new Set(testFiles);
  const source = all.filter(f => !tests.has(f) && s.source.some(g => globMatches(g, f)));
  const typesCmd = s.typesCmd ?? (existsSync(join(root, 'tsconfig.json')) ? 'npx tsc --noEmit' : undefined);
  const part = {
    tests: countTests(root, testFiles),
    lint: s.lintCmd ? countOf(run(s.lintCmd, root, s.timeoutMs), parseLintErrors) : null,
    types: typesCmd ? countOf(run(typesCmd, root, s.timeoutMs), parseTypeErrors) : null,
    gotchas: listPages(wikiRoot).filter(p => p.kind === 'gotcha' && p.severity === 'critical' && inScope(p.scope, files)).length,
    todo: countTodo(root, source),
  };
  return { ...part, score: scoreOf(part, s.weights) };
}

/** A throwaway copy of `ref` so a before and an after are measured the same way. Dependency folders are linked from the project. */
export function exportRef(projectDir: string, ref: string): { dir: string; dispose: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'codeloop-health-'));
  const dir = join(root, 'tree');
  const dispose = () => rmSync(root, { recursive: true, force: true });
  const archive = spawnSync('sh', ['-c', 'mkdir -p "$2" && git -C "$1" archive "$3" | tar -x -C "$2"', 'sh', projectDir, dir, ref], { encoding: 'utf-8' });
  if (archive.status !== 0) {
    dispose();
    throw new Error(`could not export ${ref}: ${(archive.stderr ?? '').trim()}`);
  }
  for (const d of DEPENDENCY_DIRS) if (existsSync(join(projectDir, d)) && !existsSync(join(dir, d))) symlinkSync(join(projectDir, d), join(dir, d));
  return { dir, dispose };
}

/** Health of the working tree, or of `ref` exported to a temp dir. Settings always come from `projectDir`. `files` scopes the gotcha count, see `measure`. */
export function projectHealth(projectDir: string, opts: { ref?: string; files?: string[] } = {}): Health {
  const s = healthSettings(projectDir);
  if (!opts.ref) return measure(projectDir, s, projectDir, opts.files);
  const ex = exportRef(projectDir, opts.ref);
  try {
    return measure(ex.dir, s, ex.dir, opts.files);
  } finally {
    ex.dispose();
  }
}

function git(cwd: string, args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024 });
  return r.status === 0 ? r.stdout.trim() : '';
}

/**
 * Where a story started: the merge-base of HEAD with the trunk when the story sits on its own branch,
 * else the commit before its first `Card:`/`Feature:` commit. Undefined when neither can be found.
 */
export function storyBase(projectDir: string, cardId: string, ref: string = 'HEAD'): string | undefined {
  return storyBaseOf(projectDir, cardId, ref)?.sha;
}

/** `storyBase` with how it was found: `onTrunk` is false for a merge-base, where every commit since it is the story's. */
export function storyBaseOf(projectDir: string, cardId: string, ref: string = 'HEAD'): { sha: string; onTrunk: boolean } | undefined {
  const head = git(projectDir, ['rev-parse', ref]);
  const configured = (loadConfig(projectDir).git as { trunk?: string } | undefined)?.trunk;
  const trunk = configured ?? 'main';
  const mb = git(projectDir, ['merge-base', ref, trunk]);
  if (mb && mb !== head) return { sha: mb, onTrunk: false };
  const sep = '\u0001';
  const log = git(projectDir, ['log', '--reverse', ...(ref === 'HEAD' ? [] : [ref]), `--format=${sep}%H%n%b`]);
  for (const chunk of log.split(sep).slice(1)) {
    const [sha, ...body] = chunk.split('\n');
    if (body.some(l => new RegExp(`^(?:Card|Feature):\\s*${cardId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`).test(l))) {
      const parent = git(projectDir, ['rev-parse', `${sha}^`]);
      return parent ? { sha: parent, onTrunk: true } : undefined;
    }
  }
  return undefined;
}

/**
 * The files a story changed between `base` and `head`. On its own branch (`onTrunk: false`) every
 * commit in the range is the story's, so it is the plain diff. On a shared trunk other stories'
 * commits sit in the same range, so it is the files of the commits whose `Card:` or `Feature:`
 * trailer names the story, plus those of untrailered commits that touch one of those files or a
 * file in `plan`; a commit trailered for another story never counts. The plain diff is used when
 * no commit in the range carries the story's trailer.
 */
export function storyFiles(projectDir: string, cardId: string, base: string, head: string, opts: { onTrunk?: boolean; plan?: string[] } = {}): string[] {
  const diff = () => git(projectDir, ['diff', '--name-only', base, head]).split('\n').filter(Boolean);
  if (opts.onTrunk === false) return diff();
  const log = git(projectDir, ['log', '--name-only', `${base}..${head}`, '--format=%x01%H%x00%(trailers:key=Card,valueonly,separator=%x2C)%x00%(trailers:key=Feature,valueonly,separator=%x2C)%x00']);
  const commits = log.split('\u0001').slice(1).map(rec => {
    const [, card = '', feature = '', names = ''] = rec.split('\0');
    const ids = (card.trim() ? card : feature).split(',').map(x => x.trim()).filter(Boolean);
    return { ids, files: names.split('\n').map(f => f.trim()).filter(Boolean) };
  });
  const own = commits.filter(c => c.ids.includes(cardId));
  if (!own.length) return diff();
  const files = new Set(own.flatMap(c => c.files));
  const touches = (f: string) => files.has(f) || (opts.plan ? pathInPlan(projectDir, opts.plan, f) : false);
  const related = commits.filter(c => !c.ids.length && c.files.some(touches));
  for (const c of related) for (const f of c.files) files.add(f);
  return [...files];
}

// A board that cannot be read leaves only the plan files out of the scope; it does not stop the measurement.
function storyCard(projectDir: string, cardId: string) {
  try {
    return findCardOrNone(readCards(projectDir).cards, cardId);
  } catch {
    return undefined;
  }
}

export interface HealthVerdict {
  /** `off` when `health: off`; `no-base` when the story has no base to compare against. */
  state: 'off' | 'no-base' | 'measured';
  before?: Health;
  after?: Health;
  delta?: number;
  tolerance: number;
  pass: boolean;
  base?: string;
}

export function checkHealth(projectDir: string, cardId: string, opts: { ref?: string } = {}): HealthVerdict {
  const s = healthSettings(projectDir);
  if (s.off) return { state: 'off', tolerance: 0, pass: true };
  const ref = opts.ref ?? 'HEAD';
  const found = storyBaseOf(projectDir, cardId, ref);
  const head = git(projectDir, ['rev-parse', ref]);
  if (!found || !head) return { state: 'no-base', tolerance: s.tolerance, pass: true };
  const base = found.sha;
  const card = found.onTrunk ? storyCard(projectDir, cardId) : undefined;
  const files = storyFiles(projectDir, cardId, base, head, { onTrunk: found.onTrunk, plan: card ? planFiles(projectDir, card) : undefined });
  const before = projectHealth(projectDir, { ref: base, files });
  const after = projectHealth(projectDir, { ref: head, files });
  const delta = Math.round((after.score - before.score) * 100) / 100;
  return { state: 'measured', before, after, delta, tolerance: s.tolerance, pass: delta >= -s.tolerance, base };
}

export function healthLine(v: HealthVerdict): string {
  if (v.state === 'off') return 'health: off';
  if (v.state === 'no-base') return 'health: no base commit for the story, not measured';
  const sign = v.delta! > 0 ? '+' : '';
  return `health: before ${v.before!.score}, after ${v.after!.score}, delta ${sign}${v.delta}, ${v.pass ? 'pass' : 'fail'}`;
}

export function formatHealth(h: Health): string[] {
  const n = (v: number | null) => (v === null ? 'skipped' : String(v));
  return [
    `tests    ${h.tests.files} files, ${h.tests.cases} cases`,
    `lint     ${n(h.lint)}`,
    `types    ${n(h.types)}`,
    `gotchas  ${h.gotchas} critical`,
    `todo     ${h.todo}`,
    `score    ${h.score}`,
  ];
}
