import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { findCard, findCardOrNone, readCards, RefusalError, safeName } from './cards.js';
import { loadConfig } from './config.js';
import { resolveSpecDir, slugify } from './spec.js';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TEMPLATE = 'templates/mock/template.html';
export const MOCKS_DIR = 'docs/mocks';
const MARKER = '<!-- codeloop-mock-template: 1 -->';
// `<!-- codeloop mock lineage: c-003 <- c-002 <- base -->`: this mock, the one it was copied from, and so on back.
const LINEAGE = /<!-- codeloop mock lineage: ([^>]*?) -->/;
const SECTION = /<section\b[^>]*\sdata-screen=["']([^"']*)["'][^>]*>[\s\S]*?<\/section>/g;
const TOKENS = /\/\* codeloop-tokens:start \*\/[\s\S]*?\/\* codeloop-tokens:end \*\//;
// Hex colours and colour functions. `href="#fff"` is a link to an anchor, and `&#123;` an entity.
const COLOUR = /(?<![&\w]|href=["'])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g;

const template = () => readFileSync(join(PACKAGE_ROOT, TEMPLATE), 'utf-8');
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function projectName(projectDir: string): string {
  return slugify(String(loadConfig(projectDir).project?.name ?? '')) || slugify(basename(projectDir)) || 'project';
}

/** The card's mock, wherever its project and topic folders put it. */
export function findMock(projectDir: string, cardId: string): string | undefined {
  const root = join(projectDir, MOCKS_DIR);
  if (!existsSync(root)) return undefined;
  for (const project of dirs(root)) {
    for (const topic of dirs(join(root, project))) {
      if (existsSync(join(root, project, topic, `${cardId}.html`))) return `${MOCKS_DIR}/${project}/${topic}/${cardId}.html`;
    }
  }
  return undefined;
}

const dirs = (path: string) => readdirSync(path).filter(d => statSync(join(path, d)).isDirectory()).sort();

/** The chain a mock was copied along, this mock first and `base` last. Empty for a mock with no lineage comment. */
export function mockLineage(html: string): string[] {
  return (LINEAGE.exec(html)?.[1] ?? '').split('<-').map(s => s.trim()).filter(Boolean);
}

// The template's own comment shows a <section data-screen="name">, so comments are not sections.
const screenBlocks = (html: string) => [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(SECTION)];

/** The screens a mock draws, in order. */
export const mockScreens = (html: string) => screenBlocks(html).map(m => m[1]);

/** The newest mock in a project/topic folder other than the card's own, or undefined. */
function latestMock(projectDir: string, project: string, topic: string, except: string): string | undefined {
  const folder = join(projectDir, MOCKS_DIR, project, topic);
  if (!existsSync(folder)) return undefined;
  const newest = readdirSync(folder)
    .filter(f => f.endsWith('.html') && f !== `${except}.html`)
    .map(f => ({ f, at: statSync(join(folder, f)).mtimeMs }))
    .sort((a, b) => b.at - a.at)[0];
  return newest && `${MOCKS_DIR}/${project}/${topic}/${newest.f}`;
}

/**
 * Creates the card's mock. By default it builds on the newest mock in the same project and topic:
 * that mock's screens are copied in, each marked `data-from="<its card>"`, and each screen the spec
 * names that the parent lacks gets an empty section marked `data-from="new"`. `from` names another
 * card's mock, or `none` for the bare template. A mock that exists is never overwritten.
 */
export function newMock(projectDir: string, ref: string, topic: string, from: string = 'latest'): { path: string; created: boolean; from?: string } {
  const { cards } = readCards(projectDir);
  const card = findCard(cards, ref);
  const folder = safeName(topic, 'topic');
  const existing = findMock(projectDir, card.id);
  if (existing) return { path: existing, created: false };
  const project = projectName(projectDir);
  const path = `${MOCKS_DIR}/${project}/${folder}/${card.id}.html`;

  let parent: { id: string; path: string } | undefined;
  if (from === 'latest') {
    const latest = latestMock(projectDir, project, folder, card.id);
    if (latest) parent = { id: basename(latest, '.html'), path: latest };
  } else if (from !== 'none') {
    const source = findCard(cards, from);
    const found = findMock(projectDir, source.id);
    if (!found) throw new RefusalError(`${source.id} has no mock to build on; run \`codeloop mock new ${source.id} --topic <topic>\` first`);
    parent = { id: source.id, path: found };
  }

  const parentHtml = parent ? readFileSync(join(projectDir, parent.path), 'utf-8') : '';
  const lineage = parent ? [card.id, ...(mockLineage(parentHtml).length ? mockLineage(parentHtml) : [parent.id, 'base'])] : [card.id, 'base'];
  const inherited = parent ? screenBlocks(parentHtml).map(m => m[0].replace(/^<section\b([^>]*?)(\sdata-from=["'][^"']*["'])?([^>]*)>/, `<section$1$3 data-from="${parent!.id}">`)) : [];
  const have = new Set(mockScreens(parentHtml));
  const specFile = parent ? join(projectDir, resolveSpecDirOrNone(projectDir, card.id) ?? '', 'spec.md') : '';
  const named = parent && specFile && existsSync(specFile) ? specScreens(readFileSync(specFile, 'utf-8')) : [];
  const fresh = named === 'none' ? [] : named.filter(s => !have.has(s)).map(s => `<section data-screen="${escape(s)}" data-from="new">\n  <h2>${escape(s)}</h2>\n  <div class="frame"></div>\n</section>`);
  const sections = [...inherited, ...fresh].map(s => `    ${s}\n`).join('');

  const values: Record<string, string> = { id: card.id, title: escape(card.title), project, topic, lineage: lineage.join(' <- ') };
  mkdirSync(dirname(join(projectDir, path)), { recursive: true });
  const html = template().replace(/\{\{(id|title|project|topic|lineage)\}\}/g, (_, key: string) => values[key]).replace('  </main>', `${sections}  </main>`);
  writeFileSync(join(projectDir, path), html);
  return { path, created: true, ...(parent ? { from: parent.id } : {}) };
}

function resolveSpecDirOrNone(projectDir: string, ref: string): string | undefined {
  try {
    return resolveSpecDir(projectDir, ref);
  } catch (e) {
    if (e instanceof RefusalError) return undefined;
    throw e;
  }
}

/** The names under `screens:` in a spec, or 'none' when the spec says the card has nothing to draw. */
export const specScreens = (spec: string) => specList(spec, 'screens');

/** The names under `screens_removed:`: inherited screens this card drops on purpose. */
export const specScreensRemoved = (spec: string) => {
  const list = specList(spec, 'screens_removed');
  return list === 'none' ? [] : list;
};

function specList(spec: string, key: string): string[] | 'none' {
  const lines = spec.split('\n');
  const at = lines.findIndex(l => l.startsWith(`${key}:`));
  if (at < 0) return [];
  const inline = lines[at].slice(key.length + 1).trim();
  if (inline.toLowerCase() === 'none') return 'none';
  if (inline) return inline.replace(/^\[|\]$/g, '').split(',').map(s => s.trim()).filter(Boolean);
  const names: string[] = [];
  for (const line of lines.slice(at + 1)) {
    const item = /^\s*-\s+(\S.*)$/.exec(line);
    if (!item) {
      if (line.trim() === '') continue;
      break;
    }
    names.push(item[1].trim());
  }
  return names;
}

/** Why the card's mock does not pass, one line each. Empty when it passes. */
export function checkMock(projectDir: string, ref: string): string[] {
  const card = findCardOrNone(readCards(projectDir).cards, ref);
  const specDir = resolveSpecDir(projectDir, ref);
  const specFile = join(projectDir, specDir, 'spec.md');
  const screens = existsSync(specFile) ? specScreens(readFileSync(specFile, 'utf-8')) : [];
  if (screens === 'none') return [];
  // An untouched spec template names nothing, so it cannot pass.
  if (screens.length === 0) return [`${specDir}/spec.md names no screens under \`screens:\` (write \`screens: none\` for a card with nothing to draw)`];

  const id = card?.id ?? ref;
  const path = findMock(projectDir, id);
  if (!path) return [`no mock for ${id} under ${MOCKS_DIR}; run \`codeloop mock new ${id} --topic <topic>\``];
  const html = readFileSync(join(projectDir, path), 'utf-8').replace(/\r\n/g, '\n');
  if (!html.includes(MARKER)) return [`${path} does not carry the template marker ${MARKER}`];
  if (TOKENS.exec(html)?.[0] !== TOKENS.exec(template())![0]) return [`${path}: the tokens block differs from ${TEMPLATE}`];

  const errors: string[] = [];
  const literals = [...new Set(html.replace(TOKENS, '').match(COLOUR) ?? [])];
  if (literals.length) errors.push(`${path} uses colours outside the tokens block: ${literals.join(', ')}`);
  for (const screen of screens) {
    if (!new RegExp(`<section[^>]*\\sdata-screen=["']${screen.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(html)) {
      errors.push(`${path} has no <section data-screen="${screen}"> for a screen named in the spec`);
    }
  }
  // A screen the parent mock drew is part of this card's product too, unless the spec says it was taken out.
  const parentId = mockLineage(html)[1];
  const parentPath = parentId && parentId !== 'base' ? findMock(projectDir, parentId) : undefined;
  if (parentPath) {
    const drawn = new Set(mockScreens(html));
    const removed = existsSync(specFile) ? specScreensRemoved(readFileSync(specFile, 'utf-8')) : [];
    for (const screen of mockScreens(readFileSync(join(projectDir, parentPath), 'utf-8'))) {
      if (!drawn.has(screen) && !removed.includes(screen)) errors.push(`${path} dropped <section data-screen="${screen}"> inherited from ${parentId}; list it under \`screens_removed:\` in the spec if that is meant`);
    }
  }
  return errors;
}

/** Writes docs/mocks/index.html: projects, then topics, then cards, each newest first. */
export function writeMocksIndex(projectDir: string): { path: string; mocks: number } {
  const root = join(projectDir, MOCKS_DIR);
  const { cards } = readCards(projectDir);
  const found = (existsSync(root) ? dirs(root) : []).flatMap(project =>
    dirs(join(root, project)).flatMap(topic =>
      readdirSync(join(root, project, topic)).filter(f => f.endsWith('.html')).map(file => {
        const full = join(root, project, topic, file);
        const id = file.replace(/\.html$/, '');
        const html = readFileSync(full, 'utf-8');
        const title = cards.find(c => c.id === id)?.title ?? /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? id;
        return { project, topic, id, title, from: mockLineage(html)[1], href: `${project}/${topic}/${file}`, at: statSync(full).mtimeMs };
      }),
    ),
  );
  const newest = (items: typeof found) => Math.max(...items.map(i => i.at));
  const group = <K extends 'project' | 'topic'>(items: typeof found, key: K) =>
    [...new Set(items.map(i => i[key]))].map(name => ({ name, items: items.filter(i => i[key] === name) })).sort((a, b) => newest(b.items) - newest(a.items));

  const body = group(found, 'project').map(project => [
    `<section data-screen="${escape(project.name)}">`,
    `  <h2>${escape(project.name)}</h2>`,
    ...group(project.items, 'topic').map(topic => [
      '  <div class="frame">',
      `    <strong>${escape(topic.name)}</strong>`,
      '    <table>',
      ...topic.items.sort((a, b) => b.at - a.at).map(m => `      <tr><td><a href="${escape(m.href)}">${escape(m.id)}</a></td><td>${escape(m.title)}</td><td class="muted">${m.from && m.from !== 'base' ? `from ${escape(m.from)}` : m.from ? 'base' : ''}</td><td class="muted">${new Date(m.at).toISOString().slice(0, 10)}</td></tr>`),
      '    </table>',
      '  </div>',
    ].join('\n')),
    '</section>',
  ].join('\n')).join('\n');

  // The gallery is the same page shell as every mock, with the list where the screens go.
  const html = template()
    .replace('<title>{{id}} {{title}}</title>', '<title>Mocks</title>')
    .replace('<!-- codeloop mock lineage: {{lineage}} -->\n', '')
    .replace('<h1>{{title}}</h1>', '<h1>Mocks</h1>')
    .replace('{{id}} · {{project}} · {{topic}}', `${found.length} ${found.length === 1 ? 'mock' : 'mocks'}, newest first`)
    .replace(/<main class="screens">[\s\S]*<\/main>/, `<main class="screens">\n${body || '<p class="muted">No mocks yet. `codeloop mock new &lt;card&gt; --topic &lt;topic&gt;` creates one.</p>'}\n</main>`);
  const path = `${MOCKS_DIR}/index.html`;
  mkdirSync(root, { recursive: true });
  writeFileSync(join(projectDir, path), html);
  return { path, mocks: found.length };
}
