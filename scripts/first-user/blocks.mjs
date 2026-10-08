#!/usr/bin/env node
// Lifts the fenced blocks out of a docs page so first-user.sh runs the page's own commands.
//
//   node blocks.mjs extract <page.md> <outdir>
//     Writes NN.sh for every ```sh block, in page order, and NN.expect when the next fenced
//     block on the page is a ```text block (the page's own expected output). NN.meta carries
//     the line numbers. A text block that does not directly follow an sh block is prose, not
//     an expectation.
//
//   node blocks.mjs norm <file> [literal=replacement ...]
//     Prints the file normalised for comparison: ANSI stripped, ISO timestamps and dates
//     replaced, each literal (an absolute temp path, a tarball) replaced, trailing whitespace
//     and surrounding blank lines dropped.
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const [mode, file, ...rest] = process.argv.slice(2);

if (mode === 'extract') {
  const lines = readFileSync(file, 'utf-8').split('\n');
  const blocks = [];
  let open = null;
  lines.forEach((line, i) => {
    const fence = /^```(\w*)\s*$/.exec(line);
    if (!fence) { if (open) open.code.push(line); return; }
    if (open) { blocks.push({ ...open, code: open.code.join('\n') }); open = null; }
    else open = { lang: fence[1] || 'none', line: i + 1, code: [] };
  });
  mkdirSync(rest[0], { recursive: true });
  let n = 0;
  blocks.forEach((b, i) => {
    if (b.lang !== 'sh') return;
    n += 1;
    const id = String(n).padStart(2, '0');
    const next = blocks[i + 1];
    const expect = next && next.lang === 'text' ? next : undefined;
    writeFileSync(join(rest[0], `${id}.sh`), b.code + '\n');
    if (expect) writeFileSync(join(rest[0], `${id}.expect`), expect.code + '\n');
    writeFileSync(join(rest[0], `${id}.meta`), `line=${b.line}\nexpect_line=${expect ? expect.line : ''}\nfirst=${b.code.split('\n')[0]}\n`);
  });
  console.log(n);
} else if (mode === 'norm') {
  let text = readFileSync(file, 'utf-8').replace(/\u001b\[[0-9;]*m/g, '');
  for (const pair of rest) {
    const at = pair.indexOf('=');
    const literal = pair.slice(0, at);
    if (literal) text = text.split(literal).join(pair.slice(at + 1));
  }
  text = text
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, '<timestamp>')
    .replace(/\d{4}-\d{2}-\d{2}/g, '<date>')
    .replace(/\r/g, '')
    .split('\n').map(l => l.replace(/\s+$/, '')).join('\n')
    .replace(/^\n+/, '').replace(/\n+$/, '');
  process.stdout.write(text + '\n');
} else {
  console.error('usage: blocks.mjs extract <page.md> <outdir> | norm <file> [literal=replacement ...]');
  process.exit(64);
}
