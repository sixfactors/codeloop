import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { stringify } from 'yaml';
import { CLOUD_COPY, writeCloudWikiPage } from './cloud.js';
import { loadConfig } from './config.js';
import { RefusalError } from './engine.js';
import { globMatches } from './glob.js';
import { clock } from './clock.js';
import { withLock } from './lock.js';
import { parseFrontmatter } from './skills.js';
import { slugify } from './spec.js';
import { NEAR_PAGE, enforceRule, samePage, titleSimilarity } from './wiki-rules.js';
import { readCards } from './cards.js';

import { WIKI_DIR } from './wiki-dir.js';
export { WIKI_DIR };
const KINDS = { gotcha: 'gotchas', decision: 'decisions', concept: 'concepts' } as const;
export type Kind = keyof typeof KINDS;
const STALE_DAYS = 90;

export interface Page {
  path: string; // relative to the project
  kind: Kind;
  title: string;
  scope: string[];
  freq: number;
  severity: 'warning' | 'critical';
  cards: string[];
  updated: string;
  promoted?: boolean;
  body: string;
}

export function listPages(projectDir: string): Page[] {
  const pages: Page[] = [];
  for (const [kind, folder] of Object.entries(KINDS) as [Kind, string][]) {
    const dir = join(projectDir, WIKI_DIR, folder);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter(f => f.endsWith('.md') && !f.endsWith(CLOUD_COPY)).sort()) {
      const { data, body } = parseFrontmatter(readFileSync(join(dir, file), 'utf-8'));
      pages.push({
        path: `${WIKI_DIR}/${folder}/${file}`,
        kind,
        title: String(data.title ?? file.replace(/\.md$/, '')),
        scope: (data.scope as string[]) ?? [],
        freq: Number(data.freq ?? 1),
        severity: data.severity === 'critical' ? 'critical' : 'warning',
        cards: (data.cards as string[]) ?? [],
        updated: String(data.updated ?? ''),
        ...(data.promoted ? { promoted: true } : {}),
        body: body.trim(),
      });
    }
  }
  return pages;
}

/** Pages that changed here and in the cloud: the local file and the cloud version written beside it, waiting for a merge. */
export function cloudCopies(projectDir: string): { path: string; cloud: string }[] {
  return [...Object.values(KINDS), 'competitors'].flatMap(folder => {
    const dir = join(projectDir, WIKI_DIR, folder);
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter(f => f.endsWith(CLOUD_COPY)).sort().map(f => ({ path: `${WIKI_DIR}/${folder}/${f.slice(0, -CLOUD_COPY.length)}.md`, cloud: `${WIKI_DIR}/${folder}/${f}` }));
  });
}

function writePage(projectDir: string, page: Page): void {
  const { path, kind: _kind, body, ...frontmatter } = page;
  mkdirSync(dirname(join(projectDir, path)), { recursive: true });
  writeFileSync(join(projectDir, path), `---\n${stringify(frontmatter)}---\n\n${body}\n`);
}

/**
 * The one wiki shape codeloop owns (docs/plans/codeloop/2026-10-10-wiki-schema.md): every section a
 * person sees in the nav, in the order the home page and sidebar render them. A user adds a section
 * only by naming it in `wiki.sections` in `.codeloop/config.yaml` (see `configSections`); nothing
 * else creates a new top-level folder. `folder` names a folder under `WIKI_DIR` that holds many
 * pages; `file` names the one file a single-page section is. `reference/` is always last: it is
 * scanner output, rendered collapsed at the bottom.
 */
export interface WikiShapeSection {
  id: string;
  folder?: string;
  file?: string;
  title: string;
  holds: string;
  writtenBy: string;
  /** Every current section hides from the nav while empty; this names that it does, for callers that render the shape. */
  visible: true;
}

export const WIKI_SHAPE: WikiShapeSection[] = [
  { id: 'start-here', file: 'start-here.md', title: 'Start here', holds: 'What is this, how do I run it, the three real common tasks', writtenBy: '`codeloop wiki build`, the architecture skill, checked', visible: true },
  { id: 'architecture', folder: 'architecture', title: 'How it works', holds: 'The five pages: overview, flows, data model, change map, invariants', writtenBy: '`codeloop wiki build`, the architecture skill, checked', visible: true },
  { id: 'gotchas', folder: 'gotchas', title: 'What bites', holds: 'Mistakes, scoped to files', writtenBy: '`wiki capture`; the Stop hook; agents', visible: true },
  { id: 'decisions', folder: 'decisions', title: 'Why', holds: 'Why it is built this way', writtenBy: 'The research stage on pass; `wiki capture --kind decision`', visible: true },
  { id: 'runbooks', folder: 'runbooks', title: 'Commands', holds: 'Every script and make target: what it is for, when to run it', writtenBy: '`codeloop wiki build`, the architecture skill, checked', visible: true },
  { id: 'competitors', folder: 'competitors', title: 'Competitors', holds: 'Only when the user added one', writtenBy: '`wiki competitor add`', visible: true },
  { id: 'reference', folder: 'reference', title: 'Reference', holds: 'Scanner output, generated, collapsed at the bottom', writtenBy: '`wiki init --from-repo`, `codeloop wiki build`', visible: true },
];

/**
 * The board's own planning records: hidden from the wiki nav, because the board draws them
 * (Initiatives and Roadmap screens), not the wiki. `numbers/` is the one exception that is not
 * always hidden: it stays hidden only while empty, and shows once the analyze workflow writes a
 * page with real data into it.
 */
export interface HiddenStorageFolder {
  folder: string;
  alwaysHidden: boolean;
}

export const hiddenStorageFolders: HiddenStorageFolder[] = [
  { folder: 'initiatives', alwaysHidden: true },
  { folder: 'epics', alwaysHidden: true },
  { folder: 'features', alwaysHidden: true },
  { folder: 'cards', alwaysHidden: true },
  { folder: 'numbers', alwaysHidden: false },
];

export interface WikiConfigSection {
  folder: string;
  title: string;
  holds?: string;
}

/** `wiki.sections` from `.codeloop/config.yaml`: the only way a user adds a section to the shape. Malformed entries (no folder or no title) are dropped, not refused, so one bad entry does not break every wiki read. */
export function configSections(projectDir: string): WikiConfigSection[] {
  const sections = loadConfig(projectDir).wiki?.sections;
  if (!Array.isArray(sections)) return [];
  return sections
    .filter((s: unknown): s is { folder: string; title: string; holds?: string } => !!s && typeof s === 'object' && typeof (s as { folder?: unknown }).folder === 'string' && typeof (s as { title?: unknown }).title === 'string')
    .map(s => ({ folder: s.folder.replace(/\/+$/, ''), title: s.title, ...(s.holds ? { holds: String(s.holds) } : {}) }));
}

/** Every `.md` file under `WIKI_DIR`, wherever it sits, with its raw text. Pages, not the KINDS-only `listPages`: lint and migrate must see every folder, not just gotchas/decisions/concepts. */
function walkWikiPages(projectDir: string): { path: string; body: string }[] {
  const root = join(projectDir, WIKI_DIR);
  if (!existsSync(root)) return [];
  const out: { path: string; body: string }[] = [];
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(cur, e.name);
      if (e.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!e.name.endsWith('.md') || e.name.endsWith(CLOUD_COPY)) continue;
      out.push({ path: relative(projectDir, full).split('\\').join('/'), body: readFileSync(full, 'utf-8') });
    }
  }
  return out;
}

const SCANNER_OVERVIEW_MARK = '## Three most common things';

/**
 * True for a page the scanner seeds, not a person: an `assumption:`/`no-data:` line (the scanner's
 * own hedge for a fact it could not ground), the generated glossary, the scanner's own
 * `product/overview.md`, or a per-script runbook (anything under `runbooks/` other than
 * `commands.md`, which the architecture skill writes and owns).
 */
export function isFillerPage(path: string, body: string): boolean {
  if (/^assumption:/m.test(body) || /^no-data:/m.test(body)) return true;
  if (path === `${WIKI_DIR}/glossary.md`) return true;
  if (path === `${WIKI_DIR}/product/overview.md` && body.includes(SCANNER_OVERVIEW_MARK)) return true;
  if (path.startsWith(`${WIKI_DIR}/runbooks/`) && path !== `${WIKI_DIR}/runbooks/commands.md`) return true;
  return false;
}

export interface MigrateMove {
  from: string;
  to: string;
}

export interface MigrateResult {
  moved: MigrateMove[];
  dryRun: boolean;
}

/**
 * `codeloop wiki migrate`: moves scanner filler into `reference/legacy/<same path>`, preserving it
 * rather than deleting it. `wiki build` runs this first (services.ts `buildWiki`), so filler from an
 * older scanner never survives a refresh. A page already under `reference/legacy/` is left alone:
 * it has already been migrated, and re-matching `isFillerPage` on it would move it again, into
 * itself, on every run.
 */
export function migrateWikiFiller(projectDir: string, opts: { dryRun?: boolean } = {}): MigrateResult {
  const moved: MigrateMove[] = [];
  for (const { path, body } of walkWikiPages(projectDir)) {
    // reference/ is the scanner's own space; its pages may carry assumption lines by design.
    if (path.startsWith(`${WIKI_DIR}/reference/`)) continue;
    if (!isFillerPage(path, body)) continue;
    const rel = path.slice(`${WIKI_DIR}/`.length);
    const to = `${WIKI_DIR}/reference/legacy/${rel}`;
    moved.push({ from: path, to });
    if (!opts.dryRun) {
      const dest = join(projectDir, to);
      mkdirSync(dirname(dest), { recursive: true });
      renameSync(join(projectDir, path), dest);
    }
  }
  if (moved.length && !opts.dryRun) writeIndex(projectDir);
  return { moved, dryRun: !!opts.dryRun };
}

export interface WikiShapeCount {
  id: string;
  title: string;
  holds: string;
  writtenBy: string;
  count: number;
  /** Rendered closed by default, at the bottom of the nav. Only `reference` sets this. */
  collapsed?: boolean;
  fromConfig?: boolean;
}

/**
 * The shape with page counts, for the wiki home and sidebar: every section in spec order, with
 * config-declared sections folded in before `reference`, and every empty section left out. This is
 * the one place that counts pages per folder, so the UI renders what the server computed instead of
 * grouping the raw page list itself.
 */
export function wikiShape(projectDir: string): WikiShapeCount[] {
  const pages = walkWikiPages(projectDir);
  const countOf = (folder?: string, file?: string): number => {
    if (file) return existsSync(join(projectDir, WIKI_DIR, file)) ? 1 : 0;
    if (!folder) return 0;
    const prefix = `${WIKI_DIR}/${folder}/`;
    return pages.filter(p => p.path.startsWith(prefix)).length;
  };
  const out: WikiShapeCount[] = [];
  for (const s of WIKI_SHAPE) {
    if (s.id === 'reference') continue; // placed last, below
    const count = countOf(s.folder, s.file);
    if (count) out.push({ id: s.id, title: s.title, holds: s.holds, writtenBy: s.writtenBy, count });
  }
  for (const s of configSections(projectDir)) {
    const count = countOf(s.folder);
    if (count) out.push({ id: s.folder, title: s.title, holds: s.holds ?? '', writtenBy: 'config: wiki.sections', count, fromConfig: true });
  }
  // numbers/ is otherwise-hidden storage (hiddenStorageFolders), but it shows once the analyze
  // workflow has written a page into it: a metric with no reader is worse than one more tile.
  const numbersCount = countOf('numbers');
  if (numbersCount) out.push({ id: 'numbers', title: 'Numbers', holds: 'The metrics the workflows name', writtenBy: 'The analyze workflow', count: numbersCount });
  const reference = WIKI_SHAPE.find(s => s.id === 'reference')!;
  const refCount = countOf(reference.folder);
  if (refCount) out.push({ id: reference.id, title: reference.title, holds: reference.holds, writtenBy: reference.writtenBy, count: refCount, collapsed: true });
  return out;
}

/** Raw pages under one wiki folder, for a stage brief whose skill names the folder in its inputs. */
export function folderPages(projectDir: string, folder: string): { path: string; title: string; body: string }[] {
  const dir = join(projectDir, WIKI_DIR, folder);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith('.md') && !f.endsWith(CLOUD_COPY) && f !== 'README.md')
    .sort()
    .map(f => {
      const { data, body } = parseFrontmatter(readFileSync(join(dir, f), 'utf-8'));
      const heading = /^#\s+(.+)$/m.exec(body)?.[1];
      return { path: `${WIKI_DIR}/${folder}/${f}`, title: String(data.title ?? heading ?? f.replace(/\.md$/, '')), body: body.trim() };
    });
}

function writeIndex(projectDir: string): void {
  const pages = listPages(projectDir);
  const lines = [
    '# Wiki',
    '',
    'Generated by `codeloop wiki capture`. A stage brief carries the pages whose `scope` matches the files in play, plus the folders the stage skill names in its `inputs:`. `codeloop wiki inject --files <paths>` prints the first set.',
    '',
    '## Topics',
    '',
    '| Folder | What goes there | Written by |',
    '|---|---|---|',
    ...WIKI_SHAPE.map(t => `| \`${t.folder ? `${t.folder}/` : t.file}\` | ${t.holds} | ${t.writtenBy} |`),
    '',
  ];
  for (const [kind, folder] of Object.entries(KINDS)) {
    lines.push(`## ${folder[0].toUpperCase()}${folder.slice(1)}`, '');
    const mine = pages.filter(p => p.kind === kind);
    if (mine.length === 0) lines.push('None yet.');
    for (const p of mine) lines.push(`- [${p.title}](${relative(WIKI_DIR, p.path)}): freq ${p.freq}, ${p.severity}, scope ${p.scope.join(', ') || 'none'}`);
    lines.push('');
  }
  mkdirSync(join(projectDir, WIKI_DIR), { recursive: true });
  writeFileSync(join(projectDir, WIKI_DIR, 'INDEX.md'), lines.join('\n'));
}

/**
 * Create the wiki folder tree and INDEX.md for a new project. Does not overwrite an existing
 * INDEX.md. Returns the paths that were created.
 */
export function seedWiki(projectDir: string): string[] {
  const created: string[] = [];
  const root = join(projectDir, WIKI_DIR);
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true });
    created.push(WIKI_DIR);
  }
  for (const section of WIKI_SHAPE) {
    if (!section.folder) continue;
    const dir = join(root, section.folder);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      created.push(`${WIKI_DIR}/${section.folder}/`);
    }
  }
  for (const { folder } of hiddenStorageFolders) {
    const dir = join(root, folder);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      created.push(`${WIKI_DIR}/${folder}/`);
    }
  }
  const index = join(root, 'INDEX.md');
  if (!existsSync(index)) {
    writeIndex(projectDir);
    created.push(`${WIKI_DIR}/INDEX.md`);
  }
  return created;
}

export function thresholds(projectDir: string): { critical: number; promote: number } {
  const config = loadConfig(projectDir);
  return { critical: config.codeloop?.critical_frequency ?? 3, promote: config.codeloop?.promote_frequency ?? 10 };
}

/**
 * A page must pass its folder's rule (wiki-rules.ts). A title that already exists, or a near-duplicate in
 * the same folder (`samePage`), is the same lesson met again: its frequency goes up, the card is added
 * and a dated note appended, instead of a second page.
 */
export function capture(
  projectDir: string,
  input: { title: string; scope: string[]; body: string; kind?: Kind; card?: string },
  now: Date = clock(),
): Page {
  const kind = input.kind ?? 'gotcha';
  if (!KINDS[kind]) throw new RefusalError(`unknown kind "${kind}" (gotcha, decision or concept)`);
  if (!slugify(input.title)) throw new RefusalError(`wiki title "${input.title}" has no letters or digits to name its file with`);
  enforceRule(kind, input, input.card ? cardTitle(projectDir, input.card) : undefined);
  // A second capture of the same title reads the page, raises its frequency and writes it back.
  return withLock(join(projectDir, WIKI_DIR, 'INDEX.md'), () => captureLocked(projectDir, input, kind, now));
}

function captureLocked(projectDir: string, input: { title: string; scope: string[]; body: string; card?: string }, kind: Kind, now: Date): Page {
  const today = now.toISOString().slice(0, 10);
  const pages = listPages(projectDir);
  const existing = pages.find(p => p.title.toLowerCase() === input.title.toLowerCase()) ?? pages.find(p => p.kind === kind && samePage(p, input));
  const page: Page = existing
    ? {
        ...existing,
        freq: existing.freq + 1,
        scope: [...new Set([...existing.scope, ...input.scope])],
        cards: [...new Set([...existing.cards, ...(input.card ? [input.card] : [])])],
        updated: today,
        body: withNote(existing.body, today, input.card, input.body),
      }
    : {
        path: `${WIKI_DIR}/${KINDS[kind]}/${slugify(input.title)}.md`,
        kind,
        title: input.title,
        scope: input.scope,
        freq: 1,
        severity: 'warning',
        cards: input.card ? [input.card] : [],
        updated: today,
        body: input.body.trim(),
      };
  if (page.freq >= thresholds(projectDir).critical) page.severity = 'critical';
  writePage(projectDir, page);
  writeIndex(projectDir);
  writeCloudWikiPage(projectDir, page.path);
  return page;
}

function cardTitle(projectDir: string, id: string): string | undefined {
  try {
    return readCards(projectDir).cards.find(c => c.id === id)?.title;
  } catch {
    return undefined;
  }
}

// The new capture's first line, dated, under `## Notes`: the page records each time it was met.
function withNote(body: string, today: string, card: string | undefined, text: string): string {
  const line = text.split('\n').map(l => l.trim()).find(Boolean) ?? '';
  const head = /^## Notes\s*$/m.test(body) ? body : `${body}\n\n## Notes\n`;
  return `${head}\n- ${today}${card ? ` (${card})` : ''}: ${line}`;
}

/** Folds page `b` into page `a`: frequencies add, cards and scope join, b's body is kept under a heading, b is removed. */
export function mergePages(projectDir: string, a: string, b: string, now: Date = clock()): Page {
  return withLock(join(projectDir, WIKI_DIR, 'INDEX.md'), () => {
    const pages = listPages(projectDir);
    const find = (ref: string) => pages.find(p => p.path === ref || p.path.endsWith(`/${ref}`) || p.path.endsWith(`/${ref}.md`));
    const into = find(a);
    const from = find(b);
    if (!into || !from) throw new RefusalError(`no wiki page ${!into ? a : b}`);
    if (into.path === from.path) throw new RefusalError('a page cannot be merged into itself');
    const page: Page = {
      ...into,
      freq: into.freq + from.freq,
      cards: [...new Set([...into.cards, ...from.cards])],
      scope: [...new Set([...into.scope, ...from.scope])],
      updated: now.toISOString().slice(0, 10),
      body: `${into.body}\n\n## Merged from ${from.title}\n\n${from.body}`,
    };
    if (page.freq >= thresholds(projectDir).critical) page.severity = 'critical';
    writePage(projectDir, page);
    rmSync(join(projectDir, from.path));
    writeIndex(projectDir);
    return page;
  });
}

export function inject(projectDir: string, files: string[]): Page[] {
  const paths = files.map(f => relative(projectDir, resolve(projectDir, f)));
  return listPages(projectDir).filter(p => p.scope.some(glob => paths.some(path => globMatches(glob, path))));
}

/** Applies the frequency thresholds: critical at `critical_frequency`, copied into rules.md once at `promote_frequency`. */
export function learn(projectDir: string): { critical: string[]; promoted: string[] } {
  const { critical, promote } = thresholds(projectDir);
  const result = { critical: [] as string[], promoted: [] as string[] };
  for (const page of listPages(projectDir)) {
    let changed = false;
    if (page.freq >= critical && page.severity !== 'critical') {
      page.severity = 'critical';
      result.critical.push(page.title);
      changed = true;
    }
    if (page.freq >= promote && !page.promoted) {
      const rules = join(projectDir, '.codeloop/rules.md');
      const current = existsSync(rules) ? readFileSync(rules, 'utf-8') : '# Rules\n';
      writeFileSync(rules, `${current.trimEnd()}\n\n## ${page.title}\n\nPromoted from ${page.path} at freq ${page.freq}. Scope: ${page.scope.join(', ') || 'all'}.\n\n${page.body}\n`);
      page.promoted = true;
      result.promoted.push(page.title);
      changed = true;
    }
    if (changed) writePage(projectDir, page);
  }
  if (result.critical.length || result.promoted.length) writeIndex(projectDir);
  return result;
}

export interface LintResult {
  broken: string[];
  stale: string[];
  duplicates: string[];
  /** A page in a folder that is neither in WIKI_SHAPE, a hidden storage folder, nor a `wiki.sections` entry. Exit 1, like `broken`. */
  unknownFolder: string[];
  /** A page still carrying scanner filler (see `isFillerPage`), reported but not refused: `wiki migrate` is the fix, not a hand edit. */
  filler: string[];
  /** Two pages in one folder whose titles are close but were not merged on capture; `wiki merge` folds them. */
  nearDuplicates: string[];
}

export function lintWiki(projectDir: string, now: Date = clock()): LintResult {
  const pages = listPages(projectDir);
  const broken: string[] = [];
  const files = [...pages.map(p => ({ path: p.path, text: p.body })), { path: `${WIKI_DIR}/INDEX.md`, text: existsSync(join(projectDir, WIKI_DIR, 'INDEX.md')) ? readFileSync(join(projectDir, WIKI_DIR, 'INDEX.md'), 'utf-8') : '' }];
  for (const file of files) {
    for (const m of file.text.matchAll(/\[[^\]]*\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      if (/^[a-z]+:/i.test(m[1])) continue;
      if (!existsSync(resolve(projectDir, dirname(file.path), m[1]))) broken.push(`${file.path}: link to ${m[1]} does not resolve`);
    }
  }
  const cutoff = new Date(now.getTime() - STALE_DAYS * 86_400_000).toISOString().slice(0, 10);
  const stale = pages.filter(p => p.updated && p.updated < cutoff).map(p => `${p.path}: last updated ${p.updated}, over ${STALE_DAYS} days ago`);
  const titles = pages.map(p => p.title.toLowerCase());
  const duplicates = pages.filter((p, i) => titles.indexOf(p.title.toLowerCase()) !== i).map(p => `${p.path}: duplicate title "${p.title}"`);

  const known = new Set<string>([...WIKI_SHAPE.flatMap(s => (s.folder ? [s.folder] : [])), ...hiddenStorageFolders.map(f => f.folder), ...configSections(projectDir).map(s => s.folder)]);
  const unknownFolder: string[] = [];
  const filler: string[] = [];
  for (const { path, body } of walkWikiPages(projectDir)) {
    if (path === `${WIKI_DIR}/INDEX.md`) continue;
    const rel = path.slice(`${WIKI_DIR}/`.length);
    const top = rel.split('/')[0];
    if (rel.includes('/') && !known.has(top)) {
      unknownFolder.push(`${path}: folder "${top}" is not part of the wiki shape; add it to wiki.sections in .codeloop/config.yaml, or move the page`);
    }
    // reference/ is the scanner's own space; its pages may carry assumption lines by design.
    if (path.startsWith(`${WIKI_DIR}/reference/`)) continue; // already migrated; filler there is intentional, not a problem to report again
    if (isFillerPage(path, body)) filler.push(`${path}: still has scanner filler; run \`codeloop wiki migrate\``);
  }
  const nearDuplicates: string[] = [];
  const short = (p: Page) => p.path.split('/').pop()!.replace(/\.md$/, '');
  pages.forEach((p, i) => {
    for (const q of pages.slice(i + 1)) {
      if (p.kind === q.kind && p.title.toLowerCase() !== q.title.toLowerCase() && titleSimilarity(p.title, q.title) >= NEAR_PAGE) {
        nearDuplicates.push(`${p.path} and ${q.path} look like the same page; fold them with \`codeloop wiki merge ${short(p)} ${short(q)}\``);
      }
    }
  });
  return { broken, stale, duplicates, unknownFolder, filler, nearDuplicates };
}

/** Critical pages whose scope matches the files and that were not acknowledged by title. */
export function blockingGotchas(projectDir: string, files: string[], acked: string[]): Page[] {
  const ack = new Set(acked.map(t => t.toLowerCase()));
  return inject(projectDir, files).filter(p => p.severity === 'critical' && !ack.has(p.title.toLowerCase()));
}
