import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadConfig } from './config.js';
import { globMatches } from './glob.js';
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
}

const strings = (v: unknown, fallback: string[]) => (Array.isArray(v) && v.every(x => typeof x === 'string') && v.length ? (v as string[]) : fallback);

export function healthSettings(projectDir: string): Settings {
  const raw = (loadConfig(projectDir) as HealthConfig).health;
  // YAML reads a bare `health: off` as false.
  if (raw === false || raw === 'off') return { off: true, tests: [], source: [], weights: DEFAULT_WEIGHTS, tolerance: DEFAULT_TOLERANCE };
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

function run(cmd: string, cwd: string): string {
  const p = spawnSync(cmd, { cwd, shell: true, encoding: 'utf-8', timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  return `${p.stdout ?? ''}\n${p.stderr ?? ''}`;
}

/** ESLint's summary line when there is one ("3 problems (2 errors, 1 warning)"), else lines that say "error". */
export function parseLintErrors(output: string): number {
  const summary = /\((\d+) errors?\b/.exec(output);
  if (summary) return Number(summary[1]);
  return output.split('\n').filter(l => /\berror\b/i.test(l)).length;
}

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
    lint: s.lintCmd ? parseLintErrors(run(s.lintCmd, root)) : null,
    types: typesCmd ? parseTypeErrors(run(typesCmd, root)) : null,
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
  const head = git(projectDir, ['rev-parse', ref]);
  const configured = (loadConfig(projectDir).git as { trunk?: string } | undefined)?.trunk;
  const trunk = configured ?? 'main';
  const mb = git(projectDir, ['merge-base', ref, trunk]);
  if (mb && mb !== head) return mb;
  const sep = '\u0001';
  const log = git(projectDir, ['log', '--reverse', ...(ref === 'HEAD' ? [] : [ref]), `--format=${sep}%H%n%b`]);
  for (const chunk of log.split(sep).slice(1)) {
    const [sha, ...body] = chunk.split('\n');
    if (body.some(l => new RegExp(`^(?:Card|Feature):\\s*${cardId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`).test(l))) {
      return git(projectDir, ['rev-parse', `${sha}^`]) || undefined;
    }
  }
  return undefined;
}

/**
 * The files a story changed between `base` and `head`: those of the commits whose `Card:` or
 * `Feature:` trailer names it. On trunk other stories' commits sit in the same range, so the plain
 * diff would claim their files too; it is used only when no commit in the range carries the trailer.
 */
export function storyFiles(projectDir: string, cardId: string, base: string, head: string): string[] {
  const log = git(projectDir, ['log', `${base}..${head}`, '--format=%H%x00%(trailers:key=Card,valueonly,separator=%x2C)%x00%(trailers:key=Feature,valueonly,separator=%x2C)']);
  const own = log.split('\n').filter(Boolean).flatMap(line => {
    const [sha, card = '', feature = ''] = line.split('\0');
    const ids = (card.trim() ? card : feature).split(',').map(x => x.trim());
    return ids.includes(cardId) ? [sha] : [];
  });
  if (!own.length) return git(projectDir, ['diff', '--name-only', base, head]).split('\n').filter(Boolean);
  return [...new Set(own.flatMap(sha => git(projectDir, ['diff-tree', '--no-commit-id', '--name-only', '-r', sha]).split('\n').filter(Boolean)))];
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
  const base = storyBase(projectDir, cardId, ref);
  const head = git(projectDir, ['rev-parse', ref]);
  if (!base || !head) return { state: 'no-base', tolerance: s.tolerance, pass: true };
  const files = storyFiles(projectDir, cardId, base, head);
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
