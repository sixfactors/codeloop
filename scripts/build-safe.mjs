#!/usr/bin/env node
// Compiles src into a temporary dir beside dist, load-tests it and only then swaps it in, so a
// failed or mid-edit compile never reaches dist. The global CLI is an npm link that runs
// dist/index.js, so a broken dist breaks codeloop in every project on the machine at once.
// Exits non-zero and leaves dist untouched when tsc or the load test fails. --allow-type-errors
// still swaps when tsc reports type errors but its output parses and loads. --out <dir> builds
// into another folder at dist's depth instead (the test setup's .test-dist), never touching dist.
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync } from 'fs';
import { spawn, spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REAL_DIST = join(ROOT, 'dist');
const outAt = process.argv.indexOf('--out');
const DIST = outAt > 0 ? join(ROOT, process.argv[outAt + 1]) : REAL_DIST;
if (dirname(DIST) !== ROOT) {
  console.error('build: --out names a folder directly under the package root, so paths relative to dist resolve the same');
  process.exit(1);
}
// dist/ui and dist/workspace come from build:ui and build:workspace, not tsc; they move across
// into a new dist, and a separate --out build links to the real dist's copies.
const CARRIED = ['ui', 'workspace'];

// The new build sits beside dist (same depth, same filesystem) so paths relative to dist, such
// as ../package.json, resolve the same during the load test, and the swap is a rename.
const out = mkdtempSync(join(ROOT, '.dist-build-'));
const fail = (msg) => {
  console.error(`build: ${msg}; ${DIST === REAL_DIST ? 'dist' : DIST} left as it was`);
  rmSync(out, { recursive: true, force: true });
  process.exit(1);
};

const allowTypeErrors = process.argv.includes('--allow-type-errors');
const tsc = spawnSync(process.execPath, [join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '--outDir', out], { cwd: ROOT, stdio: 'inherit' });
if (tsc.status !== 0 && !allowTypeErrors) fail(`tsc exited ${tsc.status}`);
if (!existsSync(join(out, 'index.js'))) fail('tsc wrote no index.js');

// The global CLI is an npm link that may point straight at dist/index.js, so the entry needs its
// executable bit, and mkdtemp's 0700 would lock other users out of the folder.
chmodSync(out, 0o755);
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
const binTargets = Object.values(typeof pkg.bin === 'string' ? { codeloop: pkg.bin } : pkg.bin ?? {})
  .map((b) => b.replace(/^\.\//, ''))
  .filter((b) => b.startsWith('dist/'))
  .map((b) => join(out, b.slice('dist/'.length)));
for (const file of new Set([join(out, 'index.js'), join(out, 'hookd-main.js'), ...binTargets])) if (existsSync(file)) chmodSync(file, 0o755);

const jsFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? jsFiles(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : []);

// node --check parses each module, which catches early errors such as a duplicate declaration in
// a module the smoke commands below never load.
async function syntaxCheck(files) {
  const bad = [];
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const file = files[next++];
      const res = await new Promise((resolve) => {
        const p = spawn(process.execPath, ['--check', file], { stdio: ['ignore', 'ignore', 'pipe'] });
        let err = '';
        p.stderr.on('data', (d) => { err += d; });
        p.on('close', (code) => resolve({ code, err }));
      });
      if (res.code !== 0) bad.push(`${file}\n${res.err.trim()}`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return bad;
}

const bad = await syntaxCheck(jsFiles(out));
if (bad.length) fail(`${bad.length} compiled module(s) do not parse:\n${bad.join('\n')}`);

// Run the entry file itself, as the global link does, so a missing executable bit or shebang fails here.
const run = (args, cwd) => spawnSync(join(out, 'index.js'), args, { cwd, encoding: 'utf-8', env: { ...process.env, CODELOOP_OFF: '' } });
const version = run(['--version'], ROOT);
if (version.status !== 0) fail(`--version exited ${version.status ?? version.error?.message}\n${version.stderr ?? ''}`);
const project = mkdtempSync(join(tmpdir(), 'codeloop-build-check-'));
spawnSync('git', ['init', '-q'], { cwd: project });
const list = run(['card', 'list', '--json'], project);
rmSync(project, { recursive: true, force: true });
if (list.status !== 0) fail(`card list --json exited ${list.status}\n${list.stderr}`);
try { JSON.parse(list.stdout); } catch { fail(`card list --json printed no JSON: ${list.stdout.slice(0, 200)}`); }

// Two builds at once (test runs in several sessions) would interleave their renames; mkdir is
// atomic, so it serialises the swap.
const lock = join(ROOT, '.dist-build.lock');
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
for (let waited = 0; ; waited += 100) {
  try { mkdirSync(lock); break; } catch {
    if (waited > 30_000) rmSync(lock, { recursive: true, force: true });
    sleep(100);
  }
}
process.on('exit', () => rmSync(lock, { recursive: true, force: true }));
const old = `${out}-old`;
if (DIST !== REAL_DIST) {
  for (const name of CARRIED) if (existsSync(join(REAL_DIST, name))) symlinkSync(join(REAL_DIST, name), join(out, name));
} else if (existsSync(DIST)) {
  for (const name of CARRIED) if (existsSync(join(DIST, name))) renameSync(join(DIST, name), join(out, name));
}
if (existsSync(DIST)) renameSync(DIST, old);
try {
  renameSync(out, DIST);
} catch (e) {
  if (existsSync(old)) {
    renameSync(old, DIST);
    if (DIST === REAL_DIST) for (const name of CARRIED) if (existsSync(join(out, name))) renameSync(join(out, name), join(DIST, name));
  }
  fail(`swap failed: ${e.message}`);
}
rmSync(old, { recursive: true, force: true });
console.log(`build: ${DIST === REAL_DIST ? 'dist' : DIST} swapped in (${version.stdout.trim()})`);
