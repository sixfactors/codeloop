#!/usr/bin/env node
// The core of scripts/v1-untouched.sh; that file's header documents the command. Plain node, no
// package imports, so it runs the same whatever the checkout's dist holds.
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync, statSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';

const args = process.argv.slice(2);
const verb = args[0];
const opt = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at > 0 && args[at + 1] !== undefined ? args[at + 1] : fallback;
};
const flag = name => args.includes(`--${name}`);
const fail = (code, message) => {
  console.error(`v1-untouched: ${message}`);
  process.exit(code);
};
if (verb !== 'snapshot' && verb !== 'compare') fail(2, 'usage: v1-untouched.sh snapshot|compare [--home <dir>] [--project <dir>] [--file <path>] [--binary <path>] [--crontab <cmd>|--no-crontab]');

const home = resolve(opt('home', process.env.CODELOOP_V1_HOME || join(homedir(), '.codeloop')));
const file = resolve(opt('file', join(home, 'v1-untouched.snapshot.json')));
const binaryOpt = opt('binary', undefined);
const crontabCmd = flag('no-crontab') ? undefined : opt('crontab', 'crontab');

const sha = text => createHash('sha256').update(text).digest('hex');
const real = p => {
  try {
    return realpathSync(p);
  } catch {
    return undefined;
  }
};
/** The hash of a file's content behind any links, or 'absent'. */
const fileHash = p => {
  const r = real(p);
  return r && statSync(r).isFile() ? sha(readFileSync(r)) : 'absent';
};
/** The hash of every file under a folder (names and bytes), links followed, or 'absent'. */
function treeHash(root) {
  const r = real(root);
  if (!r || !statSync(r).isDirectory()) return 'absent';
  const h = createHash('sha256');
  const walk = dir => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const target = real(full);
      if (!target) continue;
      const st = statSync(target);
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) h.update(full.slice(r.length)).update(readFileSync(target));
    }
  };
  walk(r);
  return h.digest('hex');
}
const readJson = p => {
  try {
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return undefined;
  }
};

function projectDir() {
  const given = opt('project', undefined);
  if (given) return resolve(given);
  const registry = readJson(join(home, 'projects.json'));
  const entry = Array.isArray(registry) ? registry.find(p => p.id === 'ops-ai') : undefined;
  if (!entry?.path) fail(2, `no --project given and ${join(home, 'projects.json')} has no ops-ai entry`);
  return resolve(entry.path);
}

function binaryState() {
  let which = binaryOpt;
  if (!which) {
    try {
      which = execFileSync('sh', ['-c', 'command -v codeloop'], { encoding: 'utf-8' }).trim();
    } catch {
      which = '';
    }
  }
  if (!which) return { which: '', real: 'absent' };
  const target = real(which) ?? 'absent';
  // The package folder: <pkg>/bin/codeloop -> <pkg>.
  const pkgDir = target !== 'absent' ? dirname(dirname(target)) : undefined;
  const pkg = pkgDir ? readJson(join(pkgDir, 'package.json')) : undefined;
  return {
    which,
    real: target,
    version: pkg?.version ?? 'absent',
    gitHead: pkg?.gitHead ?? 'absent',
    tree: pkgDir && pkg ? treeHash(pkgDir) : 'absent',
  };
}

function crontabLines() {
  if (!crontabCmd) return [];
  try {
    const out = execFileSync('sh', ['-c', `${crontabCmd} -l`], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').filter(l => l.includes('# codeloop:')).sort();
  } catch {
    return [];
  }
}

function boardState(project) {
  const link = join(project, '.codeloop/cards.json');
  let points = 'absent';
  try {
    points = lstatSync(link).isSymbolicLink() ? resolve(dirname(link), readlinkSync(link)) : 'in the repo';
  } catch {
    /* no board */
  }
  const target = real(link);
  const board = target ? readJson(target) : undefined;
  const cards = {};
  for (const c of board?.cards ?? []) {
    const events = Array.isArray(c.events) ? c.events : [];
    cards[c.id] = { count: events.length, hash: sha(JSON.stringify(events)) };
  }
  return { link: points, target: target ?? 'absent', version: board?.version ?? null, cards };
}

function take() {
  const project = projectDir();
  const hub = readJson(join(home, 'state/hub.json'));
  return {
    takenAt: new Date().toISOString(),
    home,
    project,
    registry: fileHash(join(home, 'projects.json')),
    hub: hub ? { port: hub.port ?? null, host: hub.host ?? null } : 'absent',
    binary: binaryState(),
    crontab: crontabLines(),
    settings: {
      '.claude/settings.json': fileHash(join(project, '.claude/settings.json')),
      '.mcp.json': fileHash(join(project, '.mcp.json')),
      '.cursor/mcp.json': fileHash(join(project, '.cursor/mcp.json')),
      '.codeloop/config.yaml': fileHash(join(project, '.codeloop/config.yaml')),
    },
    board: boardState(project),
  };
}

/** The events of each card now, for the prefix compare: the first `count` events hashed again. */
function prefixHashes(project, wanted) {
  const target = real(join(project, '.codeloop/cards.json'));
  const board = target ? readJson(target) : undefined;
  const out = {};
  for (const c of board?.cards ?? []) {
    const events = Array.isArray(c.events) ? c.events : [];
    const want = wanted[c.id];
    out[c.id] = { count: events.length, prefix: want ? sha(JSON.stringify(events.slice(0, want.count))) : undefined };
  }
  return out;
}

if (verb === 'snapshot') {
  const snap = take();
  writeFileSync(file, `${JSON.stringify(snap, null, 2)}\n`);
  console.log(`v1-untouched: snapshot of ${snap.home} and ${snap.project} written to ${file}`);
  console.log(`  registry ${snap.registry.slice(0, 12)}  hub ${snap.hub === 'absent' ? 'absent' : `${snap.hub.host}:${snap.hub.port}`}  binary ${snap.binary.real} (${snap.binary.version})  crontab ${snap.crontab.length} line(s)  board ${Object.keys(snap.board.cards).length} card(s) at version ${snap.board.version}`);
  process.exit(0);
}

const before = readJson(file);
if (!before) fail(2, `no snapshot at ${file}; run \`v1-untouched.sh snapshot\` first`);
const now = take();
if (before.home !== now.home || before.project !== now.project) fail(2, `the snapshot is of ${before.home} and ${before.project}, not ${now.home} and ${now.project}; take a new one`);

const changed = [];
if (before.registry !== now.registry) changed.push(`${join(home, 'projects.json')}: registry content changed`);
if (JSON.stringify(before.hub) !== JSON.stringify(now.hub)) changed.push(`${join(home, 'state/hub.json')}: hub port or host changed (${JSON.stringify(before.hub)} -> ${JSON.stringify(now.hub)})`);
for (const key of ['which', 'real', 'version', 'gitHead', 'tree']) {
  if (before.binary[key] !== now.binary[key]) changed.push(`binary ${key}: ${before.binary[key]} -> ${now.binary[key]}`);
}
if (JSON.stringify(before.crontab) !== JSON.stringify(now.crontab)) {
  changed.push('crontab: the codeloop-tagged lines changed');
  for (const l of before.crontab.filter(l => !now.crontab.includes(l))) changed.push(`  - ${l}`);
  for (const l of now.crontab.filter(l => !before.crontab.includes(l))) changed.push(`  + ${l}`);
}
for (const [name, hash] of Object.entries(before.settings)) {
  if (now.settings[name] !== hash) changed.push(`${join(now.project, name)}: changed`);
}
if (before.board.link !== now.board.link || before.board.target !== now.board.target) changed.push(`${join(now.project, '.codeloop/cards.json')}: the link points elsewhere (${before.board.link} -> ${now.board.link})`);
if (typeof before.board.version === 'number' && typeof now.board.version === 'number' && now.board.version < before.board.version) changed.push(`board version went backwards (${before.board.version} -> ${now.board.version})`);
const prefixes = prefixHashes(now.project, before.board.cards);
for (const [id, was] of Object.entries(before.board.cards)) {
  const is = prefixes[id];
  if (!is) changed.push(`board card ${id}: removed`);
  else if (is.count < was.count) changed.push(`board card ${id}: ${was.count - is.count} event(s) dropped (${was.count} -> ${is.count})`);
  else if (is.prefix !== was.hash) changed.push(`board card ${id}: an event recorded at the snapshot was changed or removed (the first ${was.count} events no longer match)`);
}
const appended = Object.entries(prefixes).filter(([id, is]) => before.board.cards[id] && is.count > before.board.cards[id].count).length;
const added = Object.keys(prefixes).filter(id => !before.board.cards[id]).length;

if (changed.length === 0) {
  console.log(`v1-untouched: untouched since ${before.takenAt}; v1 itself appended to ${appended} card(s) and added ${added}, which is allowed`);
  process.exit(0);
}
console.log(`v1-untouched: ${changed.length} change(s) since ${before.takenAt} that a v2 session must not make:`);
for (const line of changed) console.log(`  ${line}`);
process.exit(1);
