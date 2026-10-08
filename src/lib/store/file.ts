import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, watch, writeFileSync, type FSWatcher } from 'fs';
import { basename, dirname, extname, join, relative, sep } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { cardKey, CARDS_PATH, ConflictError, findCardOrNone, readCards, RefusalError, writeCards, type Card } from '../cards.js';
import { clock } from '../clock.js';
import { CLOUD_COPY } from '../cloud.js';
import { CONFIG_FILE } from '../config.js';
import { EPICS_DIR, FEATURES_DIR, listEpics, listFeatures, loadEpic, loadFeature, parseEpic, parseFeature } from '../features.js';
import { interviewPath, parseQuestions, renderQuestions } from '../interview.js';
import { lanePath, LANES_DIR, loadLanes, parseLane, type Lane } from '../lane.js';
import { withLockAsync } from '../lock.js';
import { findMock, mockLineage, MOCKS_DIR } from '../mock.js';
import { parseFrontmatter } from '../skills.js';
import { WIKI_DIR } from '../wiki.js';
import { applyQuery, type Change, type Entity, type KeyValue, type Query, type Repo, type RepoName, type Store } from './driver.js';
import type { Artifact, Epic, Feature, Initiative, CardRecord, Evidence, EvidenceKind, Question, WikiPage } from './schema.js';

export const STORE_FILE = '.codeloop/store.json';
export const BETS_DIR = `${WIKI_DIR}/initiatives`;
export const EVIDENCE_DIR = 'evidence';
export const ARTIFACTS_DIR = 'docs/artifacts';
const SPECS_DIR = 'specs';

const sha1 = (text: string | Buffer) => createHash('sha1').update(text).digest('hex');
const readText = (file: string) => readFileSync(file, 'utf-8');
const toPosix = (path: string) => path.split(sep).join('/');

function walkMarkdown(root: string, dir = root): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .flatMap(name => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return walkMarkdown(root, full);
      return name.endsWith('.md') && !name.endsWith(CLOUD_COPY) ? [full] : [];
    });
}

function frontmatterText(data: Record<string, unknown>, body: string): string {
  const head = Object.keys(data).length ? `---\n${stringifyYaml(data)}---\n\n` : '';
  return `${head}${body.trimEnd()}\n`;
}

/** A read-only repo: its files are made by a command (`verify`, `mock new`), not by a store write. */
abstract class ReadOnlyRepo<T extends Entity> implements Repo<T> {
  constructor(protected what: string, protected how: string) {}
  abstract list(q?: Query<T>): Promise<T[]>;
  async get(id: string): Promise<T | undefined> {
    return (await this.list()).find(i => i.id === id);
  }
  async put(): Promise<T> {
    throw new RefusalError(`${this.what} is written by ${this.how}, not by the store`);
  }
  async remove(): Promise<void> {
    throw new RefusalError(`${this.what} is written by ${this.how}, not by the store`);
  }
}

/**
 * The store over the files codeloop already keeps. Every read and write goes through the same
 * functions the CLI uses, so nothing changes on disk the day the store arrives. A version is the
 * sha1 of the file an item lives in; a write that expects an older one is refused.
 */
export class FileDriver implements Store {
  cards: Repo<CardRecord>;
  lanes: Repo<Lane>;
  pages: Repo<WikiPage>;
  initiatives: Repo<Initiative>;
  epics: Repo<Epic>;
  features: Repo<Feature>;
  questions: Repo<Question>;
  evidence: Repo<Evidence>;
  artifacts: Repo<Artifact>;
  config: KeyValue;

  private listeners = new Set<(c: Change) => void>();
  private watchers: FSWatcher[] = [];

  constructor(public readonly projectDir: string) {
    const emit = (repo: RepoName, id?: string) => {
      const change: Change = { repo, ...(id ? { id } : {}), at: clock().toISOString() };
      this.listeners.forEach(l => l(change));
    };
    this.cards = new CardsRepo(projectDir, emit);
    this.lanes = new LanesRepo(projectDir, emit);
    this.pages = new PagesRepo(projectDir, emit);
    this.initiatives = new BetsRepo(projectDir, emit);
    this.epics = new PlanPageRepo<Epic>(projectDir, emit, 'epics', EPICS_DIR, loadEpic, parseEpic);
    this.features = new PlanPageRepo<Feature>(projectDir, emit, 'features', FEATURES_DIR, loadFeature, parseFeature);
    this.questions = new QuestionsRepo(projectDir, emit);
    this.evidence = new EvidenceRepo(projectDir);
    this.artifacts = new ArtifactsRepo(projectDir);
    this.config = new ConfigValues(projectDir, emit);
  }

  /**
   * Changes from this process arrive as they are written; changes from another process arrive
   * from the file watcher, without an id when a whole folder moved.
   */
  events(): AsyncIterable<Change> {
    const pending: Change[] = [];
    let wake: (() => void) | undefined;
    let closed = false;
    const listener = (c: Change) => {
      pending.push(c);
      wake?.();
    };
    this.listeners.add(listener);
    this.watch();
    const stop = () => {
      closed = true;
      this.listeners.delete(listener);
      wake?.();
    };
    return {
      [Symbol.asyncIterator]: () => ({
        next: async (): Promise<IteratorResult<Change>> => {
          while (pending.length === 0 && !closed) await new Promise<void>(r => (wake = r));
          const value = pending.shift();
          return value ? { value, done: false } : { value: undefined, done: true };
        },
        return: async (): Promise<IteratorResult<Change>> => {
          stop();
          return { value: undefined, done: true };
        },
      }),
    };
  }

  private watch(): void {
    if (this.watchers.length) return;
    for (const dir of ['.codeloop', SPECS_DIR, EVIDENCE_DIR, 'docs']) {
      const full = join(this.projectDir, dir);
      if (!existsSync(full)) continue;
      try {
        const watcher = watch(full, { recursive: true }, (_event, name) => {
          const path = name ? toPosix(`${dir}/${name}`) : dir;
          const repo = repoFor(path);
          if (repo) this.listeners.forEach(l => l({ repo, path, at: clock().toISOString() }));
        });
        watcher.on('error', () => undefined);
        // A watcher alone never keeps the process alive: a server has its socket, a CLI run ends.
        watcher.unref();
        this.watchers.push(watcher);
      } catch {
        // A platform without recursive watch still gets this process's own changes.
      }
    }
  }

  // The store's own lock, not cards.json's: the engine functions called inside take that one
  // themselves and a lock held twice by one process never releases.
  tx<T>(fn: (s: Store) => Promise<T>): Promise<T> {
    return withLockAsync(join(this.projectDir, STORE_FILE), () => fn(this));
  }

  async close(): Promise<void> {
    for (const w of this.watchers) w.close();
    this.watchers = [];
    this.listeners.clear();
  }
}

/** Which repo a changed path belongs to, or undefined for a file the store does not serve (lock files, state). */
export function repoFor(path: string): RepoName | undefined {
  if (path.endsWith('.lock') || path.endsWith('.tmp')) return undefined;
  if (path === CARDS_PATH) return 'cards';
  if (path === CONFIG_FILE) return 'config';
  if (path.startsWith(`${LANES_DIR}/`)) return 'lanes';
  if (path.startsWith(`${BETS_DIR}/`)) return 'initiatives';
  if (path.startsWith(`${EPICS_DIR}/`)) return 'epics';
  if (path.startsWith(`${FEATURES_DIR}/`)) return 'features';
  if (path.startsWith(`${WIKI_DIR}/`)) return 'pages';
  if (path.startsWith(`${SPECS_DIR}/`)) return path.endsWith('/interview.md') ? 'questions' : path.endsWith('.md') ? 'pages' : undefined;
  if (path.startsWith(`${EVIDENCE_DIR}/`)) return 'evidence';
  if (path.startsWith(`${MOCKS_DIR}/`) || path.startsWith(`${ARTIFACTS_DIR}/`)) return 'artifacts';
  return undefined;
}

type Emit = (repo: RepoName, id?: string) => void;

class CardsRepo implements Repo<CardRecord> {
  constructor(private projectDir: string, private emit: Emit) {}

  private read(): { file: ReturnType<typeof readCards>; version: string } {
    const path = join(this.projectDir, CARDS_PATH);
    return { file: readCards(this.projectDir), version: existsSync(path) ? sha1(readFileSync(path)) : sha1('') };
  }

  async get(id: string): Promise<CardRecord | undefined> {
    const { file, version } = this.read();
    const card = findCardOrNone(file.cards, id);
    return card && { ...card, version };
  }

  async list(q?: Query<CardRecord>): Promise<CardRecord[]> {
    const { file, version } = this.read();
    return applyQuery(file.cards.map(c => ({ ...c, version })), q);
  }

  // `writeCards` is the compare-and-swap the engine already has: the file's own counter is checked
  // under its lock, so a write from a stale read fails there even when no version was expected here.
  async put(item: CardRecord, expectVersion?: string | number): Promise<CardRecord> {
    const { file, version } = this.read();
    if (expectVersion !== undefined && expectVersion !== version) {
      throw new ConflictError(`cards.json changed since ${item.id} was read (read version ${expectVersion}, now ${version}); re-read and retry`);
    }
    const { version: _v, ...card } = item;
    const cards = file.cards.some(c => c.id === card.id) ? file.cards.map(c => (c.id === card.id ? card : c)) : [...file.cards, card];
    writeCards(this.projectDir, file, cards);
    this.emit('cards', card.id);
    return (await this.get(card.id))!;
  }

  async remove(id: string): Promise<void> {
    const { file } = this.read();
    if (!file.cards.some(c => c.id === id)) return;
    writeCards(this.projectDir, file, file.cards.filter(c => c.id !== id));
    this.emit('cards', id);
  }
}

/** A lane's version is the number it declares, bumped by `lane promote`; a put expecting an older one is refused. */
class LanesRepo implements Repo<Lane> {
  constructor(private projectDir: string, private emit: Emit) {}

  async get(id: string): Promise<Lane | undefined> {
    const file = lanePath(this.projectDir, id);
    return existsSync(file) ? parseLane(readText(file)) : undefined;
  }

  async list(q?: Query<Lane>): Promise<Lane[]> {
    return applyQuery(loadLanes(this.projectDir), q);
  }

  async put(item: Lane, expectVersion?: string | number): Promise<Lane> {
    const current = await this.get(item.id);
    if (expectVersion !== undefined && current?.version !== expectVersion) {
      throw new ConflictError(`lane ${item.id} changed since it was read (read version ${expectVersion}, now ${current?.version ?? 'none'}); re-read and retry`);
    }
    const file = lanePath(this.projectDir, item.id);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, stringifyYaml(item));
    this.emit('lanes', item.id);
    return parseLane(readText(file));
  }

  async remove(id: string): Promise<void> {
    const file = lanePath(this.projectDir, id);
    if (!existsSync(file)) return;
    rmSync(file);
    this.emit('lanes', id);
  }
}

/** Markdown under .codeloop/wiki and specs, one page per file, keyed by the path from the project root. */
class PagesRepo implements Repo<WikiPage> {
  constructor(private projectDir: string, private emit: Emit) {}

  private files(): string[] {
    return [...walkMarkdown(join(this.projectDir, WIKI_DIR)), ...walkMarkdown(join(this.projectDir, SPECS_DIR))].filter(f => basename(f) !== 'INDEX.md');
  }

  private load(file: string): WikiPage {
    const text = readText(file);
    const { data, body } = parseFrontmatter(text);
    const id = toPosix(relative(this.projectDir, file));
    const folder = id.startsWith(`${WIKI_DIR}/`) ? dirname(id.slice(WIKI_DIR.length + 1)).replace(/^\.$/, '') : dirname(id);
    const heading = /^#\s+(.+)$/m.exec(body)?.[1];
    return { id, folder, title: String(data.title ?? heading ?? basename(id, '.md')), frontmatter: data, body: body.trim(), version: sha1(text) };
  }

  private fileFor(id: string): string {
    const safe = toPosix(id);
    if (safe.includes('..') || !safe.endsWith('.md') || !(safe.startsWith(`${WIKI_DIR}/`) || safe.startsWith(`${SPECS_DIR}/`))) {
      throw new RefusalError(`page "${id}" is not under ${WIKI_DIR}/ or ${SPECS_DIR}/`);
    }
    return join(this.projectDir, safe);
  }

  async get(id: string): Promise<WikiPage | undefined> {
    const file = this.fileFor(id);
    return existsSync(file) ? this.load(file) : undefined;
  }

  async list(q?: Query<WikiPage>): Promise<WikiPage[]> {
    return applyQuery(this.files().map(f => this.load(f)), q);
  }

  async put(item: WikiPage, expectVersion?: string | number): Promise<WikiPage> {
    const file = this.fileFor(item.id);
    const current = existsSync(file) ? sha1(readText(file)) : undefined;
    if (expectVersion !== undefined && current !== expectVersion) {
      throw new ConflictError(`${item.id} changed since it was read (read version ${expectVersion}, now ${current ?? 'none'}); re-read and retry`);
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, frontmatterText(item.frontmatter, item.body));
    this.emit('pages', item.id);
    return this.load(file);
  }

  async remove(id: string): Promise<void> {
    const file = this.fileFor(id);
    if (!existsSync(file)) return;
    rmSync(file);
    this.emit('pages', id);
  }
}

/** `.codeloop/wiki/initiatives/<id>.md`: frontmatter fields on the initiative, the body is its hypothesis. */
class BetsRepo implements Repo<Initiative> {
  constructor(private projectDir: string, private emit: Emit) {}

  private fileFor(id: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) throw new RefusalError(`initiative id "${id}" is not a plain name`);
    return join(this.projectDir, BETS_DIR, `${id}.md`);
  }

  private load(file: string): Initiative {
    const text = readText(file);
    const { data, body } = parseFrontmatter(text);
    const id = basename(file, '.md');
    const field = (key: string) => (data[key] === undefined ? {} : { [key]: String(data[key]) });
    return { id, title: String(data.title ?? id), ...field('status'), ...field('metric'), ...field('goal'), ...field('persona'), hypothesis: body.trim(), version: sha1(text) };
  }

  async get(id: string): Promise<Initiative | undefined> {
    const file = this.fileFor(id);
    return existsSync(file) ? this.load(file) : undefined;
  }

  async list(q?: Query<Initiative>): Promise<Initiative[]> {
    return applyQuery(walkMarkdown(join(this.projectDir, BETS_DIR)).map(f => this.load(f)), q);
  }

  async put(item: Initiative, expectVersion?: string | number): Promise<Initiative> {
    const file = this.fileFor(item.id);
    const current = existsSync(file) ? sha1(readText(file)) : undefined;
    if (expectVersion !== undefined && current !== expectVersion) {
      throw new ConflictError(`initiative ${item.id} changed since it was read (read version ${expectVersion}, now ${current ?? 'none'}); re-read and retry`);
    }
    const { id: _id, version: _v, hypothesis, ...data } = item;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, frontmatterText(Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)), hypothesis));
    this.emit('initiatives', item.id);
    return this.load(file);
  }

  async remove(id: string): Promise<void> {
    const file = this.fileFor(id);
    if (!existsSync(file)) return;
    rmSync(file);
    this.emit('initiatives', id);
  }
}

/**
 * `.codeloop/wiki/epics/<id>.md` and `.codeloop/wiki/features/<id>.md`: frontmatter fields on the
 * item, the body is its description. A page that fails its schema is refused on read, so a bad
 * frontmatter surfaces where it was written rather than as a missing row.
 */
class PlanPageRepo<T extends Epic | Feature> implements Repo<T> {
  constructor(
    private projectDir: string,
    private emit: Emit,
    private name: 'epics' | 'features',
    private dir: string,
    private load: (file: string) => T,
    private parse: (data: Record<string, unknown>) => T,
  ) {}

  private fileFor(id: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) throw new RefusalError(`${this.name.replace(/s$/, '')} id "${id}" is not a plain name`);
    return join(this.projectDir, this.dir, `${id}.md`);
  }

  async get(id: string): Promise<T | undefined> {
    const file = this.fileFor(id);
    return existsSync(file) ? this.load(file) : undefined;
  }

  async list(q?: Query<T>): Promise<T[]> {
    return applyQuery((this.name === 'epics' ? listEpics(this.projectDir) : listFeatures(this.projectDir)) as T[], q);
  }

  async put(item: T, expectVersion?: string | number): Promise<T> {
    const file = this.fileFor(item.id);
    const current = existsSync(file) ? sha1(readText(file)) : undefined;
    if (expectVersion !== undefined && current !== expectVersion) {
      throw new ConflictError(`${this.name.replace(/s$/, '')} ${item.id} changed since it was read (read version ${expectVersion}, now ${current ?? 'none'}); re-read and retry`);
    }
    let valid: T;
    try {
      valid = this.parse(item);
    } catch (e) {
      const z = e as { issues?: { path: (string | number)[]; message: string }[] };
      throw new RefusalError(`${this.name.replace(/s$/, '')} ${item.id}: ${z.issues ? z.issues.map(i => `${i.path.join('.') || 'page'} ${i.message}`).join('; ') : (e as Error).message}`);
    }
    const { id: _id, version: _v, body, ...data } = valid;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, frontmatterText(Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)), body));
    this.emit(this.name, item.id);
    return this.load(file);
  }

  async remove(id: string): Promise<void> {
    const file = this.fileFor(id);
    if (!existsSync(file)) return;
    rmSync(file);
    this.emit(this.name, id);
  }
}

/** Every card's interview.md, one item per question, keyed `<cardId>#<n>`. */
class QuestionsRepo implements Repo<Question> {
  constructor(private projectDir: string, private emit: Emit) {}

  private file(card: Card): string | undefined {
    const path = interviewPath(this.projectDir, card);
    return path ? join(this.projectDir, path) : undefined;
  }

  private ofCard(card: Card): Question[] {
    const file = this.file(card);
    if (!file || !existsSync(file)) return [];
    const text = readText(file);
    return parseQuestions(text).map(q => ({ id: `${card.id}#${q.n}`, cardId: card.id, ...q, version: sha1(text) }));
  }

  async get(id: string): Promise<Question | undefined> {
    const [cardId] = id.split('#');
    const card = findCardOrNone(readCards(this.projectDir).cards, cardId);
    return card && this.ofCard(card).find(q => q.id === id);
  }

  async list(q?: Query<Question>): Promise<Question[]> {
    return applyQuery(readCards(this.projectDir).cards.flatMap(c => this.ofCard(c)), q);
  }

  async put(item: Question, expectVersion?: string | number): Promise<Question> {
    const card = findCardOrNone(readCards(this.projectDir).cards, item.cardId);
    const file = card && this.file(card);
    if (!card || !file) throw new RefusalError(`${item.cardId} has no spec folder to hold questions; \`codeloop ask ${item.cardId} "<question>"\` makes one`);
    const text = existsSync(file) ? readText(file) : '';
    if (expectVersion !== undefined && sha1(text) !== expectVersion) {
      throw new ConflictError(`${card.id}'s questions changed since they were read (read version ${expectVersion}, now ${sha1(text)}); re-read and retry`);
    }
    const rest = parseQuestions(text).filter(q => q.n !== item.n);
    const next = [...rest, { n: item.n, question: item.question, recommended: item.recommended, answer: item.answer }].sort((a, b) => a.n - b.n);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, renderQuestions(next));
    this.emit('questions', item.id);
    return (await this.get(`${card.id}#${item.n}`))!;
  }

  async remove(id: string): Promise<void> {
    const [cardId, n] = id.split('#');
    const card = findCardOrNone(readCards(this.projectDir).cards, cardId);
    const file = card && this.file(card);
    if (!file || !existsSync(file)) return;
    writeFileSync(file, renderQuestions(parseQuestions(readText(file)).filter(q => q.n !== Number(n))));
    this.emit('questions', id);
  }
}

const KIND_BY_EXT: Record<string, EvidenceKind> = { '.md': 'md', '.json': 'json', '.txt': 'txt', '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.gif': 'image', '.svg': 'image', '.webp': 'image' };

class EvidenceRepo extends ReadOnlyRepo<Evidence> {
  constructor(private projectDir: string) {
    super('evidence', '`codeloop verify`');
  }

  async list(q?: Query<Evidence>): Promise<Evidence[]> {
    const root = join(this.projectDir, EVIDENCE_DIR);
    if (!existsSync(root)) return [];
    const { cards } = readCards(this.projectDir);
    const items = readdirSync(root)
      .filter(d => statSync(join(root, d)).isDirectory())
      .sort()
      .map(nnn => {
        const files = readdirSync(join(root, nnn))
          .filter(f => statSync(join(root, nnn, f)).isFile())
          .sort()
          .map(name => ({ name, kind: KIND_BY_EXT[extname(name).toLowerCase()] ?? 'other', path: `${EVIDENCE_DIR}/${nnn}/${name}` }));
        const cardId = cards.find(c => cardKey(c) === nnn || c.id.toLowerCase() === nnn.toLowerCase())?.id;
        // The folder's version moves when any file in it is added, removed or rewritten.
        const version = sha1(files.map(f => `${f.name}:${statSync(join(root, nnn, f.name)).mtimeMs}`).join('\n'));
        return { id: nnn, ...(cardId ? { cardId } : {}), files, version };
      });
    return applyQuery(items, q);
  }
}

class ArtifactsRepo extends ReadOnlyRepo<Artifact> {
  constructor(private projectDir: string) {
    super('artifacts', '`codeloop mock new` and the docs/artifacts folder');
  }

  async list(q?: Query<Artifact>): Promise<Artifact[]> {
    const { cards } = readCards(this.projectDir);
    const title = (html: string, fallback: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1].trim() || fallback;
    const mocks: Artifact[] = cards.flatMap(card => {
      const path = findMock(this.projectDir, card.id);
      if (!path) return [];
      const html = readText(join(this.projectDir, path));
      const [, project, topic] = path.split('/').slice(1);
      const lineage = mockLineage(html);
      return [{ id: path, kind: 'mock', project, topic, cardId: card.id, ...(lineage[1] ? { from: lineage[1] } : {}), ...(lineage.length ? { lineage } : {}), title: card.title, version: sha1(html) }];
    });
    const dir = join(this.projectDir, ARTIFACTS_DIR);
    const pages: Artifact[] = existsSync(dir)
      ? readdirSync(dir)
          .filter(f => f.endsWith('.html'))
          .sort()
          .map(f => {
            const html = readText(join(dir, f));
            return { id: `${ARTIFACTS_DIR}/${f}`, kind: 'artifact', title: title(html, basename(f, '.html')), version: sha1(html) };
          })
      : [];
    return applyQuery([...mocks, ...pages], q);
  }
}

/** config.yaml alone. local.yaml holds keys and tokens and is never served, so it is not read here. */
class ConfigValues implements KeyValue {
  constructor(private projectDir: string, private emit: Emit) {}

  private read(): Record<string, unknown> {
    const file = join(this.projectDir, CONFIG_FILE);
    const parsed = existsSync(file) ? parseYaml(readText(file)) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  }

  async get(key: string): Promise<unknown> {
    return this.read()[key];
  }

  async set(key: string, value: unknown): Promise<void> {
    const file = join(this.projectDir, CONFIG_FILE);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, stringifyYaml({ ...this.read(), [key]: value }));
    this.emit('config', key);
  }

  async all(): Promise<Record<string, unknown>> {
    return this.read();
  }
}
