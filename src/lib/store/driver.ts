import type { Artifact, Epic, Feature, Initiative, CardRecord, Evidence, Lane, Question, WikiPage } from './schema.js';

/**
 * Every stored item has an id. `version` is what the driver saw when it read the item and what a
 * write may expect: a content hash for most repos, the lane's own declared number for lanes.
 */
export interface Entity {
  id: string;
  version?: string | number;
}

export interface Query<T> {
  /** Every listed field must equal the item's; an array field matches when it contains the value. */
  where?: Partial<T>;
  sort?: { field: keyof T; dir?: 'asc' | 'desc' };
  limit?: number;
  /** The id of the last item already seen: results start after it, in the sorted order. */
  cursor?: string;
}

export interface Repo<T extends Entity> {
  get(id: string): Promise<T | undefined>;
  list(q?: Query<T>): Promise<T[]>;
  /** With `expectVersion`, the write is refused when the stored version has moved since that read. */
  put(item: T, expectVersion?: string | number): Promise<T>;
  remove(id: string): Promise<void>;
}

export interface KeyValue {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  all(): Promise<Record<string, unknown>>;
}

export type RepoName = 'cards' | 'lanes' | 'pages' | 'initiatives' | 'epics' | 'features' | 'questions' | 'evidence' | 'artifacts' | 'config';

export interface Change {
  repo: RepoName;
  /** Unset when the driver cannot tell which item moved, so the reader reloads the repo. */
  id?: string;
  /** The file that moved, from the project root, when a watcher saw it; a reader keyed by path patches that one file. */
  path?: string;
  at: string;
}

export interface Store {
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
  /** Changes as they land, from this process or another. Ends when `close` is called. */
  events(): AsyncIterable<Change>;
  /** Runs `fn` with the store held, so nothing else in this or another process writes between its reads and writes. */
  tx<T>(fn: (s: Store) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** The one the engine already throws from `writeCards`, so one catch covers a store write and an engine write. */
export { ConflictError } from '../cards.js';

const matches = (have: unknown, want: unknown): boolean => (Array.isArray(have) ? have.includes(want) : have === want);

/** Filter, sort, cursor and limit, in that order, the same for every driver. */
export function applyQuery<T extends Entity>(items: T[], q: Query<T> = {}): T[] {
  let out = items;
  if (q.where) {
    const wanted = Object.entries(q.where).filter(([, v]) => v !== undefined) as [keyof T, unknown][];
    out = out.filter(item => wanted.every(([k, v]) => matches(item[k], v)));
  }
  if (q.sort) {
    const { field, dir = 'asc' } = q.sort;
    const sign = dir === 'desc' ? -1 : 1;
    out = [...out].sort((a, b) => {
      const x = a[field];
      const y = b[field];
      if (x === y) return 0;
      if (x === undefined || x === null) return 1;
      if (y === undefined || y === null) return -1;
      return (x < y ? -1 : 1) * sign;
    });
  }
  if (q.cursor) {
    const at = out.findIndex(i => i.id === q.cursor);
    out = at < 0 ? [] : out.slice(at + 1);
  }
  if (q.limit !== undefined) out = out.slice(0, q.limit);
  return out;
}
