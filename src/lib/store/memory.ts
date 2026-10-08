import { createHash } from 'crypto';
import { clock } from '../clock.js';
import { applyQuery, type Change, type Entity, type KeyValue, type Query, type Repo, type RepoName, type Store } from './driver.js';
import type { Artifact, Epic, Feature, Initiative, CardRecord, Evidence, Lane, Question, WikiPage } from './schema.js';
import { ConflictError } from '../cards.js';

/** Versions are content hashes here too, so a test sees the same conflict a FileDriver would raise. */
const hashOf = (item: object) => createHash('sha1').update(JSON.stringify(item)).digest('hex');

class MemoryRepo<T extends Entity> implements Repo<T> {
  private items = new Map<string, T>();

  constructor(private name: RepoName, private emit: (change: Change) => void) {}

  async get(id: string): Promise<T | undefined> {
    return this.items.get(id);
  }

  async list(q?: Query<T>): Promise<T[]> {
    return applyQuery([...this.items.values()], q);
  }

  async put(item: T, expectVersion?: string | number): Promise<T> {
    const current = this.items.get(item.id);
    if (expectVersion !== undefined && current?.version !== expectVersion) {
      throw new ConflictError(`${this.name} ${item.id} changed since it was read (read version ${expectVersion}, now ${current?.version ?? 'none'}); re-read and retry`);
    }
    const { version: own, ...bare } = item;
    // A lane declares its own version number; everything else is versioned by its content.
    const stored = { ...bare, version: typeof own === 'number' ? own : hashOf(bare) } as T;
    this.items.set(item.id, stored);
    this.emit({ repo: this.name, id: item.id, at: clock().toISOString() });
    return stored;
  }

  async remove(id: string): Promise<void> {
    if (this.items.delete(id)) this.emit({ repo: this.name, id, at: clock().toISOString() });
  }
}

/** Nothing touches disk: for tests, and for an engine run against a board held only in memory. */
export class MemoryDriver implements Store {
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

  private values: Record<string, unknown> = {};
  private listeners = new Set<(c: Change) => void>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor() {
    const emit = (c: Change) => this.listeners.forEach(l => l(c));
    this.cards = new MemoryRepo<CardRecord>('cards', emit);
    this.lanes = new MemoryRepo<Lane>('lanes', emit);
    this.pages = new MemoryRepo<WikiPage>('pages', emit);
    this.initiatives = new MemoryRepo<Initiative>('initiatives', emit);
    this.epics = new MemoryRepo<Epic>('epics', emit);
    this.features = new MemoryRepo<Feature>('features', emit);
    this.questions = new MemoryRepo<Question>('questions', emit);
    this.evidence = new MemoryRepo<Evidence>('evidence', emit);
    this.artifacts = new MemoryRepo<Artifact>('artifacts', emit);
    this.config = {
      get: async key => this.values[key],
      set: async (key, value) => {
        this.values[key] = value;
        emit({ repo: 'config', id: key, at: clock().toISOString() });
      },
      all: async () => ({ ...this.values }),
    };
  }

  events(): AsyncIterable<Change> {
    const pending: Change[] = [];
    let wake: (() => void) | undefined;
    let closed = false;
    const listener = (c: Change) => {
      pending.push(c);
      wake?.();
    };
    this.listeners.add(listener);
    const listeners = this.listeners;
    return {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<Change>> {
            while (pending.length === 0 && !closed) await new Promise<void>(r => (wake = r));
            const value = pending.shift();
            return value ? { value, done: false } : { value: undefined, done: true };
          },
          async return(): Promise<IteratorResult<Change>> {
            closed = true;
            listeners.delete(listener);
            return { value: undefined, done: true };
          },
        };
      },
    };
  }

  // One transaction at a time in this process; the memory store is never shared across processes.
  tx<T>(fn: (s: Store) => Promise<T>): Promise<T> {
    const run = this.queue.then(() => fn(this));
    this.queue = run.catch(() => undefined);
    return run;
  }

  async close(): Promise<void> {
    this.listeners.clear();
  }
}
