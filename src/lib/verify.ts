import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { cardKey, findCardOrNone, readCards, safeName } from './cards.js';
import { loadConfig } from './config.js';
import { annotateCard, RefusalError } from './engine.js';
import { cardNumber } from './lane.js';
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

export interface VerifyResult {
  exitCode: number;
  sha: string;
  missing: string[];
  cases: { id: string; accept: string; pass: boolean; layers: LayerResult[] }[];
  vacuous: string[];
  mutate?: string;
  /** Why nothing was run. */
  problem?: string;
}

const tail = (text: string) => text.trimEnd().split('\n').slice(-20).join('\n').slice(-2000);

function git(cwd: string, args: string[]): string {
  const run = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  return run.status === 0 ? run.stdout.trim() : '';
}

function loadUseCases(projectDir: string, nnn: string): UseCase[] {
  const dir = join(projectDir, 'usecases', nnn);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.yaml')).sort().map(f => {
    const uc = parseYaml(readFileSync(join(dir, f), 'utf-8')) as UseCase;
    // The id names the evidence file.
    safeName(uc?.id, `use case id in usecases/${nnn}/${f}`);
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

export async function verify(projectDir: string, ref: string, opts: { mutate?: boolean; env?: string; record?: boolean } = {}): Promise<VerifyResult> {
  const card = findCardOrNone(readCards(projectDir).cards, ref);
  const nnn = card ? cardKey(card) : cardNumber(ref);
  const acceptance = readAcceptance(projectDir, resolveSpecDir(projectDir, ref));
  const cases = loadUseCases(projectDir, nnn);
  const sha = git(projectDir, ['rev-parse', 'HEAD']);
  const result: VerifyResult = { exitCode: 0, sha, missing: acceptance.filter(us => !cases.some(uc => uc.accept === us)), cases: [], vacuous: [] };
  // Nothing to check is not a pass: no acceptance lines or no use cases must stop the stage.
  if (acceptance.length === 0) return { ...result, exitCode: 2, problem: `the spec for ${ref} has no acceptance lines (\`- US1 Given ...\`), so there is nothing to verify` };
  if (result.missing.length) return { ...result, exitCode: 2 };

  const baseUrl = baseUrlFor(projectDir, opts.env);
  const out = join(projectDir, 'evidence', nnn);
  mkdirSync(out, { recursive: true });
  for (const uc of cases) {
    const layers: LayerResult[] = [];
    if (uc.layers.cli) layers.push(runCli(uc, projectDir, opts.env));
    if (uc.layers.api) layers.push(await runApi(uc, baseUrl));
    // A use case with nothing runnable (ui only, or empty) must not count as a pass.
    const pass = layers.length > 0 && layers.every(l => l.pass);
    result.cases.push({ id: uc.id, accept: uc.accept, pass, layers });
    writeFileSync(join(out, `${uc.id}.json`), JSON.stringify({ id: uc.id, accept: uc.accept, failure_mode: uc.failure_mode, sha, env: opts.env ?? 'local', pass, layers }, null, 2) + '\n');
  }

  const passed = result.cases.every(c => c.pass);
  const rows = result.cases.map(c => `| ${c.id} | ${c.accept} | ${c.layers.map(l => `${l.layer} ${l.pass ? 'pass' : 'FAIL'}`).join(', ') || 'no runnable layer'} |`);
  writeFileSync(join(out, 'verify.md'), [`# Verify ${ref}`, '', `result: ${passed ? 'pass' : 'fail'}`, `sha: ${sha || 'none'}`, `env: ${opts.env ?? 'local'}`, '', '| Use case | Accepts | Layers |', '|---|---|---|', ...rows, ''].join('\n'));
  if (card && opts.record !== false) {
    annotateCard(projectDir, card.id, { evidence: `evidence/${nnn}/verify.md` }, 'verify', { note: `result: ${passed ? 'pass' : 'fail'} at ${sha.slice(0, 7) || 'no commit'}` });
  }
  if (!passed) return { ...result, exitCode: 1 };

  if (opts.mutate) {
    const m = mutate(projectDir, card?.id ?? ref, cases);
    return { ...result, vacuous: m.vacuous, mutate: m.message, exitCode: m.cannotRun ? 5 : m.vacuous.length ? 4 : 0 };
  }
  return result;
}
