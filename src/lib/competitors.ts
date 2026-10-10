import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { stringify } from 'yaml';
import { RefusalError, safeName } from './cards.js';
import { CLOUD_COPY, writeCloudWikiPage } from './cloud.js';
import { withLock } from './lock.js';
import { parseFrontmatter } from './skills.js';

/** One wiki page per competitor: docs and changelog links in the front matter, findings added below by each research stage. */
export const COMPETITORS_DIR = '.codeloop/wiki/competitors';

export interface Competitor {
  /** The file name without `.md`. */
  name: string;
  path: string;
  title: string;
  docs?: string;
  changelog?: string;
  body: string;
}

const pagePath = (name: string) => `${COMPETITORS_DIR}/${safeName(name, 'competitor name').toLowerCase()}.md`;

function render(c: Pick<Competitor, 'title' | 'docs' | 'changelog' | 'body'>): string {
  const frontmatter = { title: c.title, ...(c.docs ? { docs: c.docs } : {}), ...(c.changelog ? { changelog: c.changelog } : {}) };
  return `---\n${stringify(frontmatter)}---\n\n${c.body.trim()}\n`;
}

export function listCompetitors(projectDir: string): Competitor[] {
  const dir = join(projectDir, COMPETITORS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.md') && !f.endsWith(CLOUD_COPY)).sort().map(file => {
    const { data, body } = parseFrontmatter(readFileSync(join(dir, file), 'utf-8'));
    const name = file.replace(/\.md$/, '');
    return {
      name,
      path: `${COMPETITORS_DIR}/${file}`,
      title: String(data.title ?? name),
      ...(data.docs ? { docs: String(data.docs) } : {}),
      ...(data.changelog ? { changelog: String(data.changelog) } : {}),
      body: body.trim(),
    };
  });
}

/** Adding a name that already has a page updates its links and keeps its findings. */
export function addCompetitor(projectDir: string, input: { name: string; title?: string; docs?: string; changelog?: string }): Competitor {
  const path = pagePath(input.name);
  for (const url of [input.docs, input.changelog]) {
    if (url && !/^https?:\/\//.test(url)) throw new RefusalError(`"${url}" is not an http(s) URL`);
  }
  return withLock(join(projectDir, path), () => {
    const existing = listCompetitors(projectDir).find(c => c.path === path);
    const page: Competitor = {
      name: path.replace(/^.*\//, '').replace(/\.md$/, ''),
      path,
      title: input.title ?? existing?.title ?? input.name,
      docs: input.docs ?? existing?.docs,
      changelog: input.changelog ?? existing?.changelog,
      body: existing?.body ?? '## Findings',
    };
    mkdirSync(dirname(join(projectDir, path)), { recursive: true });
    writeFileSync(join(projectDir, path), render(page));
    writeCloudWikiPage(projectDir, path);
    return page;
  });
}

// A findings row is a table row or a list item in research.md whose first cell or label is a competitor's name.
function rowFor(line: string, competitor: Competitor): string | null {
  const names = [competitor.name.toLowerCase(), competitor.title.toLowerCase()];
  const table = /^\|\s*([^|]+?)\s*\|(.+)$/.exec(line.trim());
  if (table && names.includes(table[1].toLowerCase())) return table[2].replace(/\|\s*$/, '').split('|').map(c => c.trim()).join(' | ');
  const item = /^[-*]\s+\**([^:*]+?)\**\s*:\s*(.+)$/.exec(line.trim());
  return item && names.includes(item[1].toLowerCase()) ? item[2].trim() : null;
}

/**
 * Copies each competitor's rows from a card's research onto that competitor's page, so findings
 * build up across features. A page that already has rows from the card is left alone.
 * Returns the pages that were changed.
 */
export function appendFindings(projectDir: string, card: { id: string; title: string }, research: string): string[] {
  const changed: string[] = [];
  for (const competitor of listCompetitors(projectDir)) {
    const rows = research.split('\n').map(l => rowFor(l, competitor)).filter((r): r is string => r !== null);
    if (rows.length === 0) continue;
    const done = withLock(join(projectDir, competitor.path), () => {
      const current = listCompetitors(projectDir).find(c => c.path === competitor.path)!;
      if (current.body.split('\n').some(l => l.startsWith(`- ${card.id} `))) return false;
      const body = `${current.body.includes('## Findings') ? current.body : `${current.body}\n\n## Findings`}\n\n${rows.map(r => `- ${card.id} ${card.title}: ${r}`).join('\n')}`;
      writeFileSync(join(projectDir, competitor.path), render({ ...current, body }));
      return true;
    });
    if (!done) continue;
    writeCloudWikiPage(projectDir, competitor.path);
    changed.push(competitor.path);
  }
  return changed;
}
