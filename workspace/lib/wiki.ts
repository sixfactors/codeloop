// Wiki folders, templates and the pure helpers the wiki screens share. Folder order follows
// docs/terminology.md (initiative › epic › feature), then the reference folders.

import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle, BookOpen, Compass, FileText, Hash, Layers, Lightbulb, ListChecks, Scale, Swords, Target,
} from 'lucide-react';
import type { PageSummary } from './types';

export const WIKI_ROOT = '.codeloop/wiki';

export interface WikiFolder {
  id: string;
  label: string;
  singular: string;
  icon: LucideIcon;
  description: string;
  template: { frontmatter: Record<string, unknown>; body: string };
}

export const WIKI_FOLDERS: WikiFolder[] = [
  {
    id: 'initiatives', label: 'Initiatives', singular: 'Initiative', icon: Target,
    description: 'A goal, a hypothesis and the metric that proves it.',
    template: {
      frontmatter: { status: 'active', metric: '', goal: '', persona: '' },
      body: 'We believe … because ….\n',
    },
  },
  {
    id: 'epics', label: 'Epics', singular: 'Epic', icon: Layers,
    description: 'An outcome that takes several features and more than one release.',
    template: { frontmatter: { status: 'planned', initiative: '', target: '' }, body: '## Outcome\n\n## Features\n\n' },
  },
  {
    id: 'features', label: 'Features', singular: 'Feature', icon: ListChecks,
    description: 'A capability the user gets, titled by what they can now do.',
    template: { frontmatter: { status: 'planned', epic: '', initiative: '', release: 'next' }, body: '## What the user can now do\n\n## Stories\n\n' },
  },
  {
    id: 'decisions', label: 'Decisions', singular: 'Decision', icon: Scale,
    description: 'Why the product works the way it does.',
    template: { frontmatter: { status: 'accepted' }, body: '## Context\n\n## Decision\n\n## Consequences\n\n' },
  },
  {
    id: 'concepts', label: 'Concepts', singular: 'Concept', icon: Lightbulb,
    description: 'Cross-cutting ideas the code and the stories refer to.',
    template: { frontmatter: {}, body: '' },
  },
  {
    id: 'gotchas', label: 'Gotchas', singular: 'Gotcha', icon: AlertTriangle,
    description: 'What went wrong, why, and the fix. Injected into changes that touch the scope.',
    template: { frontmatter: { freq: 1, severity: 'warning' }, body: '## Trigger\n\n## What went wrong\n\n## Why\n\n## Fix\n\n' },
  },
  {
    id: 'runbooks', label: 'Runbooks', singular: 'Runbook', icon: Compass,
    description: 'How to do an operational task, step by step.',
    template: { frontmatter: {}, body: '' },
  },
  {
    id: 'numbers', label: 'Numbers', singular: 'Number', icon: Hash,
    description: 'Metrics and the figures behind them.',
    template: { frontmatter: {}, body: '' },
  },
  {
    id: 'competitors', label: 'Competitors', singular: 'Competitor', icon: Swords,
    description: 'What rivals do and where the wedge is.',
    template: { frontmatter: {}, body: '## What they do\n\n## Where we differ\n\n' },
  },
  {
    id: 'cards', label: 'Stories', singular: 'Story page', icon: FileText,
    description: 'One page per story: what shipped and what was learned.',
    template: { frontmatter: {}, body: '' },
  },
];

export const folderById = (id: string): WikiFolder | undefined => WIKI_FOLDERS.find((f) => f.id === id);
export const folderLabel = (id: string) => folderById(id)?.label ?? (id.startsWith('specs/') ? `Spec ${id.slice('specs/'.length)}` : id);
export const folderIcon = (id: string): LucideIcon => folderById(id)?.icon ?? (id.startsWith('specs/') ? FileText : BookOpen);
export const isSpec = (p: PageSummary) => (p.folder ?? '').startsWith('specs/') || p.id.startsWith('specs/');
export const pageFolder = (p: PageSummary) => p.folder || p.id.split('/').slice(0, -1).join('/');
export const pageSlug = (id: string) => id.split('/').pop()?.replace(/\.md$/, '') ?? id;

export const slugify = (title: string) =>
  title.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 80);

export const pageIdFor = (folder: string, slug: string) => `${WIKI_ROOT}/${folder}/${slug}.md`;

export const updatedAt = (p: PageSummary): string | undefined => {
  const u = p.frontmatter?.updated ?? p.frontmatter?.date;
  return typeof u === 'string' ? u : u instanceof Date ? u.toISOString().slice(0, 10) : undefined;
};

/** Newest `updated` first; pages with no date follow, alphabetical. */
export function byRecent(a: PageSummary, b: PageSummary) {
  const ua = updatedAt(a);
  const ub = updatedAt(b);
  if (ua && ub) return ub.localeCompare(ua);
  if (ua) return -1;
  if (ub) return 1;
  return a.title.localeCompare(b.title);
}

/** Frontmatter keys shown as the properties block, in this order; anything else scalar follows. */
const PROPERTY_ORDER = ['status', 'metric', 'goal', 'persona', 'card', 'cards', 'initiative', 'epic', 'feature', 'release', 'severity', 'freq', 'scope', 'owner', 'updated'];
export function properties(fm?: Record<string, unknown>): [string, string][] {
  if (!fm) return [];
  const out: [string, string][] = [];
  const seen = new Set<string>();
  const stringify = (v: unknown): string | null => {
    if (v === null || v === undefined || v === '') return null;
    if (Array.isArray(v)) return v.map(String).join(', ');
    if (typeof v === 'object') return null;
    return String(v);
  };
  for (const k of PROPERTY_ORDER) {
    const s = stringify(fm[k]);
    if (s !== null) { out.push([k, s]); seen.add(k); }
  }
  for (const [k, v] of Object.entries(fm)) {
    if (seen.has(k) || k === 'title') continue;
    const s = stringify(v);
    if (s !== null) out.push([k, s]);
  }
  return out;
}

export interface TocItem { title: string; url: string; depth: number }

/** Headings from markdown for the table of contents; ids match rehype-slug's github-slugger. */
export function headingsOf(body: string): TocItem[] {
  const items: TocItem[] = [];
  const counts = new Map<string, number>();
  let inFence = false;
  for (const raw of body.split('\n')) {
    if (/^\s*(```|~~~)/.test(raw)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(raw);
    if (!m) continue;
    const title = m[2].replace(/[*_`~]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    let id = title.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
    const n = counts.get(id) ?? 0;
    counts.set(id, n + 1);
    if (n) id = `${id}-${n}`;
    items.push({ title, url: `#${id}`, depth: m[1].length });
  }
  return items;
}

export interface TreeFolder { id: string; label: string; count: number; pages: PageSummary[] }

/** The sidebar tree: one folder per wiki folder that has pages, in WIKI_FOLDERS order, pages A–Z inside. Spec pages are left out. */
export function buildTree(pages: PageSummary[], filter = ''): TreeFolder[] {
  const q = filter.trim().toLowerCase();
  const groups = new Map<string, PageSummary[]>();
  for (const p of pages) {
    if (isSpec(p)) continue;
    if (q && !p.title.toLowerCase().includes(q) && !p.id.toLowerCase().includes(q)) continue;
    const f = pageFolder(p);
    groups.set(f, [...(groups.get(f) ?? []), p]);
  }
  const order = (f: string) => { const i = WIKI_FOLDERS.findIndex((w) => w.id === f); return i === -1 ? 99 : i; };
  return [...groups.keys()]
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b))
    .map((id) => ({ id, label: folderLabel(id), count: groups.get(id)!.length, pages: groups.get(id)!.sort((a, b) => a.title.localeCompare(b.title)) }));
}

/** A short window of body text around the first match of q, or the opening line. */
export function excerpt(body: string, q: string, width = 140): string {
  const text = body.replace(/^---[\s\S]*?---\s*/, '').replace(/[#>*`_\[\]]/g, '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i === -1) return text.slice(0, width) + (text.length > width ? '…' : '');
  const start = Math.max(0, i - Math.floor(width / 3));
  const end = Math.min(text.length, start + width);
  return (start ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

/** True when `body` links to or names the page at `id` (filename stem or title). */
export function mentions(body: string, id: string, title: string) {
  const slug = pageSlug(id);
  const lower = body.toLowerCase();
  return lower.includes(slug.toLowerCase()) || (title.length > 3 && lower.includes(title.toLowerCase()));
}
