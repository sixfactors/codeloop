import { evidenceOf, usecasesOf } from './paths.js';
import { specPath } from './project-root.js';
import { spawnSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { budgetLine, checkBudget, type BudgetVerdict } from './diff-budget.js';
import { checkHealth, healthLine, type HealthVerdict } from './health.js';
import { cardKey, findCardOrNone, readCards, safeName } from './cards.js';
import { loadConfig } from './config.js';
import { annotateCard, RefusalError, resizeTrivial } from './engine.js';
import { cardNumber } from './lane.js';
import { checkLiveWalk, liveWalkRequired } from './live-walk.js';
import { checkEnv } from './shell.js';
import { readAcceptance, resolveSpecDir } from './spec.js';

interface UseCase {
  id: string;
  accept: string;
  failure_mode?: string;
  layers: {
    cli?: { run: string; expect?: { exit?: number; stdout?: string } };
    api?: { request: { method?: string; path: string; body?: unknown }; base_url?: string; expect: { status: number } };
    ui?: unknown;
  };
}

export interface LayerResult {
  layer: string;
  pass: boolean;
  output: string;
}

export const VERIFY_START = '<!-- codeloop verify: start -->';
export const VERIFY_END = '<!-- codeloop verify: end -->';

export interface VerifyResult {
  exitCode: number;
  sha: string;
  missing: string[];
  /** Where this card's use cases live, so a refusal can name the file to add. */
  usecaseDir?: string;
  cases: { id: string; accept: string; pass: boolean; layers: LayerResult[] }[];
  vacuous: string[];
  mutate?: string;
  budget?: BudgetVerdict;
  health?: HealthVerdict;
  /** Why nothing was run. */
  problem?: string;
}

const tail = (text: string) => text.trimEnd().split('\n').slice(-20).join('\n').slice(-2000);

function git(cwd: string, args: string[]): string {
  const run = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  return run.status === 0 ? run.stdout.trim() : '';
}

function loadUseCases(projectDir: string, nnn: string): UseCase[] {
  const dir = specPath(projectDir, usecasesOf(projectDir, nnn));
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.yaml')).sort().map(f => {
    const uc = parseYaml(readFileSync(join(dir, f), 'utf-8')) as UseCase;
    // The id names the evidence file.
    safeName(uc?.id, `use case id in ${usecasesOf(projectDir, nnn)}/${f}`);
    return uc;
  });
}

function runCli(uc: UseCase, cwd: string, env: string | undefined, base: NodeJS.ProcessEnv = checkEnv()): LayerResult {
  const { run, expect } = uc.layers.cli!;
  const proc = spawnSync(run, { cwd, shell: true, encoding: 'utf-8', timeout: 600_000, env: { ...base, ...(env ? { CODELOOP_ENV: env } : {}) } });
  const pass = proc.status === (expect?.exit ?? 0) && (!expect?.stdout || (proc.stdout ?? '').includes(expect.stdout));
  return { layer: 'cli', pass, output: tail(`${proc.stdout ?? ''}${proc.stderr ?? ''}\nexit ${proc.status}`) };
}

async function runApi(uc: UseCase, baseUrl: string): Promise<LayerResult> {
  const { request, expect } = uc.layers.api!;
  const url = `${(uc.layers.api!.base_url ?? baseUrl).replace(/\/$/, '')}${request.path}`;
  try {
    const res = await fetch(url, {
      method: request.method ?? 'GET',
      ...(request.body !== undefined ? { body: JSON.stringify(request.body), headers: { 'content-type': 'application/json' } } : {}),
    });
    return { layer: 'api', pass: res.status === expect.status, output: tail(`${request.method ?? 'GET'} ${url} → ${res.status} (expected ${expect.status})\n${await res.text()}`) };
  } catch (e) {
    return { layer: 'api', pass: false, output: `${request.method ?? 'GET'} ${url} failed: ${(e as Error).message}` };
  }
}

function baseUrlFor(projectDir: string, env: string | undefined): string {
  const config = loadConfig(projectDir);
  return (env && config.deploy?.[env]?.base_url) || process.env.CODELOOP_BASE_URL || 'http://localhost:4040';
}

interface MutateResult {
  vacuous: string[];
  message: string;
  /** No verdict was reached: there is nothing to compare against, or the old commit could not be built. */
  cannotRun?: boolean;
}

function setupCommand(projectDir: string, tree: string): string {
  const configured = loadConfig(projectDir).verify?.setup;
  if (configured !== undefined) return configured || '';
  return existsSync(join(tree, 'package.json')) ? 'npm ci && npm run build --if-present' : '';
}

/**
 * Re-runs the cli use cases on the commit before the card's first `Feature: <id>` commit. A use
 * case that still passes there never depended on the feature, so it proves nothing. The worktree
 * is installed and built first: a use case that fails there only because nothing was built would
 * look non-vacuous without being so.
 */
function mutate(projectDir: string, cardId: string, cases: UseCase[]): MutateResult {
  const first = git(projectDir, ['log', '--reverse', '--format=%H', `--grep=^Feature: ${cardId}$`]).split('\n')[0];
  if (!first) return { vacuous: [], cannotRun: true, message: `cannot run: no commit carries the trailer "Feature: ${cardId}", so there is no commit before the feature to compare against` };
  const base = git(projectDir, ['rev-parse', `${first}^`]);
  if (!base) return { vacuous: [], cannotRun: true, message: `cannot run: the first Feature: ${cardId} commit has no parent` };

  const tree = join(mkdtempSync(join(tmpdir(), 'codeloop-mutate-')), 'tree');
  if (spawnSync('git', ['worktree', 'add', '--detach', tree, base], { cwd: projectDir, encoding: 'utf-8' }).status !== 0) {
    throw new RefusalError(`could not create a worktree at ${base.slice(0, 7)}`);
  }
  try {
    const setup = setupCommand(projectDir, tree);
    if (setup) {
      const run = spawnSync(setup, { cwd: tree, shell: true, encoding: 'utf-8', timeout: 900_000 });
      if (run.status !== 0) {
        return { vacuous: [], cannotRun: true, message: `environment differs: \`${setup}\` failed at ${base.slice(0, 7)}, so the use cases were not judged there\n${tail(`${run.stdout ?? ''}${run.stderr ?? ''}`)}` };
      }
    }
    // When the project ships the `codeloop` binary itself, use cases must drive the old build, not
    // the one running this command.
    const bin = existsSync(join(tree, 'package.json')) ? JSON.parse(readFileSync(join(tree, 'package.json'), 'utf-8')).bin?.codeloop : undefined;
    const env = bin && existsSync(join(tree, bin)) ? checkEnv(join(tree, bin)) : checkEnv();
    const vacuous = cases.filter(uc => uc.layers.cli && runCli(uc, tree, undefined, env).pass).map(uc => uc.id);
    return { vacuous, message: `re-ran ${cases.filter(uc => uc.layers.cli).length} cli use cases at ${base.slice(0, 7)}, before ${cardId}${setup ? ` (after \`${setup}\`)` : ''}` };
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', tree], { cwd: projectDir });
    rmSync(join(tree, '..'), { recursive: true, force: true });
  }
}

/** `export` (the default) runs use cases on a copy of HEAD; `tree` runs them in the working tree. */
export function verifyWorkspace(projectDir: string): 'export' | 'tree' {
  return (loadConfig(projectDir).verify as { workspace?: string } | undefined)?.workspace === 'tree' ? 'tree' : 'export';
}

// Gitignored folders a copy of HEAD lacks and use cases usually need. Linked, not copied: the
// export is read-only for them, and a full install per verify would take minutes.
const DEPENDENCY_DIRS = ['node_modules', '.venv', 'venv'];

/**
 * A throwaway copy of HEAD for the use cases to run in. Several stories share one working tree, so
 * the tree holds other stories' half-done edits; HEAD is what this story's commits actually made.
 * The card's own use cases and spec are copied in from the tree (it owns them, committed or not),
 * and `verify.setup` runs there when it is set; otherwise the tree's dependency folders are linked.
 * Returns undefined when there is no commit to export.
 */
function exportHead(projectDir: string, nnn: string, specDir: string | undefined): { dir: string; sha: string; dispose: () => void } | { problem: string } | undefined {
  const sha = git(projectDir, ['rev-parse', 'HEAD']);
  if (!sha) return undefined;
  const root = mkdtempSync(join(tmpdir(), 'codeloop-verify-'));
  const dir = join(root, 'head');
  mkdirSync(dir);
  const dispose = () => rmSync(root, { recursive: true, force: true });
  const archive = spawnSync('sh', ['-c', `git -C "$1" archive HEAD | tar -x -C "$2"`, 'sh', projectDir, dir], { encoding: 'utf-8' });
  if (archive.status !== 0) {
    dispose();
    return { problem: `could not export HEAD ${sha.slice(0, 7)}: ${tail(archive.stderr ?? '')}` };
  }
  // Checks that list files with git (docs checks, linters) need a repository; this one holds HEAD only.
  spawnSync('sh', ['-c', 'git init -q && git add -A && git -c user.name=verify -c user.email=verify@local -c commit.gpgsign=false commit -q -m head'], { cwd: dir });
  for (const own of [usecasesOf(projectDir, nnn), specDir].filter((p): p is string => Boolean(p))) {
    if (existsSync(join(projectDir, own))) cpSync(join(projectDir, own), join(dir, own), { recursive: true });
  }
  if (existsSync(join(projectDir, '.env')) && !existsSync(join(dir, '.env'))) cpSync(join(projectDir, '.env'), join(dir, '.env'));
  const setup = (loadConfig(projectDir).verify as { setup?: string } | undefined)?.setup;
  if (setup) {
    const run = spawnSync(setup, { cwd: dir, shell: true, encoding: 'utf-8', timeout: 900_000 });
    if (run.status !== 0) {
      dispose();
      return { problem: `verify.setup \`${setup}\` failed in the export of ${sha.slice(0, 7)}:\n${tail(`${run.stdout ?? ''}${run.stderr ?? ''}`)}` };
    }
  } else {
    for (const d of DEPENDENCY_DIRS) if (existsSync(join(projectDir, d)) && !existsSync(join(dir, d))) symlinkSync(join(projectDir, d), join(dir, d));
  }
  return { dir, sha, dispose };
}

export async function verify(projectDir: string, ref: string, opts: { mutate?: boolean; env?: string; record?: boolean } = {}): Promise<VerifyResult> {
  const card = findCardOrNone(readCards(projectDir).cards, ref);
  const nnn = card ? cardKey(card) : cardNumber(ref);
  const acceptance = readAcceptance(projectDir, resolveSpecDir(projectDir, ref));
  const cases = loadUseCases(projectDir, nnn);
  const sha = git(projectDir, ['rev-parse', 'HEAD']);
  const result: VerifyResult = { exitCode: 0, sha, usecaseDir: usecasesOf(projectDir, nnn), missing: acceptance.filter(us => !cases.some(uc => uc.accept === us)), cases: [], vacuous: [] };
  // Nothing to check is not a pass: no acceptance lines or no use cases must stop the stage.
  if (acceptance.length === 0) return { ...result, exitCode: 2, problem: `the spec for ${ref} has no acceptance lines (\`- US1 Given ...\`), so there is nothing to verify` };
  if (result.missing.length) return { ...result, exitCode: 2 };

  const baseUrl = baseUrlFor(projectDir, opts.env);
  const out = specPath(projectDir, evidenceOf(projectDir, nnn));
  mkdirSync(out, { recursive: true });
  // Evidence is written to the tree, but only this card's own evidence folder.
  const exported = verifyWorkspace(projectDir) === 'export' ? exportHead(projectDir, nnn, resolveSpecDir(projectDir, ref)) : undefined;
  if (exported && 'problem' in exported) return { ...result, exitCode: 2, problem: exported.problem };
  const runIn = exported ? exported.dir : projectDir;
  const workspace = exported ? `export of ${exported.sha.slice(0, 7)}` : 'working tree';
  try {
  for (const uc of cases) {
    const layers: LayerResult[] = [];
    if (uc.layers.cli) layers.push(runCli(uc, runIn, opts.env));
    if (uc.layers.api) layers.push(await runApi(uc, baseUrl));
    // A use case with nothing runnable (ui only, or empty) must not count as a pass.
    const pass = layers.length > 0 && layers.every(l => l.pass);
    result.cases.push({ id: uc.id, accept: uc.accept, pass, layers });
    writeFileSync(join(out, `${uc.id}.json`), JSON.stringify({ id: uc.id, accept: uc.accept, failure_mode: uc.failure_mode, sha, env: opts.env ?? 'local', workspace, pass, layers }, null, 2) + '\n');
  }
  } finally {
    if (exported) exported.dispose();
  }

  const passed = result.cases.every(c => c.pass);
  // Measured only once the use cases pass; the line is written either way so the record shows the numbers.
  const budget = passed ? checkBudget(projectDir, card?.id ?? ref, card?.size) : undefined;
  const health = passed && budget?.pass !== false ? checkHealth(projectDir, card?.id ?? ref) : undefined;
  const ok = passed && budget?.pass !== false && health?.pass !== false;
  const rows = result.cases.map(c => `| ${c.id} | ${c.accept} | ${c.layers.map(l => `${l.layer} ${l.pass ? 'pass' : 'FAIL'}`).join(', ') || 'no runnable layer'} |`);
  // Only the marked block is rewritten: what a person adds to verify.md outside it (a clean-export
  // run, a table of guards) survives every later verify.
  const block = [VERIFY_START, `# Verify ${ref}`, '', `result: ${ok ? 'pass' : 'fail'}`, `sha: ${sha || 'none'}`, `env: ${opts.env ?? 'local'}`, `workspace: ${workspace}`, ...(budget ? [budgetLine(budget)] : []), ...(health ? [healthLine(health)] : []), '', '| Use case | Accepts | Layers |', '|---|---|---|', ...rows, VERIFY_END].join('\n');
  const file = join(out, 'verify.md');
  const before = existsSync(file) ? readFileSync(file, 'utf-8') : '';
  const at = before.indexOf(VERIFY_START), end = before.indexOf(VERIFY_END);
  const kept = at >= 0 && end > at ? before.slice(0, at) + block + before.slice(end + VERIFY_END.length) : `${block}\n${before ? `\n${before}` : ''}`;
  writeFileSync(file, kept.endsWith('\n') ? kept : `${kept}\n`);
  if (card && opts.record !== false) {
    annotateCard(projectDir, card.id, { evidence: `${evidenceOf(projectDir, nnn)}/verify.md` }, 'verify', { note: `result: ${ok ? 'pass' : 'fail'} at ${sha.slice(0, 7) || 'no commit'}` });
  }
  if (!passed) return { ...result, exitCode: 1 };
  if (budget) result.budget = budget;
  if (budget && !budget.pass && card?.size === 'trivial' && opts.record !== false) {
    const moved = resizeTrivial(projectDir, card.id, budget.message);
    return { ...result, exitCode: 1, problem: `${budget.message}; ${card.id} is re-sized to S and parked at the ${moved.gate ?? moved.stage} gate` };
  }
  if (budget && !budget.pass) return { ...result, exitCode: 1, problem: budget.message };
  if (health) result.health = health;
  if (health && !health.pass) return { ...result, exitCode: 1, problem: `health score fell from ${health.before!.score} to ${health.after!.score} (delta ${health.delta}, tolerance ${health.tolerance}); fix what got worse` };

  // Use cases run against harnesses; the walk proves the real stack answers a person. Checked on a
  // local verify only: a staging run and a mutation run judge the use cases, not the walk.
  if (!opts.mutate && !opts.env && liveWalkRequired(projectDir)) {
    const walk = checkLiveWalk(projectDir, card?.id ?? ref);
    if (walk.length) return { ...result, exitCode: 2, problem: `use cases pass, but the live walk is not done:\n  ${walk.join('\n  ')}` };
  }

  if (opts.mutate) {
    const m = mutate(projectDir, card?.id ?? ref, cases);
    return { ...result, vacuous: m.vacuous, mutate: m.message, exitCode: m.cannotRun ? 5 : m.vacuous.length ? 4 : 0 };
  }
  return result;
}
