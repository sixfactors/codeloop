import { execFileSync, execSync, spawnSync } from 'child_process';
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mainTreeOf } from '../project-root.js';
import { ensureStoreLinks, moveStore, storeItems, userStoreDir } from '../store-home.js';

const CLI = join(process.env.CODELOOP_TEST_DIST ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'dist'), 'index.js');
const GIT = 'git -c user.email=a@b -c user.name=t';

let root: string;
let dir: string;
let wt: string;
let home: string;
let savedHome: string | undefined;
const env = () => {
  const e = { ...process.env, CODELOOP_HOME: home };
  delete e.CODELOOP_PROJECT_DIR;
  delete e.CODELOOP_WORK_DIR;
  return e;
};
const cl = (cwd: string, ...args: string[]) => execFileSync(process.execPath, [CLI, ...args], { cwd, env: env(), encoding: 'utf-8', timeout: 60_000, killSignal: 'SIGKILL' });
const cards = () => JSON.parse(readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8')).cards as { id: string; title: string; spec?: string }[];
const config = (extra: string) => writeFileSync(join(dir, '.codeloop/config.yaml'), `${readFileSync(join(dir, '.codeloop/config.yaml'), 'utf-8')}${extra}`);

function files(base: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (p: string) => {
    if (!existsSync(p)) return;
    if (statSync(p).isDirectory()) for (const f of readdirSync(p)) walk(join(p, f));
    else out[relative(base, p)] = readFileSync(p, 'utf-8');
  };
  for (const item of storeItems(dir)) walk(join(base, item));
  return out;
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'codeloop-store-')));
  dir = join(root, 'demo');
  wt = join(root, 'demo-wt');
  home = join(root, 'home');
  savedHome = process.env.CODELOOP_HOME;
  process.env.CODELOOP_HOME = home;
  execSync(`mkdir -p ${dir}`);
  execSync('git init -q -b main', { cwd: dir });
  cl(dir, 'init', '--full', '--tools', 'claude', '--starter', 'generic');
  execSync(`${GIT} add -A && ${GIT} commit -qm init && git worktree add -q -b story ${wt}`, { cwd: dir });
});
afterEach(() => {
  if (savedHome === undefined) delete process.env.CODELOOP_HOME;
  else process.env.CODELOOP_HOME = savedHome;
  rmSync(root, { recursive: true, force: true });
});

describe('one board for every worktree', () => {
  it('a worktree resolves to the main tree, and a card made there lands on the main tree board with no env', () => {
    expect(mainTreeOf(wt)).toBe(dir);
    expect(mainTreeOf(dir)).toBeUndefined();
    cl(wt, 'start', 'Founders can export invoices');
    expect(cards().map(c => c.title)).toContain('Founders can export invoices');
    expect(existsSync(join(wt, '.codeloop/cards.json')) && JSON.parse(readFileSync(join(wt, '.codeloop/cards.json'), 'utf-8')).cards.length).toBeFalsy();
  }, 60_000);

  it('with store.home user the spec lands in the per-project folder, behind links, and the worktree reads it', () => {
    config('store:\n  home: user\n');
    cl(dir, 'start', 'Founders can export invoices');
    const store = userStoreDir(dir);
    expect(store).toBe(join(home, 'projects', 'demo'));
    const spec = cards()[0].spec!;
    expect(existsSync(join(store, spec, 'research.md'))).toBe(true);
    expect(lstatSync(join(dir, '.codeloop/specs')).isSymbolicLink()).toBe(true);
    expect(lstatSync(join(dir, '.codeloop/cards.json')).isSymbolicLink()).toBe(true);
    // The worktree reads the same research.md: the check finds the file and judges its content.
    let out = '';
    try {
      cl(wt, 'check', 'research', cards()[0].id);
    } catch (e) {
      out = String((e as { stderr?: string }).stderr ?? e);
    }
    expect(out).toContain(`${spec}/research.md has no line starting with "verdict:"`);
    expect(cl(wt, 'store', 'where')).toContain(`store: ${store}`);
  }, 60_000);

  it('refuses while a repo copy sits where a user-mode link belongs', () => {
    cl(dir, 'start', 'Founders can export invoices');
    config('store:\n  home: user\n');
    expect(() => cl(dir, 'card', 'list')).toThrow(/repo copies are still at .*specs/);
  }, 60_000);

  it('the refusal from the step every command runs first is one line and exit 2, never a stack trace', () => {
    cl(dir, 'start', 'Founders can export invoices');
    config('store:\n  home: user\n');
    const run = spawnSync(process.execPath, [CLI, 'card', 'list'], { cwd: dir, env: env(), encoding: 'utf-8', timeout: 60_000 });
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(/^codeloop: store\.home is user, but repo copies are still at /m);
    expect(run.stderr).not.toMatch(/^\s+at /m);
  }, 60_000);

  it('store move --to user then --to repo round-trips the files byte for byte', () => {
    cl(dir, 'start', 'Founders can export invoices');
    cl(dir, 'start', 'Founders can import customers');
    const before = files(dir);
    expect(Object.keys(before).length).toBeGreaterThan(5);
    const io = { read: () => readFileSync(join(dir, '.codeloop/config.yaml'), 'utf-8'), write: (t: string) => writeFileSync(join(dir, '.codeloop/config.yaml'), t) };

    const toUser = moveStore(dir, 'user', io);
    expect(io.read()).toMatch(/^store:\n {2}home: user$/m);
    expect(files(userStoreDir(dir))).toEqual(before);
    expect(files(dir)).toEqual(before); // the repo copy is untouched
    for (const item of toUser.toDelete) rmSync(join(dir, item), { recursive: true, force: true });
    expect(ensureStoreLinks(dir).every(l => l.state === 'created')).toBe(true);

    moveStore(dir, 'repo', io);
    expect(io.read()).toMatch(/^ {2}home: repo$/m);
    expect(lstatSync(join(dir, '.codeloop/specs')).isSymbolicLink()).toBe(false);
    expect(files(dir)).toEqual(before);
  }, 60_000);
});

describe('store.move names what user home moves', () => {
  it('with a subset, store move --to user leaves evidence in the repo and store where prints it as repo', () => {
    cl(dir, 'start', 'Founders can export invoices');
    execSync('mkdir -p .codeloop/evidence/001 && echo "result: pass" > .codeloop/evidence/001/verify.md', { cwd: dir });
    config('store:\n  move: [cards, state, specs, shape]\n');
    const evidenceBefore = readFileSync(join(dir, '.codeloop/evidence/001/verify.md'), 'utf-8');

    const out = cl(dir, 'store', 'move', '--to', 'user');
    // The move holds the repo lock, whose file is in .codeloop/state, so state exists and moves too.
    expect(out).toContain('copied .codeloop/cards.json, .codeloop/state, .codeloop/specs');
    expect(out).not.toMatch(/copied .*evidence/);
    expect(existsSync(join(userStoreDir(dir), '.codeloop/evidence'))).toBe(false);
    expect(readFileSync(join(dir, '.codeloop/evidence/001/verify.md'), 'utf-8')).toBe(evidenceBefore);
    expect(readFileSync(join(dir, '.codeloop/config.yaml'), 'utf-8')).toMatch(/^store:\n {2}home: user\n {2}move: \[cards, state, specs, shape\]$/m);

    // The refusal names only the moved paths still in the repo, never evidence.
    let refused = '';
    try {
      cl(dir, 'card', 'list');
    } catch (e) {
      refused = String((e as { stderr?: string }).stderr ?? e);
    }
    expect(refused).toMatch(/repo copies are still at \.codeloop\/cards\.json, \.codeloop\/state, \.codeloop\/specs;/);

    for (const p of ['.codeloop/cards.json', '.codeloop/state', '.codeloop/specs']) rmSync(join(dir, p), { recursive: true, force: true });
    cl(dir, 'card', 'list'); // the next ordinary command links the moved paths
    const where = cl(dir, 'store', 'where');
    expect(where).toMatch(/^ {2}\.codeloop\/evidence\s+repo\s+\S*\/demo\/\.codeloop\/evidence$/m);
    expect(where).toMatch(/^ {2}\.codeloop\/specs\s+user\s+\S*\/home\/projects\/demo\/\.codeloop\/specs \(linked\)$/m);
    expect(lstatSync(join(dir, '.codeloop/evidence')).isSymbolicLink()).toBe(false);
  }, 60_000);
});
