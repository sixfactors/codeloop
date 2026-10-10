#!/usr/bin/env node
// Writes content/commands.json from the CLI's own --help output, so the command reference
// never carries a flag the CLI does not have. Runs before `next build`. When ../dist is
// absent (the Vercel build has no compiled CLI) the JSON already in the tree is kept.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, '../../dist/index.js');
const out = resolve(here, '../content/commands.json');

if (!existsSync(cli)) {
  console.log(`gen-commands: ${cli} not found, keeping ${out}`);
  process.exit(0);
}

const version = JSON.parse(readFileSync(resolve(here, '../../package.json'), 'utf8')).version;

function help(args) {
  return execFileSync('node', [cli, ...args, '--help'], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
}

// Commander prints "Commands:" then one entry per line, continuation lines indented deeper.
function section(text, name) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === `${name}:`);
  if (start < 0) return [];
  const rows = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      if (rows.length && lines[i + 1] && /^\S/.test(lines[i + 1])) break;
      continue;
    }
    if (/^\S/.test(line)) break;
    const m = line.match(/^  (\S.*?)\s{2,}(.*)$/);
    if (m) rows.push({ signature: m[1].trim(), description: m[2].trim() });
    else if (rows.length) rows[rows.length - 1].description += ' ' + line.trim();
    else if (line.trim()) rows.push({ signature: line.trim(), description: '' });
  }
  // A long signature wraps its description onto the next line.
  return rows.map((r) => ({ ...r, description: r.description.replace(/\s+/g, ' ').trim() }));
}

function describe(text) {
  const lines = text.split('\n');
  const usage = lines.findIndex((l) => l.startsWith('Usage:'));
  const desc = [];
  for (let i = usage + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^(Arguments|Options|Commands):/.test(l)) break;
    if (l.trim()) desc.push(l.trim());
  }
  return { usage: usage >= 0 ? lines[usage].replace(/^Usage:\s*/, '') : '', description: desc.join(' ') };
}

function walk(path) {
  const text = help(path);
  const { usage, description } = describe(text);
  const subs = section(text, 'Commands')
    .map((r) => r.signature.split(/\s+/)[0])
    .filter((n) => n !== 'help');
  return {
    name: path.join(' '),
    usage,
    description,
    arguments: section(text, 'Arguments'),
    options: section(text, 'Options').filter((o) => !/^-h, --help/.test(o.signature)),
    commands: subs.map((s) => walk([...path, s])),
  };
}

const root = help([]);
const top = section(root, 'Commands')
  .map((r) => r.signature.split(/\s+/)[0])
  .filter((n) => n !== 'help');

const commands = top.map((name) => walk([name]));
writeFileSync(out, JSON.stringify({ version, generatedAt: new Date().toISOString(), commands }, null, 2) + '\n');
const leaf = (c) => (c.commands.length ? c.commands.reduce((n, s) => n + leaf(s), 0) : 1);
console.log(`gen-commands: ${commands.length} commands, ${commands.reduce((n, c) => n + leaf(c), 0)} leaves, codeloop ${version}`);
