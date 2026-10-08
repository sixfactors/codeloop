import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Marked } from 'marked';

// The docs are markdown files under content/docs/<section>/<slug>.md, read at build time.
// Static export needs every route known up front, so the nav below is the list of pages.

export type NavItem = { title: string; href: string };
export type NavGroup = { title: string; items: NavItem[] };

export const docsNav: NavGroup[] = [
  {
    title: 'Start',
    items: [
      { title: 'Install', href: '/docs/start/install' },
      { title: 'Your first card', href: '/docs/start/first-card' },
      { title: 'The inbox', href: '/docs/start/inbox' },
      { title: 'Approve a gate', href: '/docs/start/approve-a-gate' },
      { title: "A founder's week", href: '/docs/start/founders-week' },
      { title: 'You already have a project', href: '/docs/start/already-have-a-project' },
    ],
  },
  {
    title: 'Concepts',
    items: [
      { title: 'Lanes', href: '/docs/concepts/lanes' },
      { title: 'Cards and gates', href: '/docs/concepts/cards-and-gates' },
      { title: 'Stages and checks', href: '/docs/concepts/stages-and-checks' },
      { title: 'The inbox', href: '/docs/concepts/the-inbox' },
      { title: 'Initiatives, epics, features and priority', href: '/docs/concepts/initiatives-epics-features-and-priority' },
      { title: 'Wiki and learning', href: '/docs/concepts/wiki-and-learning' },
      { title: 'Cloud and hosting', href: '/docs/concepts/cloud-and-hosting' },
    ],
  },
  {
    title: 'Guides',
    items: [
      { title: 'Review a client deliverable', href: '/docs/guides/review-a-client-deliverable' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { title: 'Commands', href: '/docs/reference/commands' },
      { title: 'Lanes', href: '/docs/reference/lanes' },
      { title: 'Config', href: '/docs/reference/config' },
      { title: 'Story standard', href: '/docs/reference/story-standard' },
    ],
  },
  {
    title: 'More',
    items: [
      { title: 'Hosts', href: '/docs/hosts' },
      { title: 'Compare', href: '/docs/compare' },
      { title: 'Planned', href: '/docs/planned' },
    ],
  },
];

export const allDocHrefs = docsNav.flatMap((g) => g.items.map((i) => i.href));

const contentDir = join(process.cwd(), 'content', 'docs');

export type Doc = {
  slug: string[];
  href: string;
  title: string;
  description: string;
  html: string;
  text: string;
  headings: { depth: number; text: string; id: string }[];
  words: number;
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function frontMatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: raw.slice(m[0].length) };
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderMarkdown(body: string) {
  const headings: Doc['headings'] = [];
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const id = slugify(text);
        headings.push({ depth, text: text.replace(/<[^>]+>/g, ''), id });
        return `<h${depth} id="${id}">${text}</h${depth}>\n`;
      },
      code({ text, lang }) {
        const label = lang ? `<div class="code-label">${escapeHtml(lang)}</div>` : '';
        return `<div class="code">${label}<pre><code>${escapeHtml(text)}</code></pre></div>\n`;
      },
    },
  });
  const html = marked.parse(body) as string;
  return { html, headings };
}

export function docFile(slug: string[]) {
  return join(contentDir, ...slug) + '.md';
}

export function hasDoc(slug: string[]) {
  return existsSync(docFile(slug));
}

export function loadDoc(slug: string[]): Doc {
  const raw = readFileSync(docFile(slug), 'utf8');
  const { meta, body } = frontMatter(raw);
  const { html, headings } = renderMarkdown(body);
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*_`>|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    slug,
    href: '/docs/' + slug.join('/'),
    title: meta.title ?? slug[slug.length - 1],
    description: meta.description ?? '',
    html,
    text,
    headings,
    words: text ? text.split(' ').length : 0,
  };
}

export function listDocSlugs(): string[][] {
  const out: string[][] = [];
  const walk = (dir: string, prefix: string[]) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), [...prefix, entry.name]);
      else if (entry.name.endsWith('.md')) out.push([...prefix, entry.name.replace(/\.md$/, '')]);
    }
  };
  if (existsSync(contentDir)) walk(contentDir, []);
  return out;
}

export type SearchEntry = { title: string; href: string; group: string; headings: string[]; text: string };

// Built once per build from the same files the pages render. Small enough to ship inline.
export function searchIndex(): SearchEntry[] {
  const groupOf = new Map(docsNav.flatMap((g) => g.items.map((i) => [i.href, g.title] as const)));
  const entries: SearchEntry[] = [];
  for (const slug of listDocSlugs()) {
    const d = loadDoc(slug);
    entries.push({
      title: d.title,
      href: d.href,
      group: groupOf.get(d.href) ?? 'Docs',
      headings: d.headings.map((h) => h.text),
      text: d.text.slice(0, 400),
    });
  }
  entries.push({
    title: 'Commands',
    href: '/docs/reference/commands',
    group: 'Reference',
    headings: [],
    text: 'Every codeloop command and flag, generated from --help.',
  });
  return entries;
}

export function prevNext(href: string): { prev?: NavItem; next?: NavItem } {
  const flat = docsNav.flatMap((g) => g.items);
  const i = flat.findIndex((x) => x.href === href);
  return { prev: i > 0 ? flat[i - 1] : undefined, next: i >= 0 && i < flat.length - 1 ? flat[i + 1] : undefined };
}
