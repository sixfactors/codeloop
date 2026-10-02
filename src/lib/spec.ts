import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { cardKey, findCard, findCardOrNone, readCards } from './cards.js';
import { annotateCard, RefusalError, type Role } from './engine.js';
import { cardNumber } from './lane.js';
import { withLock } from './lock.js';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const LAYERS = ['api', 'sdk', 'ui', 'test', 'docs'] as const;
const MAX_ACCEPTANCE = 5;

const TASK = /^- \[( |x)\] (T\d{3})( \[P\])?( \[(US\d+)\])? \[(api|sdk|ui|test|docs)\] (.+)$/;
const ACCEPTANCE = /^- (US\d+)[ :.]/;

export interface Task {
  id: string;
  done: boolean;
  parallel: boolean;
  accept?: string;
  layer: string;
  text: string;
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
}

/** `ref` is a card id or its number. A folder recorded on the card wins over a folder found by number. */
export function resolveSpecDir(projectDir: string, ref: string): string {
  const card = findCardOrNone(readCards(projectDir).cards, ref);
  if (card?.spec) return card.spec;
  const key = card ? cardKey(card) : cardNumber(ref);
  if (existsSync(join(projectDir, 'specs', key))) return `specs/${key}`;
  const specs = join(projectDir, 'specs');
  const found = existsSync(specs) ? readdirSync(specs).filter(d => d.startsWith(`${key}-`)) : [];
  if (found.length === 1) return `specs/${found[0]}`;
  throw new RefusalError(found.length ? `specs/${key}-* matches ${found.length} folders; pass the card id` : `no spec folder for ${ref}; run \`codeloop spec new <card-id>\``);
}

export function newSpec(projectDir: string, cardId: string, role: Role = 'agent'): { dir: string; created: string[] } {
  const card = findCard(readCards(projectDir).cards, cardId);
  const dir = card.spec ?? `specs/${cardKey(card)}-${slugify(card.title)}`;
  const created: string[] = [];
  mkdirSync(join(projectDir, dir), { recursive: true });
  for (const name of ['research.md', 'spec.md', 'plan.md', 'tasks.md']) {
    const dest = join(projectDir, dir, name);
    if (existsSync(dest)) continue;
    const template = readFileSync(join(PACKAGE_ROOT, 'templates/spec', name), 'utf-8');
    writeFileSync(dest, template.replaceAll('{{id}}', card.id).replaceAll('{{title}}', card.title));
    created.push(`${dir}/${name}`);
  }
  if (card.spec !== dir) annotateCard(projectDir, card.id, { spec: dir }, 'spec', { note: dir, role });
  return { dir, created };
}

function read(projectDir: string, dir: string, name: string): string {
  const file = join(projectDir, dir, name);
  if (!existsSync(file)) throw new RefusalError(`${dir}/${name} is missing`);
  return readFileSync(file, 'utf-8');
}

export function readTasks(projectDir: string, dir: string): { tasks: Task[]; malformed: string[] } {
  const tasks: Task[] = [];
  const malformed: string[] = [];
  for (const line of read(projectDir, dir, 'tasks.md').split('\n')) {
    if (!/^- \[[ x]\]/.test(line)) continue;
    const m = TASK.exec(line);
    if (m) tasks.push({ done: m[1] === 'x', id: m[2], parallel: !!m[3], accept: m[5], layer: m[6], text: m[7] });
    else malformed.push(line);
  }
  return { tasks, malformed };
}

export function readAcceptance(projectDir: string, dir: string): string[] {
  return read(projectDir, dir, 'spec.md').split('\n').map(l => ACCEPTANCE.exec(l)?.[1]).filter((id): id is string => !!id);
}

export function checkSpec(projectDir: string, dir: string): string[] {
  const acceptance = readAcceptance(projectDir, dir);
  const { tasks, malformed } = readTasks(projectDir, dir);
  const errors: string[] = [];
  if (acceptance.length === 0) errors.push(`${dir}/spec.md has no acceptance lines (\`- US1 Given ...\`)`);
  if (acceptance.length > MAX_ACCEPTANCE) errors.push(`${acceptance.length} acceptance lines, the limit is ${MAX_ACCEPTANCE}: split the card`);
  for (const line of malformed) errors.push(`untagged task (needs a T-number and one of [${LAYERS.join('|')}]): ${line}`);
  for (const us of acceptance) {
    if (!tasks.some(t => t.accept === us)) errors.push(`acceptance line ${us} has no task`);
  }
  for (const task of tasks) {
    if (task.accept && !acceptance.includes(task.accept)) errors.push(`task ${task.id} cites ${task.accept}, which spec.md does not have`);
  }
  return errors;
}

export function tickTask(projectDir: string, dir: string, taskId: string): void {
  const file = join(projectDir, dir, 'tasks.md');
  // Builders on different layers tick tasks in the same file at the same time.
  withLock(file, () => {
    const lines = read(projectDir, dir, 'tasks.md').split('\n');
    const index = lines.findIndex(l => TASK.exec(l)?.[2] === taskId);
    if (index < 0) throw new RefusalError(`task ${taskId} not found in ${dir}/tasks.md`);
    lines[index] = lines[index].replace('- [ ]', '- [x]');
    writeFileSync(file, lines.join('\n'));
  });
}
