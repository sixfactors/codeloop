#!/usr/bin/env node
// Starts `codeloop serve` on the bench fixture and measures what the design budgets: index build
// time, /api/cards p50, /api/pages?q= p50, and the server's RSS after 200 requests.
// `--dir <fixture>` reuses a fixture; otherwise one is written. `--keep` leaves it on disk.
import { spawn, spawnSync } from 'child_process';
import { rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : fallback;
};
const PORT = parseInt(arg('port', '4077'), 10);
const RUNS = parseInt(arg('runs', '50'), 10);
const TARGET = { build: 5000, cards: 50, search: 100 };

let dir = arg('dir');
const made = !dir;
if (made) {
  const t0 = Date.now();
  const out = spawnSync(process.execPath, [join(ROOT, 'scripts/bench-fixture.mjs')], { encoding: 'utf-8' });
  if (out.status !== 0) {
    console.error(out.stderr);
    process.exit(1);
  }
  dir = out.stdout.trim();
  console.log(`fixture ${dir} written in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

const server = spawn(process.execPath, [join(ROOT, 'dist/index.js'), 'serve', '--port', String(PORT)], { cwd: dir, env: { ...process.env, CODELOOP_UI_DIR: '', CODELOOP_WORKSPACE_DIR: 'none' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', d => (log += d));
server.stderr.on('data', d => (log += d));
const base = `http://127.0.0.1:${PORT}`;

const until = async (check, ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
};
const ok = async path => {
  try {
    return (await fetch(`${base}${path}`)).ok;
  } catch {
    return false;
  }
};

const startedAt = Date.now();
if (!(await until(() => /Index built in/.test(log), 60_000))) {
  console.error(`serve did not report an index build within 60 s:\n${log}`);
  server.kill();
  process.exit(1);
}
const buildMs = parseInt(/Index built in (\d+) ms/.exec(log)[1], 10);
const firstAnswer = Date.now() - startedAt;
if (!(await ok('/api/cards?limit=1'))) {
  console.error(`/api/cards not answering:\n${log}`);
  server.kill();
  process.exit(1);
}

const p50 = async (path, runs = RUNS) => {
  const times = [];
  let status = 0;
  let bytes = 0;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    const res = await fetch(`${base}${path}`);
    bytes = (await res.text()).length;
    status = res.status;
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return { p50: times[Math.floor(times.length / 2)], p95: times[Math.floor(times.length * 0.95)], status, bytes };
};

const rows = [];
const row = async (name, path, target) => {
  const r = await p50(path);
  rows.push({ name, path, p50: r.p50, p95: r.p95, status: r.status, kb: r.bytes / 1024, target });
};
await row('cards list (200)', '/api/cards', TARGET.cards);
await row('cards list, lane filter', '/api/cards?lane=build&stage=implement', TARGET.cards);
await row('cards search', '/api/cards?q=owner+approve', TARGET.search);
await row('one card with events', '/api/cards/c-0042', TARGET.cards);
await row('pages list (200)', '/api/pages', TARGET.cards);
await row('pages search', '/api/pages?q=watcher+latency', TARGET.search);
await row('pages search, folder', '/api/pages?q=release&folder=runbooks', TARGET.search);
await row('stats', '/api/stats', TARGET.cards);
await row('inbox', '/api/inbox', TARGET.cards);
await row('cards, gate=waiting', '/api/cards?gate=waiting', TARGET.cards);
const etag = (await fetch(`${base}/api/cards`)).headers.get('etag');
const notModified = await (async () => {
  const t0 = performance.now();
  const res = await fetch(`${base}/api/cards`, { headers: { 'If-None-Match': etag } });
  return { ms: performance.now() - t0, status: res.status };
})();

// 200 mixed requests, then the server's resident set.
for (let i = 0; i < 200; i++) await fetch(`${base}${i % 2 ? '/api/pages?q=' + ['agent', 'wiki', 'gate', 'index'][i % 4] : '/api/cards?cursor=c-' + String((i * 37) % 4800).padStart(4, '0')}`);
const rssKb = parseInt(spawnSync('ps', ['-o', 'rss=', '-p', String(server.pid)], { encoding: 'utf-8' }).stdout.trim(), 10);

server.kill();
if (made && !process.argv.includes('--keep')) rmSync(dir, { recursive: true, force: true });

const pad = (s, n) => String(s).padEnd(n);
const num = (n, w = 8) => n.toFixed(1).padStart(w);
console.log();
console.log(`index build        ${num(buildMs)} ms   target ${TARGET.build} ms   ${buildMs <= TARGET.build ? 'ok' : 'OVER'}   (first answer ${firstAnswer} ms after spawn)`);
console.log(`${pad('request', 26)} ${'p50 ms'.padStart(8)} ${'p95 ms'.padStart(8)} ${'kB'.padStart(8)}  status  target`);
for (const r of rows) console.log(`${pad(r.name, 26)} ${num(r.p50)} ${num(r.p95)} ${num(r.kb)}  ${r.status}     ${r.target} ms  ${r.p50 <= r.target ? 'ok' : 'OVER'}`);
console.log(`${pad('cards list, If-None-Match', 26)} ${num(notModified.ms)} ${''.padStart(8)} ${''.padStart(8)}  ${notModified.status}`);
console.log(`memory after 200 requests  ${(rssKb / 1024).toFixed(0)} MB RSS`);
const over = rows.filter(r => r.p50 > r.target).length + (buildMs > TARGET.build ? 1 : 0);
process.exit(over ? 2 : 0);
