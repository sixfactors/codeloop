#!/usr/bin/env node
// Compiles src into a temporary dir beside dist, load-tests it and only then swaps it in, so a
// failed or mid-edit compile never reaches dist. The global CLI is an npm link that runs
// dist/index.js, so a broken dist breaks codeloop in every project on the machine at once.
// Exits non-zero and leaves dist untouched when tsc or the load test fails.
import { existsSync, mkdtempSync, readdirSync, renameSync, rmSync } from 'fs';
import { spawn, spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
// dist/ui and dist/workspace come from build:ui and build:workspace, not tsc; they move across.
const CARRIED = ['ui', 'workspace'];

// The new build sits beside dist (same depth, same filesystem) so paths relative to dist, such
// as ../package.json, resolve the same during the load test, and the swap is a rename.
const out = mkdtempSync(join(ROOT, '.dist-build-'));
const fail = (msg) => {
  console.error(`build: ${msg}; dist left as it was`);
  rmSync(out, { recursive: true, force: true });
  process.exit(1);
};

const tsc = spawnSync(process.execPath, [join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '--outDir', out], { cwd: ROOT, stdio: 'inherit' });
if (tsc.status !== 0) fail(`tsc exited ${tsc.status}`);
if (!existsSync(join(out, 'index.js'))) fail('tsc wrote no index.js');

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

const run = (args, cwd) => spawnSync(process.execPath, [join(out, 'index.js'), ...args], { cwd, encoding: 'utf-8', env: { ...process.env, CODELOOP_OFF: '' } });
const version = run(['--version'], ROOT);
if (version.status !== 0) fail(`--version exited ${version.status}\n${version.stderr}`);
const project = mkdtempSync(join(tmpdir(), 'codeloop-build-check-'));
spawnSync('git', ['init', '-q'], { cwd: project });
const list = run(['card', 'list', '--json'], project);
rmSync(project, { recursive: true, force: true });
if (list.status !== 0) fail(`card list --json exited ${list.status}\n${list.stderr}`);
try { JSON.parse(list.stdout); } catch { fail(`card list --json printed no JSON: ${list.stdout.slice(0, 200)}`); }

const old = `${out}-old`;
if (existsSync(DIST)) {
  for (const name of CARRIED) if (existsSync(join(DIST, name))) renameSync(join(DIST, name), join(out, name));
  renameSync(DIST, old);
}
try {
  renameSync(out, DIST);
} catch (e) {
  if (existsSync(old)) {
    renameSync(old, DIST);
    for (const name of CARRIED) if (existsSync(join(out, name))) renameSync(join(out, name), join(DIST, name));
  }
  fail(`swap failed: ${e.message}`);
}
rmSync(old, { recursive: true, force: true });
console.log(`build: dist swapped in (${version.stdout.trim()})`);
