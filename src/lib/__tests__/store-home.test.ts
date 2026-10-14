import { execFileSync, execSync } from 'child_process';
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mainTreeOf } from '../project-root.js';
import { ensureStoreLinks, moveStore, STORE_ITEMS, userStoreDir } from '../store-home.js';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'dist', 'index.js');
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
const cl = (cwd: string, ...args: string[]) => execFileSync(process.execPath, [CLI, ...args], { cwd, env: env(), encoding: 'utf-8' });
const cards = () => JSON.parse(readFileSync(join(dir, '.codeloop/cards.json'), 'utf-8')).cards as { id: string; title: string; spec?: string }[];
const config = (extra: string) => writeFileSync(join(dir, '.codeloop/config.yaml'), `${readFileSync(join(dir, '.codeloop/config.yaml'), 'utf-8')}${extra}`);

function files(base: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (p: string) => {
    if (!existsSync(p)) return;
    if (statSync(p).isDirectory()) for (const f of readdirSync(p)) walk(join(p, f));
    else out[relative(base, p)] = readFileSync(p, 'utf-8');
  };
  for (const item of STORE_ITEMS) walk(join(base, item));
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
  cl(dir, 'init', '--tools', 'claude', '--starter', 'generic');
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
    expect(lstatSync(join(dir, 'specs')).isSymbolicLink()).toBe(true);
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
    expect(lstatSync(join(dir, 'specs')).isSymbolicLink()).toBe(false);
    expect(files(dir)).toEqual(before);
  }, 60_000);
});
