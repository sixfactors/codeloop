#!/usr/bin/env node
// Builds the workspace app as a standalone Next server and copies what `codeloop serve` needs into
// dist/workspace/: the standalone server with its own node_modules, .next/static and public.
// Prints the unpacked size; the package budget is 40 MB.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE = join(ROOT, 'workspace');
const OUT = join(ROOT, 'dist', 'workspace');
const BUDGET_MB = 40;

const config = readFileSync(join(WORKSPACE, 'next.config.ts'), 'utf-8');
const env = { ...process.env, NODE_ENV: 'production', CODELOOP_DEV_PROXY: '' };
if (!config.includes("'standalone'")) {
  console.error('workspace/next.config.ts does not name output: standalone; building with NEXT_OUTPUT=standalone and hoping the config honours it');
  env.NEXT_OUTPUT = 'standalone';
}
delete env.NEXT_OUTPUT_EXPORT;

const t0 = Date.now();
const build = spawnSync('npx', ['next', 'build'], { cwd: WORKSPACE, env, stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

// With two lockfiles (the repo's and workspace/'s) Next traces from the repo root and nests the
// server under standalone/workspace/; its node_modules sit there too.
const standaloneRoot = join(WORKSPACE, '.next', 'standalone');
const standalone = existsSync(join(standaloneRoot, 'server.js')) ? standaloneRoot : join(standaloneRoot, 'workspace');
if (!existsSync(join(standalone, 'server.js'))) {
  console.error(`no standalone server under ${standaloneRoot}: the build did not use output: 'standalone'`);
  process.exit(2);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(standalone, OUT, { recursive: true });
if (standalone !== standaloneRoot && existsSync(join(standaloneRoot, 'node_modules'))) cpSync(join(standaloneRoot, 'node_modules'), join(OUT, 'node_modules'), { recursive: true });
cpSync(join(WORKSPACE, '.next', 'static'), join(OUT, '.next', 'static'), { recursive: true });
if (existsSync(join(WORKSPACE, 'public'))) cpSync(join(WORKSPACE, 'public'), join(OUT, 'public'), { recursive: true });
// The build cache is not needed to serve and is the biggest thing in .next.
rmSync(join(OUT, '.next', 'cache'), { recursive: true, force: true });
// Traced but never loaded by this server: sharp's binaries (images are unoptimized), typescript
// (next.config.ts is only read at build time; the standalone config is inlined), the AMP validator.
for (const unused of ['node_modules/@img', 'node_modules/typescript', 'node_modules/next/dist/compiled/amphtml-validator']) rmSync(join(OUT, unused), { recursive: true, force: true });

function size(path) {
  const s = statSync(path);
  if (!s.isDirectory()) return s.size;
  let total = 0;
  for (const name of readdirSync(path)) total += size(join(path, name));
  return total;
}
const mb = n => (n / 1024 / 1024).toFixed(1);
const total = size(OUT);
const parts = readdirSync(OUT).map(name => [name, size(join(OUT, name))]).sort((a, b) => b[1] - a[1]);
console.log(`\ndist/workspace: ${mb(total)} MB unpacked in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
for (const [name, bytes] of parts) console.log(`  ${name.padEnd(16)} ${mb(bytes).padStart(7)} MB`);
if (total > BUDGET_MB * 1024 * 1024) {
  console.error(`over the ${BUDGET_MB} MB budget`);
  process.exit(3);
}
