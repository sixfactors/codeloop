import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { parse as parseYaml } from 'yaml';
import type { Card } from './cards.js';
import { loadConfig } from './config.js';
import { importCards, RefusalError } from './engine.js';
import { globMatches } from './glob.js';
import { parseFrontmatter } from './skills.js';
import { LAYERS, slugify } from './spec.js';

const SPECKIT_TASK = /^- \[( |x|X)\] (T\d{3})((?: \[[^\]]+\])*) (.+)$/;

function layerScopes(projectDir: string): { layer: string; globs: string[] }[] {
  const scopes = loadConfig(projectDir).scopes ?? {};
  return LAYERS.filter(l => scopes[l]?.paths).map(l => ({ layer: l, globs: scopes[l].paths as string[] }));
}

// A scope counts only when it is named after a layer (api, sdk, ui, test, docs) in config.yaml.
function inferLayer(text: string, scopes: { layer: string; globs: string[] }[]): string | null {
  const paths = text.split(/[\s,()`'"]+/).filter(t => t.includes('/') || /\.\w+$/.test(t));
  for (const path of paths) {
    const hit = scopes.find(s => s.globs.some(g => globMatches(g, path.replace(/[.:;]$/, ''))));
    if (hit) return hit.layer;
  }
  return null;
}

export interface ImportResult {
  cards: Card[];
  flagged: { card: string; file: string; task: string }[];
}

/** Reads `specs/NNN*` in Spec Kit layout. Source files are only read; copies go under `specs/<card-id>-<slug>/`. */
export function importSpecKit(projectDir: string, from: string, lane = 'build'): ImportResult {
  const root = join(resolve(projectDir, from), 'specs');
  const features = existsSync(root)
    ? readdirSync(root).filter(d => /^\d{3}/.test(d) && statSync(join(root, d)).isDirectory() && existsSync(join(root, d, 'tasks.md'))).sort()
    : [];
  if (features.length === 0) throw new RefusalError(`no Spec Kit features (specs/NNN*/tasks.md) under ${from}`);

  const titleOf = (dir: string) => {
    const spec = join(root, dir, 'spec.md');
    const h1 = existsSync(spec) ? /^#\s+(?:Feature Specification:\s*)?(.+?)\s*$/m.exec(readFileSync(spec, 'utf-8'))?.[1] : undefined;
    return h1 ?? dir.replace(/^\d{3}-?/, '').replace(/-/g, ' ');
  };
  const cards = importCards(projectDir, features.map(dir => ({
    lane,
    title: titleOf(dir),
    note: `speckit ${join(from, 'specs', dir)}`,
    spec: id => `specs/${id}-${slugify(dir.replace(/^\d{3}-?/, '')) || 'feature'}`,
  })));

  const scopes = layerScopes(projectDir);
  const flagged: ImportResult['flagged'] = [];
  features.forEach((dir, i) => {
    const card = cards[i];
    const dest = join(projectDir, card.spec!);
    mkdirSync(dest, { recursive: true });
    for (const name of ['research.md', 'plan.md']) {
      if (existsSync(join(root, dir, name))) copyFileSync(join(root, dir, name), join(dest, name));
    }

    // Spec Kit writes user stories as headings; codeloop traces `- USn` acceptance lines.
    const spec = existsSync(join(root, dir, 'spec.md')) ? readFileSync(join(root, dir, 'spec.md'), 'utf-8') : `# ${card.title}\n`;
    const stories = [...spec.matchAll(/^#{2,4}\s+User Story (\d+)\s*[-:]\s*(.+?)\s*$/gm)];
    // Imported specs carry none of the standard's fields; defaults keep `spec check` honest and
    // visible until the spec stage fills them in.
    writeFileSync(join(dest, 'spec.md'), `${spec.trimEnd()}\n\nStory: As a dev, I can ${card.title.toLowerCase()}, so that the imported feature ships.\nsize: M\nmetric: no-data\ndone_when: the imported acceptance lines pass their use cases\n\nacceptance:\n${stories.map(m => `- US${m[1]} Given the feature, when ${m[2].toLowerCase()}, then it works as specified.`).join('\n')}\n`);

    const tasks = readFileSync(join(root, dir, 'tasks.md'), 'utf-8').split('\n').map(line => {
      const m = SPECKIT_TASK.exec(line);
      if (!m) return line;
      const tags = m[3].split(' ').filter(t => t === '[P]' || /^\[US\d+\]$/.test(t)).sort();
      const layer = inferLayer(m[4], scopes);
      const rewritten = `- [${m[1] === ' ' ? ' ' : 'x'}] ${m[2]}${tags.map(t => ` ${t}`).join('')} [${layer ?? '?'}] ${m[4]}`;
      if (!layer) flagged.push({ card: card.id, file: `${card.spec}/tasks.md`, task: rewritten });
      return rewritten;
    });
    writeFileSync(join(dest, 'tasks.md'), tasks.join('\n'));
  });
  return { cards, flagged };
}

const BMAD_STAGE: Record<string, string> = {
  backlog: 'research',
  drafted: 'spec',
  'ready-for-dev': 'build',
  'in-progress': 'build',
  review: 'review',
  done: 'done',
};

function findUp(dir: string, name: string, depth = 3): string | null {
  if (existsSync(join(dir, name))) return join(dir, name);
  if (depth === 0) return null;
  for (const sub of readdirSync(dir).filter(d => d !== 'node_modules' && d !== '.git' && statSync(join(dir, d)).isDirectory())) {
    const hit = findUp(join(dir, sub), name, depth - 1);
    if (hit) return hit;
  }
  return null;
}

/** Reads BMAD `sprint-status.yaml` and the story files beside it. One card per story; epics and retrospectives are skipped. */
export function importBmad(projectDir: string, from: string, lane = 'build'): ImportResult {
  const base = resolve(projectDir, from);
  const statusFile = existsSync(base) ? findUp(base, 'sprint-status.yaml') : null;
  if (!statusFile) throw new RefusalError(`no sprint-status.yaml under ${from}`);
  const status: Record<string, string> = parseYaml(readFileSync(statusFile, 'utf-8'))?.development_status ?? {};
  const stories = Object.entries(status).filter(([key]) => !key.startsWith('epic-'));
  if (stories.length === 0) throw new RefusalError(`${statusFile} lists no stories under development_status`);

  const storyFile = (key: string) => [dirname(statusFile), join(dirname(statusFile), 'stories')].map(d => join(d, `${key}.md`)).find(existsSync);
  const titleOf = (key: string) => {
    const file = storyFile(key);
    if (!file) return key.replace(/-/g, ' ');
    const { data, body } = parseFrontmatter(readFileSync(file, 'utf-8'));
    return (typeof data.title === 'string' && data.title) || /^#\s+(.+?)\s*$/m.exec(body)?.[1] || key.replace(/-/g, ' ');
  };

  const cards = importCards(projectDir, stories.map(([key, state]) => ({
    lane,
    title: titleOf(key),
    stage: BMAD_STAGE[state] ?? 'research',
    note: `bmad ${basename(statusFile)} ${key}: ${state}`,
    spec: id => `specs/${id}-${slugify(key)}`,
  })));
  stories.forEach(([key], i) => {
    const file = storyFile(key);
    if (!file) return;
    const dest = join(projectDir, cards[i].spec!);
    mkdirSync(dest, { recursive: true });
    copyFileSync(file, join(dest, 'spec.md'));
  });
  return { cards, flagged: [] };
}
