import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { findCard, findCardOrNone, readCards, RefusalError, safeName } from './cards.js';
import { loadConfig } from './config.js';
import { slugify } from './spec.js';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ARTIFACTS_DIR = 'docs/artifacts';
export const ARTIFACT_KINDS = ['mock', 'system-design', 'workflow'] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/** The frontmatter field each kind is identified by, named in the goal: screens/components/states
 *  for a mock, scope/components/environments for a system design, actors/entities/flows for a
 *  workflow. */
const KIND_FIELDS: Record<ArtifactKind, [string, string, string]> = {
  mock: ['screens', 'components', 'states'],
  'system-design': ['scope', 'components', 'environments'],
  workflow: ['actors', 'entities', 'flows'],
};

const MARKER = (kind: ArtifactKind) => `<!-- codeloop-artifact-template: ${kind} 1 -->`;
const LINEAGE = /<!-- codeloop artifact lineage: ([^>]*?) -->/;
const FRONTMATTER = /<!-- codeloop-artifact\n([\s\S]*?)\n-->/;
const BASE_CSS_MARKER = '/* codeloop-artifact-base-css */';
const COLOUR = /(?<![&\w]|href=["'])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g;
const MERMAID_BLOCK = /<pre class=["']mermaid["']>([\s\S]*?)<\/pre>/g;
const KNOWN_DIAGRAMS = ['flowchart', 'graph', 'sequenceDiagram', 'stateDiagram-v2', 'stateDiagram', 'erDiagram', 'classDiagram', 'gantt', 'pie', 'journey', 'mindmap'];
// A screen-group is always a <section> (never a nested <div>), so a lazy match to the first
// </section> is safe: sections do not nest inside one another in these templates.
const SCREEN_GROUP = /<section\b[^>]*\sdata-(?:screen|flow)=["']([^"']*)["'][^>]*>([\s\S]*?)<\/section>/g;

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const templateText = (kind: ArtifactKind) => readFileSync(join(PACKAGE_ROOT, `templates/artifacts/${kind}/template.html`), 'utf-8');
const baseCss = () => readFileSync(join(PACKAGE_ROOT, 'templates/artifacts/base.css'), 'utf-8');

function projectName(projectDir: string): string {
  return slugify(String(loadConfig(projectDir).project?.name ?? '')) || slugify(basename(projectDir)) || 'project';
}

const dirs = (path: string) => (existsSync(path) ? readdirSync(path).filter(d => statSync(join(path, d)).isDirectory()).sort() : []);

/** Every artifact file under docs/artifacts, newest-scan order not guaranteed, callers sort. */
function allArtifactFiles(projectDir: string): { project: string; topic: string; file: string; full: string }[] {
  const root = join(projectDir, ARTIFACTS_DIR);
  return dirs(root).flatMap(project =>
    dirs(join(root, project)).flatMap(topic =>
      (existsSync(join(root, project, topic)) ? readdirSync(join(root, project, topic)) : [])
        .filter(f => f.endsWith('.html'))
        .map(file => ({ project, topic, file, full: join(root, project, topic, file) })),
    ),
  );
}

/** The card's artifact of this kind, wherever its project/topic folder puts it. */
export function findArtifact(projectDir: string, cardId: string, kind?: ArtifactKind): string | undefined {
  const suffix = kind ? `-${kind}.html` : undefined;
  const match = allArtifactFiles(projectDir).find(a => (suffix ? a.file === `${cardId}${suffix}` : new RegExp(`^${cardId}-(?:${ARTIFACT_KINDS.join('|')})\\.html$`).test(a.file)));
  return match && `${ARTIFACTS_DIR}/${match.project}/${match.topic}/${match.file}`;
}

/** The chain an artifact was copied along, this artifact first and `base` last. */
export function artifactLineage(html: string): string[] {
  return (LINEAGE.exec(html)?.[1] ?? '').split('<-').map(s => s.trim()).filter(Boolean);
}

/** The frontmatter block's three list fields for this kind, in the fixed order KIND_FIELDS names. */
export function artifactFrontmatter(html: string, kind: ArtifactKind): Record<string, string[]> {
  const body = FRONTMATTER.exec(html)?.[1] ?? '';
  const [a, b, c] = KIND_FIELDS[kind];
  const field = (key: string) => {
    const line = body.split('\n').find(l => l.startsWith(`${key}:`));
    if (!line) return [];
    const inline = line.slice(key.length + 1).trim();
    return inline.replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean);
  };
  return { [a]: field(a), [b]: field(b), [c]: field(c) };
}

function latestArtifact(projectDir: string, project: string, topic: string, kind: ArtifactKind, except: string): string | undefined {
  const folder = join(projectDir, ARTIFACTS_DIR, project, topic);
  if (!existsSync(folder)) return undefined;
  const newest = readdirSync(folder)
    .filter(f => f.endsWith(`-${kind}.html`) && f !== `${except}-${kind}.html`)
    .map(f => ({ f, at: statSync(join(folder, f)).mtimeMs }))
    .sort((a, b) => b.at - a.at)[0];
  return newest && `${ARTIFACTS_DIR}/${project}/${topic}/${newest.f}`;
}

/**
 * Creates the card's artifact of the given kind. Builds on the newest artifact of the same kind
 * in the same project/topic by default; `from` names another card's artifact of the same kind, or
 * `none` for the bare template. An artifact that exists is never overwritten.
 */
export function newArtifact(projectDir: string, ref: string, topic: string, kind: ArtifactKind, from: string = 'latest'): { path: string; created: boolean; from?: string } {
  const { cards } = readCards(projectDir);
  const card = findCard(cards, ref);
  const folder = safeName(topic, 'topic');
  const existing = findArtifact(projectDir, card.id, kind);
  if (existing) return { path: existing, created: false };
  const project = projectName(projectDir);
  const path = `${ARTIFACTS_DIR}/${project}/${folder}/${card.id}-${kind}.html`;

  let parent: { id: string; path: string } | undefined;
  if (from === 'latest') {
    const latest = latestArtifact(projectDir, project, folder, kind, card.id);
    if (latest) parent = { id: basename(latest, `-${kind}.html`), path: latest };
  } else if (from !== 'none') {
    const source = findCard(cards, from);
    const found = findArtifact(projectDir, source.id, kind);
    if (!found) throw new RefusalError(`${source.id} has no ${kind} artifact to build on; run \`codeloop artifact new ${source.id} --kind ${kind} --topic <topic>\` first`);
    parent = { id: source.id, path: found };
  }

  const parentHtml = parent ? readFileSync(join(projectDir, parent.path), 'utf-8') : '';
  const lineage = parent ? [card.id, ...(artifactLineage(parentHtml).length ? artifactLineage(parentHtml) : [parent.id, 'base'])] : [card.id, 'base'];

  let html = templateText(kind).replace(BASE_CSS_MARKER, baseCss()).replace(/\{\{lineage\}\}/g, lineage.join(' <- '));
  html = html.replace(/\{\{(id|title|project|topic)\}\}/g, (_, key: string) => ({ id: card.id, title: escape(card.title), project, topic: folder }[key] ?? ''));
  if (parent) {
    // Carry the parent's frontmatter lists forward so lineage means something: a fresh artifact
    // in a chain starts from what the last one named, not from an empty template.
    const parentFm = artifactFrontmatter(parentHtml, kind);
    html = html.replace(FRONTMATTER, m => {
      let out = m;
      for (const [key, values] of Object.entries(parentFm)) out = out.replace(new RegExp(`^${key}: \\[\\]$`, 'm'), `${key}: [${values.join(', ')}]`);
      return out;
    });
  }

  mkdirSync(dirname(join(projectDir, path)), { recursive: true });
  writeFileSync(join(projectDir, path), html);
  return { path, created: true, ...(parent ? { from: parent.id } : {}) };
}

/** Removes every `<pattern> { ... }` block, counting braces so nested rules (the dark media
 *  query wrapping its own `:root:not(...) { }`) strip as one unit instead of stopping early. */
function stripBalanced(text: string, start: RegExp): string {
  let out = text;
  for (;;) {
    const m = start.exec(out);
    if (!m) break;
    const open = out.indexOf('{', m.index);
    if (open < 0) break;
    let depth = 0, i = open;
    for (; i < out.length; i++) {
      if (out[i] === '{') depth++;
      else if (out[i] === '}' && --depth === 0) break;
    }
    out = out.slice(0, m.index) + out.slice(i + 1);
  }
  return out;
}

// The three blocks allowed to carry literal colour values: the light :root block, the dark
// media-query block (which nests its own :root:not(...) rule), and the [data-theme="dark"]
// block. Anything else in the file must reference a var(--...) token instead of a literal.
function tokenFreeBody(html: string): string {
  let out = stripBalanced(html, /:root\s*{/g);
  out = stripBalanced(out, /@media\s*\(prefers-color-scheme:\s*dark\)\s*{/g);
  out = stripBalanced(out, /:root\[data-theme=["']dark["']\]\s*{/g);
  return out;
}

function mermaidProblems(html: string): string[] {
  const errors: string[] = [];
  for (const m of html.matchAll(MERMAID_BLOCK)) {
    const body = m[1].trim();
    if (!body) {
      errors.push('an empty <pre class="mermaid"> block');
      continue;
    }
    const firstLine = body.split('\n')[0].trim();
    if (!KNOWN_DIAGRAMS.some(k => firstLine.startsWith(k))) errors.push(`a mermaid block with an unknown diagram type: "${firstLine}"`);
    // erDiagram's crow's-foot cardinality notation (`||--o{`) uses `{`/`}` as relationship
    // symbols, not brace pairs, so a balance check does not apply to it.
    if (!firstLine.startsWith('erDiagram')) {
      const opens = (body.match(/[[({]/g) ?? []).length;
      const closes = (body.match(/[\])}]/g) ?? []).length;
      if (opens !== closes) errors.push(`a mermaid block with unbalanced brackets: "${firstLine}"`);
    }
  }
  return errors;
}

/** Why the card's artifact does not pass, one line each. Empty when it passes. Auto-detects the
 *  kind from whichever artifact exists for the card when `kind` is omitted. */
export function checkArtifact(projectDir: string, ref: string, kind?: ArtifactKind): string[] {
  const card = findCardOrNone(readCards(projectDir).cards, ref);
  const id = card?.id ?? ref;
  const path = findArtifact(projectDir, id, kind);
  if (!path) return [`no ${kind ?? ''} artifact for ${id} under ${ARTIFACTS_DIR}; run \`codeloop artifact new ${id} --kind ${kind ?? '<mock|system-design|workflow>'} --topic <topic>\``];
  const resolvedKind = kind ?? (ARTIFACT_KINDS.find(k => path.endsWith(`-${k}.html`)) as ArtifactKind);
  const html = readFileSync(join(projectDir, path), 'utf-8').replace(/\r\n/g, '\n');

  const errors: string[] = [];
  if (!html.includes(MARKER(resolvedKind))) errors.push(`${path} does not carry the template marker ${MARKER(resolvedKind)}`);
  if (!/:root\s*{[^}]*--bg:/.test(html)) errors.push(`${path} has no :root token block`);
  if (!/@media\s*\(prefers-color-scheme:\s*dark\)/.test(html) && !/:root\[data-theme=["']dark["']\]/.test(html)) errors.push(`${path} has no dark-mode block redefining the tokens`);
  if (!/body\s*{[^}]*background:\s*var\(--bg\)/.test(html)) errors.push(`${path} does not set the body background from a token`);

  const literals = [...new Set(tokenFreeBody(html).match(COLOUR) ?? [])];
  if (literals.length) errors.push(`${path} uses colours outside the tokens blocks: ${literals.join(', ')}`);

  for (const problem of mermaidProblems(html)) errors.push(`${path} has ${problem}`);

  const fm = artifactFrontmatter(html, resolvedKind);
  const [listA, listB, listC] = KIND_FIELDS[resolvedKind];
  // The template's own worked example lives inside an HTML comment; strip comments before
  // scanning for real screen/flow sections so the example is never counted as drawn content.
  const noComments = html.replace(/<!--[\s\S]*?-->/g, '');

  if (resolvedKind === 'mock') {
    const drawn = new Map([...noComments.matchAll(SCREEN_GROUP)].map(m => [m[1], m[2]] as const));
    for (const screen of fm[listA] ?? []) {
      if (!drawn.has(screen)) errors.push(`${path} has no frame for screen "${screen}" named in the frontmatter`);
    }
    for (const [name, block] of drawn) {
      // Counting occurrences rather than matching whole elements: a .frame nests other divs
      // (.chrome, .main, …), so a regex for "opening tag to its closing tag" would stop at the
      // first nested </div> instead of the frame's own. Count is enough to catch an undocumented
      // frame, a .caption total lower than the .frame total means at least one frame has none.
      const frameCount = (block.match(/\bclass=["'][^"']*\bframe\b/g) ?? []).length;
      const captionCount = (block.match(/\bclass=["'][^"']*\bcaption\b/g) ?? []).length;
      if (frameCount === 0) errors.push(`${path} screen "${name}" has no .frame`);
      else if (captionCount < frameCount) errors.push(`${path} screen "${name}" has a frame with no sibling .caption`);
    }
    const states = fm[listC] ?? [];
    const rows = [...html.matchAll(/<tr>\s*<td>([^<]+)<\/td>([\s\S]*?)<\/tr>/g)];
    for (const component of fm[listB] ?? []) {
      const row = rows.find(r => r[1].trim() === component);
      if (!row) {
        errors.push(`${path} state matrix has no row for component "${component}"`);
        continue;
      }
      const cells = [...row[2].matchAll(/<td\b([^>]*)>([^<]*)<\/td>/g)];
      states.forEach((state, i) => {
        const cell = cells[i];
        if (!cell || (!cell[2].trim() && !/class=["'][^"']*\bgap\b/.test(cell[1]))) errors.push(`${path} state matrix: component "${component}" has no "${state}" cell`);
      });
    }
  }

  if (resolvedKind === 'system-design') {
    const layerBlock = /Software layers<\/h3>[\s\S]*?<pre class=["']mermaid["']>([\s\S]*?)<\/pre>/.exec(html)?.[1] ?? '';
    const nodes = [...layerBlock.matchAll(/\["([^"]*)"\]/g)].map(m => m[1]);
    for (const node of nodes) if (/name the/i.test(node)) errors.push(`${path} software-layer box "${node}" names no technology`);
    for (const env of fm[listC] ?? []) {
      if (!new RegExp(`<td>\\s*${env.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*<\\/td>`).test(html)) errors.push(`${path} deployment topology has no row for environment "${env}"`);
    }
  }

  if (resolvedKind === 'workflow') {
    const diagrams = [...html.matchAll(MERMAID_BLOCK)].map(m => m[1]);
    const flows = new Map([...noComments.matchAll(SCREEN_GROUP)].map(m => [m[1], m[2]] as const));
    for (const flow of fm[listC] ?? []) {
      if (!/sequenceDiagram/.test(flows.get(flow) ?? '')) errors.push(`${path} has no sequence diagram for flow "${flow}"`);
    }
    for (const actor of fm[listA] ?? []) {
      if (!diagrams.some(d => d.includes(actor))) errors.push(`${path} actor "${actor}" does not appear in any diagram`);
    }
  }

  // Lineage: `--from` names the prior id when a parent exists.
  const lineage = artifactLineage(html);
  if (lineage.length > 1 && lineage[0] !== id) errors.push(`${path} lineage comment does not start with this artifact's own id`);

  return errors;
}

/** Writes docs/artifacts/index.html: kind, then project, then topic, then cards, newest first. */
export function writeArtifactsIndex(projectDir: string): { path: string; artifacts: number } {
  const { cards } = readCards(projectDir);
  const found = allArtifactFiles(projectDir).map(a => {
    const html = readFileSync(a.full, 'utf-8');
    const kind = (ARTIFACT_KINDS.find(k => a.file.endsWith(`-${k}.html`)) ?? 'mock') as ArtifactKind;
    const id = a.file.replace(new RegExp(`-${kind}\\.html$`), '');
    const title = cards.find(c => c.id === id)?.title ?? /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? id;
    const lineage = artifactLineage(html);
    return { kind, project: a.project, topic: a.topic, id, title, from: lineage[1], href: `${a.project}/${a.topic}/${a.file}`, at: statSync(a.full).mtimeMs };
  });

  const newest = (items: typeof found) => Math.max(...items.map(i => i.at));
  const group = <K extends 'kind' | 'project' | 'topic'>(items: typeof found, key: K) =>
    [...new Set(items.map(i => i[key]))].map(name => ({ name, items: items.filter(i => i[key] === name) })).sort((a, b) => newest(b.items) - newest(a.items));

  const body = group(found, 'kind').map(kindGroup => [
    `<section class="screen-group">`,
    `  <h2>${escape(kindGroup.name)}</h2>`,
    ...group(kindGroup.items, 'project').flatMap(project =>
      group(project.items, 'topic').map(topic => [
        '  <div class="card">',
        `    <strong>${escape(project.name)} / ${escape(topic.name)}</strong>`,
        '    <table>',
        ...topic.items.sort((a, b) => b.at - a.at).map(m => `      <tr><td><a href="${escape(m.href)}">${escape(m.id)}</a></td><td>${escape(m.title)}</td><td class="muted">${m.from && m.from !== 'base' ? `from ${escape(m.from)}` : m.from ? 'base' : ''}</td><td class="muted">${new Date(m.at).toISOString().slice(0, 10)}</td></tr>`),
        '    </table>',
        '  </div>',
      ].join('\n')),
    ),
    '</section>',
  ].join('\n')).join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="en">',
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>Artifacts</title><style>${baseCss()}</style></head>`,
    '<body><div class="shell">',
    '<header class="page-head"><h1>Artifacts</h1>',
    `<p class="meta">${found.length} ${found.length === 1 ? 'artifact' : 'artifacts'}, newest first within each kind</p></header>`,
    `<main>${body || '<p class="muted">No artifacts yet. `codeloop artifact new &lt;card&gt; --kind mock|system-design|workflow --topic &lt;topic&gt;` creates one.</p>'}</main>`,
    '</div></body></html>',
  ].join('\n');

  const path = `${ARTIFACTS_DIR}/index.html`;
  mkdirSync(join(projectDir, ARTIFACTS_DIR), { recursive: true });
  writeFileSync(join(projectDir, path), html);
  return { path, artifacts: found.length };
}
