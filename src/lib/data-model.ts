import { specPath } from './project-root.js';
/**
 * `codeloop check data-model <card>`: a story that changes stored data must say where each entity
 * lives, and that place must already be named by the project's architecture data-model page.
 * It cannot judge whether the design is good, only that it is complete and does not invent a store.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { resolveSpecDir } from './spec.js';

export const ARCHITECTURE_DATA_MODEL = '.codeloop/wiki/architecture/data-model.md';
export const NO_DATA_CHANGE = 'no data change in this story';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The `entities:` list in spec.md, inline (`entities: A, B`) or as `- A` lines below it. `none` is empty. */
export function readEntities(specText: string): string[] {
  const lines = specText.split('\n');
  const at = lines.findIndex(l => /^entities:/i.test(l.trim()));
  if (at < 0) return [];
  const out: string[] = [];
  const inline = lines[at].replace(/^entities:/i, '').trim();
  if (inline) out.push(...inline.split(',').map(s => s.trim()));
  for (const l of lines.slice(at + 1)) {
    const m = /^\s*-\s+(.+)$/.exec(l);
    if (!m) break;
    out.push(m[1].trim());
  }
  return out.map(e => e.replace(/[`*]/g, '').split(/[:(]/)[0].trim()).filter(e => e && e.toLowerCase() !== 'none');
}

/** Lines of tasks.md tagged `[data]`. Read here because the task grammar in spec.ts has no data layer. */
export function readDataTasks(tasksText: string): string[] {
  return tasksText.split('\n').filter(l => /^- \[[ x]\]/.test(l) && /\[data\]/.test(l));
}

/** Body of a `## <name>` section, or null when the heading is absent. */
function section(text: string, name: string): string | null {
  const lines = text.split('\n');
  const at = lines.findIndex(l => new RegExp(`^##\\s+${name}\\s*$`, 'i').test(l.trim()));
  if (at < 0) return null;
  const rest = lines.slice(at + 1);
  const end = rest.findIndex(l => /^##\s/.test(l));
  return (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
}

/** Case-insensitive match that does not fire inside a longer word or path segment. */
function mentions(page: string, word: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(word)}($|[^a-z0-9])`, 'i').test(page);
}

/** Store names in the `## Stores` body: backticked names when present, else the text after `:` or `->` on each line. */
function storeNames(body: string): string[] {
  const names: string[] = [];
  for (const line of body.split('\n')) {
    const ticked = [...line.matchAll(/`([^`]+)`/g)].map(m => m[1].trim());
    if (ticked.length) names.push(...ticked);
    else {
      const m = /(?:->|:)\s*(.+)$/.exec(line.replace(/^\s*[-*]\s*/, ''));
      if (m && m[1].trim()) names.push(m[1].trim().replace(/[.;]$/, ''));
    }
  }
  return names;
}

function pathsIn(task: string): string[] {
  return [...task.matchAll(/`([^`\s]+\/[^`\s]*|[^`\s]+\.[a-z]{1,5})`/gi)].map(m => m[1]);
}

/** A task's file is allowed when the page names it or a directory above it. */
function pathListed(page: string, path: string): boolean {
  if (mentions(page, path)) return true;
  const parts = path.split('/');
  for (let n = parts.length - 1; n >= 1; n--) if (mentions(page, `${parts.slice(0, n).join('/')}/`)) return true;
  return false;
}

export function checkDataModel(projectDir: string, card: string): { problems: string[]; message?: string } {
  const dir = resolveSpecDir(projectDir, card);
  const specFile = specPath(projectDir, dir, 'spec.md');
  const tasksFile = specPath(projectDir, dir, 'tasks.md');
  const entities = existsSync(specFile) ? readEntities(readFileSync(specFile, 'utf-8')) : [];
  const dataTasks = existsSync(tasksFile) ? readDataTasks(readFileSync(tasksFile, 'utf-8')) : [];
  if (!entities.length && !dataTasks.length) return { problems: [], message: NO_DATA_CHANGE };

  const problems: string[] = [];
  const pagePath = join(projectDir, ARCHITECTURE_DATA_MODEL);
  const page = existsSync(pagePath) ? readFileSync(pagePath, 'utf-8') : null;
  if (page === null) problems.push(`${ARCHITECTURE_DATA_MODEL} is missing; run the architecture skill first`);

  const modelRel = `${dir}/data-model.md`;
  const modelFile = specPath(projectDir, modelRel);
  if (!existsSync(modelFile)) {
    problems.push(`${modelRel} is missing`);
  } else {
    const model = readFileSync(modelFile, 'utf-8');
    const entitiesBody = section(model, 'Entities');
    if (entitiesBody === null) problems.push(`${modelRel} has no ## Entities section`);
    else {
      for (const e of entities) {
        const line = entitiesBody.split('\n').find(l => mentions(l, e));
        if (!line) problems.push(`entity ${e} is not named in ## Entities of ${modelRel}`);
        else if (!/[:(]\s*\S/.test(line.slice(line.toLowerCase().indexOf(e.toLowerCase()) + e.length))) {
          problems.push(`entity ${e} in ## Entities of ${modelRel} lists no fields`);
        }
      }
    }
    const storesBody = section(model, 'Stores');
    if (storesBody === null) problems.push(`${modelRel} has no ## Stores section`);
    else {
      const stores = storeNames(storesBody);
      if (!stores.length) problems.push(`## Stores of ${modelRel} names no store`);
      if (page !== null) {
        for (const s of new Set(stores)) {
          if (!mentions(page, s)) {
            problems.push(`store ${s} is not in the architecture data-model page; add it there in this story or use one it names`);
          }
        }
      }
    }
    if (!section(model, 'Indexes')) problems.push(`${modelRel} has no ## Indexes section (write "none" when there are none)`);
    const migration = section(model, 'Migration');
    if (migration === null) problems.push(`${modelRel} has no ## Migration section`);
    else if (!migration || /^none\.?$/i.test(migration)) problems.push(`## Migration of ${modelRel} must say what runs, or "none" with why`);
  }

  if (page !== null) {
    for (const task of dataTasks) {
      for (const p of pathsIn(task)) {
        if (!pathListed(page, p)) problems.push(`[data] task names ${p}, which the architecture data-model page does not list as a store: ${task.trim()}`);
      }
    }
  }
  return { problems };
}
