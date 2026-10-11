/**
 * `codeloop check architecture`: judges the five pages the architecture skill writes
 * (.codeloop/wiki/architecture/*.md) against the seven mechanical rules the spec at
 * docs/plans/codeloop/2026-10-10-architecture-wiki.md lists. It cannot judge whether the
 * explanation is good, only that it is not invented, not bloated and not scanner leftovers.
 */
import { existsSync, readFileSync } from 'fs';
import { delimiter, join } from 'path';
import { scanMakefile, scanNpmScripts, REPO_FACTS_PATH } from './wiki-outline.js';
import { WIKI_DIR } from './wiki.js';

const MAX_PAGE_LINES = 150;
const MAX_TABLE_ROWS = 15;
const MAX_DIAGRAM_NODES = 15;

interface PageSpec {
  file: string;
  diagram?: 'flowchart' | 'sequenceDiagram' | 'erDiagram';
}

const PAGES: PageSpec[] = [
  { file: 'overview.md', diagram: 'flowchart' },
  { file: 'flows.md', diagram: 'sequenceDiagram' },
  { file: 'data-model.md', diagram: 'erDiagram' },
  { file: 'change-map.md' },
  { file: 'invariants.md' },
];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface MermaidBlock {
  kind: string;
  body: string;
}

function mermaidBlocks(text: string): MermaidBlock[] {
  const out: MermaidBlock[] = [];
  for (const m of text.matchAll(/```mermaid\r?\n([\s\S]*?)```/g)) {
    const body = m[1];
    const first = (body.split('\n').find(l => l.trim()) ?? '').trim();
    const kind = /^(flowchart|graph)\b/.test(first) ? 'flowchart' : (first.split(/\s+/)[0] ?? '');
    out.push({ kind, body });
  }
  return out;
}

/** Distinct node ids in a flowchart block: subgraph ids, and either side of an edge arrow. */
function flowchartNodeIds(body: string): Set<string> {
  const ids = new Set<string>();
  const ID = '[A-Za-z0-9_]+';
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    const sub = new RegExp(`^subgraph\\s+(${ID})`).exec(line);
    if (sub) ids.add(sub[1]);
    for (const m of line.matchAll(new RegExp(`(${ID})(?:\\[[^\\]]*\\]|\\(\\(?[^)]*\\)?\\)|\\{[^}]*\\}|>[^\\]]*\\])?\\s*(?:-{1,3}>|-\\.{1,3}->|={1,3}>|---|-\\.-)\\s*(${ID})`, 'g'))) {
      ids.add(m[1]);
      ids.add(m[2]);
    }
    const def = new RegExp(`^(${ID})(?:\\[[^\\]]*\\]|\\(\\(?[^)]*\\)?\\)|\\{[^}]*\\})`).exec(line);
    if (def) ids.add(def[1]);
  }
  return ids;
}

/** Participants named on either side of a sequence arrow, plus explicit `participant X` lines. */
function sequenceParticipants(body: string): Set<string> {
  const names = new Set<string>();
  const ID = '[A-Za-z0-9_]+';
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    const p = new RegExp(`^participant\\s+(${ID})`).exec(line);
    if (p) names.add(p[1]);
    const arrow = new RegExp(`^(${ID})\\s*-{1,2}>>?\\s*(${ID})\\s*:`).exec(line);
    if (arrow) {
      names.add(arrow[1]);
      names.add(arrow[2]);
    }
  }
  return names;
}

interface ParsedTable {
  header: string[];
  rows: string[][];
}

const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(c => c.trim());

const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function parseMarkdownTables(text: string): ParsedTable[] {
  const lines = text.split('\n');
  const tables: ParsedTable[] = [];
  let i = 0;
  while (i < lines.length) {
    if (TABLE_ROW.test(lines[i]) && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])) {
      const header = cells(lines[i]);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && TABLE_ROW.test(lines[j])) {
        rows.push(cells(lines[j]));
        j++;
      }
      tables.push({ header, rows });
      i = j;
    } else {
      i++;
    }
  }
  return tables;
}

const KNOWN_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|java|kt|rs|md|yaml|yml|json|css|html|sh|toml)$/;

/** A path token has no whitespace, is not a URL, and either has a `/` or ends in a known extension. */
function looksLikePath(token: string): boolean {
  const t = token.trim();
  if (!t || /\s/.test(t)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return false;
  if (t.startsWith('#')) return false;
  // Routes (`/api/cards/:id`), npm scopes (`@scope/pkg`), globs and placeholders name no file on disk.
  if (t.startsWith('/') || t.startsWith('@') || /[*<>{}]/.test(t)) return false;
  return t.includes('/') || KNOWN_EXT.test(t);
}

const stripLine = (p: string) => p.replace(/:\d+$/, '');

/** Every path-shaped token this page names: backticked, a `source:` value, a mermaid `click` target, or a table cell. */
function pathCandidates(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/`([^`\n]+)`/g)) out.push(m[1]);
  for (const m of text.matchAll(/\bsource:\s*(\S+)/g)) out.push(m[1]);
  for (const m of text.matchAll(/click\s+\S+\s+"([^"]+)"/g)) out.push(m[1]);
  for (const table of parseMarkdownTables(text)) for (const row of table.rows) for (const cell of row) out.push(cell.replace(/^`|`$/g, ''));
  return [...new Set(out.map(stripLine).filter(looksLikePath))];
}

function pathsInCell(cell: string): string[] {
  const token = cell.trim().replace(/^`|`$/g, '');
  return looksLikePath(stripLine(token)) ? [stripLine(token)] : [];
}

const SCANNER_COUNT = /\b\d+\s+(routes?|entities|files?|lines?|commits?|tables?|schemas?|folders?)\b/i;

function scannerLeftovers(page: string, text: string): string[] {
  const problems: string[] = [];
  for (const line of text.split('\n')) {
    if (SCANNER_COUNT.test(line)) problems.push(`${page}: scanner-style count used as a label ("${line.trim()}")`);
    if (/\bTODO\b/.test(line)) problems.push(`${page}: TODO placeholder left in ("${line.trim()}")`);
  }
  return problems;
}

function checkChangeMap(page: string, projectDir: string, text: string): string[] {
  const problems: string[] = [];
  const table = parseMarkdownTables(text).find(t => t.header.some(h => /edit/i.test(h)));
  if (!table) {
    problems.push(`${page}: no table with an "Edit" column`);
    return problems;
  }
  const editIdx = table.header.findIndex(h => /edit/i.test(h));
  if (table.rows.length < 5 || table.rows.length > 15) problems.push(`${page}: has ${table.rows.length} rows, needs 5 to 15`);
  for (const row of table.rows) {
    const [path] = pathsInCell(row[editIdx] ?? '');
    if (!path) {
      problems.push(`${page}: row "${row.join(' | ')}" names no file in its Edit column`);
      continue;
    }
    if (!existsSync(join(projectDir, path))) problems.push(`${page}: ${path} does not exist`);
  }
  return problems;
}

const INVARIANT_HEADING = /^##\s+.+$/m;

function checkInvariants(page: string, projectDir: string, text: string): string[] {
  const problems: string[] = [];
  const blocks = text.split(/\n(?=##\s)/).filter(b => INVARIANT_HEADING.test(b.split('\n')[0] ?? ''));
  if (blocks.length < 3 || blocks.length > 10) problems.push(`${page}: has ${blocks.length} invariant(s), needs 3 to 10`);
  for (const block of blocks) {
    const name = /^##\s+(.+)$/.exec(block.split('\n')[0] ?? '')?.[1]?.trim() ?? '(unnamed)';
    const enforced = /enforced by:\s*`([^`]+)`/i.exec(block)?.[1];
    const tested = /tested by:\s*`([^`]+)`/i.exec(block)?.[1];
    if (!enforced) problems.push(`${page}: "${name}" has no "enforced by:" file`);
    else if (!existsSync(join(projectDir, stripLine(enforced)))) problems.push(`${page}: "${name}" enforced-by file ${enforced} does not exist`);
    if (!tested) problems.push(`${page}: "${name}" has no "tested by:" file`);
    else if (!existsSync(join(projectDir, stripLine(tested)))) problems.push(`${page}: "${name}" tested-by file ${tested} does not exist`);
  }
  return problems;
}

// Mirrors every `program.addCommand(...)` in src/program.ts plus the one `skillCommand` added
// straight onto the program in src/index.ts. Kept as a literal list rather than importing
// program.ts: that module imports commands/check.ts, which imports this file, so a static import
// the other way would be a load-time cycle.
const CODELOOP_SUBCOMMANDS = new Set([
  'init', 'update', 'status', 'serve', 'store', 'watch',
  'lane', 'card', 'start', 'shape', 'next', 'approve', 'reject', 'inbox', 'feature', 'epic',
  'initiative', 'ask', 'answer', 'run', 'brief', 'schedule', 'adopt', 'check', 'pack', 'spec',
  'mock', 'mocks', 'artifact', 'artifacts', 'scan', 'task', 'import', 'verify', 'stats', 'wiki',
  'learn', 'render', 'mcp', 'gate', 'config', 'cloud', 'guard', 'presence', 'whoami',
  'install', 'search', 'list', 'remove', 'publish', 'login', 'skill',
]);

function hasNpmScript(projectDir: string, name: string | undefined): boolean {
  return !!name && scanNpmScripts(projectDir).some(s => s.name === name);
}

function hasMakeTarget(projectDir: string, name: string | undefined): boolean {
  return !!name && scanMakefile(projectDir).some(t => t.name === name);
}

/** A `which`-like lookup, from disk against `process.env.PATH`, so no subprocess is spawned to judge a command. */
function onPath(bin: string): boolean {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const exts = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : [''];
  return dirs.some(dir => exts.some(ext => existsSync(join(dir, `${bin}${ext}`))));
}

/**
 * True when `cmd` is a real thing to run: a `codeloop` subcommand, `npm run`/`pnpm`/`yarn` against a
 * script that exists in package.json, a `make` target that exists in the Makefile, `node`/`bash`/`sh`
 * against a file that exists, or a binary findable on PATH. This is what rule 8 holds every
 * backticked command in `start-here.md` and `runbooks/commands.md` to.
 */
function isRealCommand(projectDir: string, cmd: string): boolean {
  const tokens = cmd.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const [bin, ...rest] = tokens;
  if (bin === 'codeloop') return tokens.length === 1 || CODELOOP_SUBCOMMANDS.has(rest[0]) || rest[0].startsWith('-');
  if (bin === 'npm') return hasNpmScript(projectDir, rest[0] === 'run' ? rest[1] : rest[0]); // `npm test`/`npm start` are real npm aliases for `npm run test`/`npm run start`
  if (bin === 'pnpm' || bin === 'yarn') return hasNpmScript(projectDir, rest[0] === 'run' ? rest[1] : rest[0]);
  if (bin === 'make') return hasMakeTarget(projectDir, rest[0]);
  if (bin === 'node' || bin === 'bash' || bin === 'sh' || bin === 'python' || bin === 'python3') return rest[0] !== undefined && existsSync(join(projectDir, rest[0]));
  return onPath(bin);
}

/** Every npm script and make target this repo has, each either named in `text` or covered by a "Left out:" line. */
function checkCommandsCoverage(page: string, projectDir: string, text: string): string[] {
  const problems: string[] = [];
  const named = [...scanNpmScripts(projectDir).map(s => `npm run ${s.name}`), ...scanMakefile(projectDir).map(t => `make ${t.name}`)];
  for (const cmd of named) {
    const bareName = cmd.split(' ').pop()!;
    const mentioned = text.includes(cmd) || text.includes(bareName);
    const leftOut = new RegExp(`left out[^\\n]*${escapeRegExp(bareName)}`, 'i').test(text);
    if (!mentioned && !leftOut) problems.push(`${page}: "${cmd}" is not named, and has no "left out" line`);
  }
  return problems;
}

/** Rule 8: start-here.md and runbooks/commands.md exist, every backticked command they show is real, and commands.md accounts for every script and make target. Paths in backticks (anything `looksLikePath` would flag) are not judged as commands. */
function checkCommandPages(projectDir: string): string[] {
  const problems: string[] = [];
  const pages: { label: string; rel: string; checkCoverage?: boolean }[] = [
    { label: 'start-here.md', rel: `${WIKI_DIR}/start-here.md` },
    { label: 'runbooks/commands.md', rel: `${WIKI_DIR}/runbooks/commands.md`, checkCoverage: true },
  ];
  for (const page of pages) {
    const full = join(projectDir, page.rel);
    if (!existsSync(full)) {
      problems.push(`${page.label}: missing (expected at ${page.rel})`);
      continue;
    }
    const text = readFileSync(full, 'utf-8');
    if (!text.trim()) {
      problems.push(`${page.label}: is empty`);
      continue;
    }
    for (const m of text.matchAll(/`([^`\n]+)`/g)) {
      const cmd = m[1];
      if (looksLikePath(stripLine(cmd))) continue;
      if (!isRealCommand(projectDir, cmd)) problems.push(`${page.label}: command \`${cmd}\` is not a real binary, npm script, make target or codeloop subcommand`);
    }
    if (page.checkCoverage) problems.push(...checkCommandsCoverage(page.label, projectDir, text));
  }
  return problems;
}

export interface ArchitectureCheckOptions {
  /** The wiki's architecture folder, relative to the project root. Default `.codeloop/wiki/architecture`. */
  dir?: string;
}

/** One line per failing rule, in the form `<page>: <problem>`. Empty when the pages pass. */
export function checkArchitecture(projectDir: string, opts: ArchitectureCheckOptions = {}): string[] {
  const dir = opts.dir ?? `${WIKI_DIR}/architecture`;
  const problems: string[] = [];
  const texts = new Map<string, string>();

  // Rule 1: all five pages exist, non-empty, each with a mermaid block of the kind its role needs.
  for (const page of PAGES) {
    const rel = `${dir}/${page.file}`;
    const full = join(projectDir, rel);
    if (!existsSync(full)) {
      problems.push(`${page.file}: missing (expected at ${rel})`);
      continue;
    }
    const text = readFileSync(full, 'utf-8');
    if (!text.trim()) {
      problems.push(`${page.file}: is empty`);
      continue;
    }
    texts.set(page.file, text);
    if (page.diagram) {
      const has = mermaidBlocks(text).some(b => b.kind === page.diagram);
      if (!has) problems.push(`${page.file}: no mermaid ${page.diagram} block`);
    }
  }

  // Rule 2: every path a page names exists on disk.
  for (const [page, text] of texts) {
    for (const path of pathCandidates(text)) {
      if (!existsSync(join(projectDir, path))) problems.push(`${page}: names a path that does not exist: ${path}`);
    }
  }

  // Rule 3: every top-level source folder from the facts appears in overview.md, or is left out with a reason.
  const overview = texts.get('overview.md');
  const factsFile = join(projectDir, REPO_FACTS_PATH);
  if (overview && existsSync(factsFile)) {
    try {
      const folders: string[] = JSON.parse(readFileSync(factsFile, 'utf-8')).topFolders ?? [];
      for (const folder of folders) {
        const mentioned = overview.includes(folder);
        const leftOut = new RegExp(`left out[^\\n]*${escapeRegExp(folder)}`, 'i').test(overview);
        if (!mentioned && !leftOut) problems.push(`overview.md: top-level folder "${folder}" is not named, and has no "left out" line`);
      }
    } catch {
      problems.push(`overview.md: ${REPO_FACTS_PATH} is not valid JSON`);
    }
  }

  // Rule 4: noise limits, 150 lines a page, 15 rows a table, 15 nodes a flowchart diagram.
  for (const [page, text] of texts) {
    const lineCount = text.split('\n').length;
    if (lineCount > MAX_PAGE_LINES) problems.push(`${page}: has ${lineCount} lines, the limit is ${MAX_PAGE_LINES}`);
    for (const table of parseMarkdownTables(text)) {
      if (table.rows.length > MAX_TABLE_ROWS) problems.push(`${page}: a table has ${table.rows.length} rows, the limit is ${MAX_TABLE_ROWS}`);
    }
    for (const block of mermaidBlocks(text)) {
      if (block.kind !== 'flowchart') continue;
      const nodes = flowchartNodeIds(block.body);
      if (nodes.size > MAX_DIAGRAM_NODES) problems.push(`${page}: a flowchart diagram has ${nodes.size} nodes, the limit is ${MAX_DIAGRAM_NODES}`);
    }
  }

  // Rule 5: sequence participants in flows.md are named in overview.md.
  const flows = texts.get('flows.md');
  if (flows && overview) {
    const participants = new Set<string>();
    for (const block of mermaidBlocks(flows)) if (block.kind === 'sequenceDiagram') for (const p of sequenceParticipants(block.body)) participants.add(p);
    for (const p of participants) if (!overview.includes(p)) problems.push(`flows.md: participant "${p}" is not named in overview.md`);
  }

  // Rule 6: every change-map row and every invariant names a file (and, for invariants, a test file) that exists.
  const changeMap = texts.get('change-map.md');
  if (changeMap) problems.push(...checkChangeMap('change-map.md', projectDir, changeMap));
  const invariants = texts.get('invariants.md');
  if (invariants) problems.push(...checkInvariants('invariants.md', projectDir, invariants));

  // Rule 7: no scanner leftovers.
  for (const [page, text] of texts) problems.push(...scannerLeftovers(page, text));

  // Rule 8 (docs/plans/codeloop/2026-10-10-wiki-schema.md): start-here.md and runbooks/commands.md.
  problems.push(...checkCommandPages(projectDir));

  return problems;
}
