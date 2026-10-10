import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { withLock } from './lock.js';

// This module must not import cards.ts: cards.ts calls it on every write.
export const CLOUD_FILE = '.codeloop/cloud.json';
export const SYNC_FILE = '.codeloop/state/sync.json';
const STATE_DIR = '.codeloop';
const BOARD = 'cards.json';
const CONFIG = 'config.yaml';
const DEFAULT_FOLDER = 'codeloop';
const WIKI_FOLDERS = ['gotchas', 'decisions', 'concepts', 'competitors'];
const WIKI_TITLE = new RegExp(`\\((${WIKI_FOLDERS.join('|')})/([^)/]+\\.md)\\)$`);
const LANE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.yaml$/;
/** A wiki page changed on both sides: the cloud version is written beside the local one under this suffix. */
export const CLOUD_COPY = '.cloud.md';
const EMPTY_BOARD = JSON.stringify({ version: 0, cards: [] }, null, 2) + '\n';
const SYNC_TIMEOUT_MS = 10_000;

export type DocKind = 'board' | 'config' | 'lane' | 'wiki';
export type DocState = 'in-sync' | 'local-ahead' | 'cloud-ahead' | 'both-changed';

export interface SyncEntry {
  kind: DocKind;
  /** Empty until the first write reaches the cloud. */
  pageId: string;
  /** The page revision this checkout last saw. Every write to the page expects it. */
  revision: number;
  /** sha256 of the local file when it last matched the page at `revision`; null when it never has. */
  hash: string | null;
  /** A write that was kept locally because the cloud could not be reached. Pushed first by the next command. */
  pending?: boolean;
  /** Local and cloud differed when they first met and neither has been taken. */
  diverged?: boolean;
}

export interface SyncFile {
  /** Keyed by the path under .codeloop: cards.json, config.yaml, lanes/<lane>.yaml, wiki/<folder>/<page>.md. */
  documents: Record<string, SyncEntry>;
}

export interface CloudConfig {
  url: string;
  key: string;
  workspaceName?: string;
  boardTitle: string;
  /** Root folder in the workspace. Lanes go in `<folder>/<folder>-lanes`, wiki pages in `<folder>/<folder>-wiki`. */
  folder?: string;
}

export class CloudError extends Error {}
/** The page moved on since this project last saw it: someone else wrote first. */
export class CloudConflictError extends CloudError {}

const unreachable = (e: unknown): e is CloudError => e instanceof CloudError && !(e instanceof CloudConflictError) && e.message.startsWith('cloud store unreachable');
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

export function loadCloud(projectDir: string): CloudConfig | null {
  const file = join(projectDir, CLOUD_FILE);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf-8')) as CloudConfig) : null;
}

function saveCloud(projectDir: string, config: CloudConfig): void {
  const file = join(projectDir, CLOUD_FILE);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

export function loadSync(projectDir: string): SyncFile {
  const file = join(projectDir, SYNC_FILE);
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf-8')) as SyncFile;
  // A connection made before sync.json existed kept its page refs in cloud.json.
  const old = loadCloud(projectDir) as (CloudConfig & { board?: { pageId: string; revision: number }; wiki?: Record<string, { pageId: string; revision: number }> }) | null;
  const documents: Record<string, SyncEntry> = {};
  if (old?.board) documents[BOARD] = { kind: 'board', ...old.board, hash: null };
  for (const [path, ref] of Object.entries(old?.wiki ?? {})) documents[`wiki/${path}`] = { kind: 'wiki', ...ref, hash: null };
  return { documents };
}

function saveSync(projectDir: string, sync: SyncFile): void {
  const file = join(projectDir, SYNC_FILE);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.${process.pid}.tmp`, JSON.stringify(sync, null, 2) + '\n');
  renameSync(`${file}.${process.pid}.tmp`, file);
}

// Card writes are synchronous everywhere, and Node has no synchronous HTTP. Each call runs this
// script in a child process; the key goes in on stdin so it never appears in a process listing.
const BRIDGE = `
const chunks = []; for await (const c of process.stdin) chunks.push(c);
const { url, key, calls, timeoutMs } = JSON.parse(Buffer.concat(chunks).toString());
const post = async (body, attempt = 0) => {
  const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(timeoutMs), headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer ' + key }, body: JSON.stringify(body) });
  const text = await res.text();
  // The endpoint rate-limits; it says how long to wait.
  if (res.status === 429 && attempt < 6) {
    await new Promise(r => setTimeout(r, (Number(res.headers.get('retry-after')) || 2) * 1000));
    return post(body, attempt + 1);
  }
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + text.slice(0, 200));
  const line = text.split('\\n').find(l => l.startsWith('data:'));
  return JSON.parse(line ? line.slice(5) : text);
};
process.on('uncaughtException', e => { console.error(e.cause?.code ?? e.message); process.exit(1); });
// The endpoint answers a tool call with no handshake and allows 60 requests a minute, so the
// handshake is sent only to a server that asks for it.
const handshake = () => post({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'codeloop', version: '0' } } });
const wantsHandshake = text => /not initialized|initialize first|session/i.test(text);
const out = []; let id = 1; let greeted = false;
for (const c of calls) {
  const body = { jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name: c.name, arguments: c.args } };
  let reply;
  try {
    reply = await post(body);
  } catch (e) {
    if (greeted || !wantsHandshake(e.message)) throw e;
  }
  if (!greeted && (!reply || (reply.error && wantsHandshake(reply.error.message ?? '')))) {
    await handshake();
    greeted = true;
    reply = await post(body);
  }
  out.push(reply);
}
process.stdout.write(JSON.stringify(out));
`;

type Call = { name: string; args: Record<string, unknown> };

/** Runs tool calls in order and returns each one's `data`. Throws CloudConflictError on VERSION_CONFLICT. */
export function callTools(conn: { url: string; key: string }, calls: Call[], timeoutMs = 60_000): any[] {
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', BRIDGE], {
    input: JSON.stringify({ url: conn.url, key: conn.key, calls, timeoutMs }),
    encoding: 'utf-8',
    timeout: 120_000,
  });
  if (run.status !== 0) throw new CloudError(`cloud store unreachable at ${conn.url}: ${(run.stderr ?? '').trim().split('\n').at(-1) ?? 'no response'}`);
  return (JSON.parse(run.stdout) as any[]).map((rpc, i) => {
    const text: string = rpc.result?.content?.[0]?.text ?? rpc.error?.message ?? '';
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      throw new CloudError(`${calls[i].name}: ${text || 'empty response'}`);
    }
    const result = body.result ?? body;
    if (result.success === false || rpc.result?.isError || body.status === 'action_not_allowed') {
      const message = `${calls[i].name}: ${result.error ?? body.message ?? text}`;
      throw String(message).includes('VERSION_CONFLICT') ? new CloudConflictError(message) : new CloudError(message);
    }
    return result.data ?? result;
  });
}

interface Remote {
  id: string;
  title: string;
  revision: number;
  folderId?: string;
}

interface Folder {
  id: string;
  name: string;
  children?: Folder[];
}

function listPages(config: CloudConfig, timeoutMs?: number): { pages: Remote[]; folders: Folder[] } {
  const [data] = callTools(config, [{ name: 'KNOWLEDGE_LIST_PAGES', args: {} }], timeoutMs);
  const pages = ((data.pages ?? []) as { id: string; title: string; latestRevisionN: number; folderId?: string }[]).map(p => ({ id: p.id, title: p.title, revision: p.latestRevisionN, folderId: p.folderId }));
  return { pages, folders: data.folders ?? [] };
}

function readPages(config: CloudConfig, ids: string[]): Map<string, { content: string; revision: number }> {
  const data = ids.length ? callTools(config, ids.map(pageId => ({ name: 'KNOWLEDGE_READ_PAGE', args: { pageId } }))) : [];
  return new Map(ids.map((id, i) => [id, { content: data[i].content ?? '', revision: data[i].latestRevisionN }]));
}

const rootFolder = (config: CloudConfig) => config.folder ?? DEFAULT_FOLDER;
// The workspace files a page under an existing folder of the same name wherever that folder sits,
// so a plain `wiki` or `lanes` would be shared with every other project. The root name is repeated
// in the subfolder name to keep each project's pages together.
const subFolder = (config: CloudConfig, name: string) => `${rootFolder(config)}/${rootFolder(config).replace(/^.*\//, '')}-${name}`;

function folderId(folders: Folder[], name: string): string | undefined {
  for (const folder of folders) {
    const id = folder.name === name ? folder.id : folderId(folder.children ?? [], name);
    if (id) return id;
  }
  return undefined;
}

// The path rides in the title so a pull into another checkout can put the file back where it was.
function wikiTitle(rel: string, content: string): string {
  const title = /^title:\s*(.+)$/m.exec(content)?.[1].replace(/^["']|["']$/g, '') ?? rel.replace(/^.*\//, '').replace(/\.md$/, '');
  return `${title} (${rel})`;
}

function kindOf(path: string): DocKind {
  return path === BOARD ? 'board' : path === CONFIG ? 'config' : path.startsWith('lanes/') ? 'lane' : 'wiki';
}

function page(config: CloudConfig, path: string, content: string): { title: string; folder: string } {
  const root = rootFolder(config);
  switch (kindOf(path)) {
    case 'board': return { title: config.boardTitle, folder: root };
    case 'config': return { title: `${config.boardTitle}: ${CONFIG}`, folder: root };
    case 'lane': return { title: `${config.boardTitle}: ${path}`, folder: subFolder(config, 'lanes') };
    case 'wiki': return { title: wikiTitle(path.replace(/^wiki\//, ''), content), folder: subFolder(config, 'wiki') };
  }
}

/** The local path a page belongs to, or undefined for a page that is not one of this project's documents. */
function pathOf(config: CloudConfig, remote: Remote, wikiFolder: string | undefined): string | undefined {
  if (remote.title === config.boardTitle) return BOARD;
  const prefix = `${config.boardTitle}: `;
  if (remote.title.startsWith(prefix)) {
    const rest = remote.title.slice(prefix.length);
    if (rest === CONFIG) return CONFIG;
    if (rest.startsWith('lanes/') && LANE_FILE.test(rest.slice(6))) return rest;
    return undefined;
  }
  // Titles are shared across the workspace, so a wiki page counts only when it sits in this project's wiki folder.
  const m = WIKI_TITLE.exec(remote.title);
  return m && wikiFolder && remote.folderId === wikiFolder ? `wiki/${m[1]}/${m[2]}` : undefined;
}

const abs = (projectDir: string, path: string) => join(projectDir, STATE_DIR, path);

function localPaths(projectDir: string): string[] {
  const paths = [BOARD];
  if (existsSync(abs(projectDir, CONFIG))) paths.push(CONFIG);
  const lanes = abs(projectDir, 'lanes');
  if (existsSync(lanes)) paths.push(...readdirSync(lanes).filter(f => LANE_FILE.test(f)).sort().map(f => `lanes/${f}`));
  for (const folder of WIKI_FOLDERS) {
    const dir = abs(projectDir, `wiki/${folder}`);
    if (existsSync(dir)) paths.push(...readdirSync(dir).filter(f => f.endsWith('.md') && !f.endsWith(CLOUD_COPY)).sort().map(f => `wiki/${folder}/${f}`));
  }
  return paths;
}

function readLocal(projectDir: string, path: string): string | null {
  const file = abs(projectDir, path);
  return existsSync(file) ? readFileSync(file, 'utf-8') : null;
}

const copyPath = (projectDir: string, path: string) => abs(projectDir, path.replace(/\.md$/, CLOUD_COPY));

// Compared as data: the store trims trailing whitespace from what it hands back.
function same(kind: DocKind, a: string, b: string): boolean {
  if (kind !== 'board') return a.trimEnd() === b.trimEnd();
  try {
    return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b));
  } catch {
    return false;
  }
}

interface Row {
  path: string;
  kind: DocKind;
  /** null when the file does not exist. */
  local: string | null;
  entry?: SyncEntry;
  remote?: Remote;
  state: DocState;
}

interface Session {
  projectDir: string;
  config: CloudConfig;
  sync: SyncFile;
  rows: Row[];
  notes: string[];
}

function stateOf(projectDir: string, row: Row): DocState {
  const { entry, remote, kind } = row;
  if (!remote) return 'local-ahead';
  if (!entry) return row.local === null ? 'cloud-ahead' : 'both-changed';
  if (entry.diverged || (kind === 'wiki' && existsSync(copyPath(projectDir, row.path)))) return 'both-changed';
  // A file that is not here has nothing local to lose. A board that was never written is the
  // empty board, so it is compared like any other once it has matched the page.
  if (row.local === null && (entry.hash === null || kind !== 'board')) return 'cloud-ahead';
  const localChanged = !!entry.pending || sha(row.local ?? EMPTY_BOARD) !== entry.hash;
  const cloudChanged = remote.revision !== entry.revision;
  return localChanged ? (cloudChanged ? 'both-changed' : 'local-ahead') : cloudChanged ? 'cloud-ahead' : 'in-sync';
}

/**
 * One listing of the workspace against the local files and the sync record. A local file that
 * meets a page it has no record of is read once: identical content is recorded as in sync.
 */
function open(projectDir: string, config: CloudConfig, sync: SyncFile, timeoutMs?: number): Session {
  const { pages, folders } = listPages(config, timeoutMs);
  const wikiFolder = folderId(folders, subFolder(config, 'wiki').replace(/^.*\//, ''));
  const byId = new Map(pages.map(p => [p.id, p]));
  const discovered = new Map<string, Remote>();
  for (const p of pages) {
    const path = pathOf(config, p, wikiFolder);
    if (path) discovered.set(path, p);
  }

  const paths = [...new Set([...localPaths(projectDir), ...Object.keys(sync.documents), ...discovered.keys()])];
  const rows: Row[] = paths.map(path => {
    const local = readLocal(projectDir, path);
    const entry = sync.documents[path];
    const kind = kindOf(path);
    // A write with no page id lands on whatever page has the title, so that page is the remote.
    const byTitle = local !== null && kind === 'wiki' ? pages.find(p => p.title === wikiTitle(path.slice(5), local)) : undefined;
    const remote = (entry?.pageId ? byId.get(entry.pageId) : undefined) ?? discovered.get(path) ?? byTitle;
    return { path, kind, local, entry, remote, state: 'in-sync' };
  });

  const strangers = rows.filter(r => !r.entry && r.remote && (r.local !== null || r.kind === 'board'));
  const contents = readPages(config, strangers.map(r => r.remote!.id));
  for (const row of strangers) {
    const remote = contents.get(row.remote!.id)!;
    if (row.local !== null && same(row.kind, row.local, remote.content)) {
      row.entry = sync.documents[row.path] = { kind: row.kind, pageId: row.remote!.id, revision: remote.revision, hash: sha(row.local) };
    } else if (row.kind === 'board') {
      // An existing board is adopted as it is. With no local board there is nothing to lose and the
      // next pull takes it; with a different one, neither side is taken until the owner says which.
      row.entry = sync.documents[row.path] = { kind: 'board', pageId: row.remote!.id, revision: remote.revision, hash: null, ...(row.local !== null ? { diverged: true } : {}) };
    }
  }
  for (const row of rows) row.state = stateOf(projectDir, row);
  return { projectDir, config, sync, rows, notes: [] };
}

function writePage(config: CloudConfig, title: string, folder: string, content: string, entry?: SyncEntry): { pageId: string; revision: number } {
  const [data] = callTools(config, [{
    name: 'KNOWLEDGE_WRITE_PAGE',
    args: { title, folder, content, mode: 'replace', ...(entry?.pageId ? { pageId: entry.pageId, expectedVersion: entry.revision } : {}) },
  }]);
  // The store leaves the revision out of some replies (seen when it creates a longer page), and a
  // record without one would read as changed in the cloud ever after. The page itself always has it.
  return { pageId: data.pageId, revision: data.revision ?? readPages(config, [data.pageId]).get(data.pageId)!.revision };
}

/** Writes the local content to its page, expecting the revision last seen, and records the result. */
function upload(s: Session, row: Row, content: string, expect?: SyncEntry): void {
  const { title, folder } = page(s.config, row.path, content);
  const ref = writePage(s.config, title, folder, content, expect);
  row.entry = s.sync.documents[row.path] = { kind: row.kind, ...ref, hash: sha(content) };
  row.remote = { id: ref.pageId, title, revision: ref.revision };
  row.state = 'in-sync';
}

function writeLocal(projectDir: string, path: string, content: string): string {
  const text = `${content.trimEnd()}\n`;
  if (kindOf(path) === 'board') JSON.parse(text); // a board page that is not JSON must not replace cards.json
  const file = abs(projectDir, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.pull.tmp`, text);
  renameSync(`${file}.pull.tmp`, file);
  return text;
}

/**
 * Writes that were kept locally while the cloud was unreachable go first, with the revision they
 * were made against. A board whose page moved meanwhile is refused; anything else is left for the
 * pull step, which treats it as changed on both sides.
 */
function pushPending(s: Session): void {
  for (const row of s.rows.filter(r => r.entry?.pending && r.local !== null)) {
    const entry = row.entry!;
    if (row.remote && row.remote.revision !== entry.revision) {
      if (row.kind !== 'board') continue;
      throw new CloudConflictError(`VERSION_CONFLICT: the cloud board is at revision ${row.remote.revision}; this checkout last saw revision ${entry.revision} and holds a write that was never pushed`);
    }
    upload(s, row, row.local!, entry);
    s.notes.push(`pushed pending ${row.path} (revision ${row.entry!.revision})`);
  }
}

type PullMode = 'unchanged' | 'board' | 'force';

/**
 * `unchanged` updates only files nobody edited here. `board` also takes a board that changed on
 * both sides, which is how a refused card write is retried. `force` takes every cloud copy.
 */
function pullRows(s: Session, mode: PullMode): void {
  const takes = (r: Row) => r.state === 'cloud-ahead' || (r.state === 'both-changed' && (mode === 'force' || (mode === 'board' && r.kind === 'board')));
  const wanted = s.rows.filter(r => r.remote && (takes(r) || (r.state === 'both-changed' && r.kind === 'wiki')));
  const contents = readPages(s.config, wanted.map(r => r.remote!.id));
  for (const row of wanted) {
    const remote = contents.get(row.remote!.id)!;
    if (takes(row)) {
      const text = writeLocal(s.projectDir, row.path, remote.content);
      if (row.kind === 'wiki') rmSync(copyPath(s.projectDir, row.path), { force: true });
      row.entry = s.sync.documents[row.path] = { kind: row.kind, pageId: row.remote!.id, revision: remote.revision, hash: sha(text) };
      row.local = text;
      row.state = 'in-sync';
      s.notes.push(`pulled ${row.path} (revision ${remote.revision})`);
    } else if (same('wiki', row.local ?? '', remote.content)) {
      // Both sides made the same edit.
      rmSync(copyPath(s.projectDir, row.path), { force: true });
      row.entry = s.sync.documents[row.path] = { kind: 'wiki', pageId: row.remote!.id, revision: remote.revision, hash: sha(row.local!) };
      row.state = 'in-sync';
    } else {
      const copy = copyPath(s.projectDir, row.path);
      const text = `${remote.content.trimEnd()}\n`;
      if (!existsSync(copy) || readFileSync(copy, 'utf-8') !== text) {
        writeFileSync(copy, text);
        s.notes.push(`${row.path} changed here and in the cloud; the cloud version is beside it as ${copy.replace(/^.*\//, '')}. Merge it into yours, then delete it.`);
      }
      // The merge is pushed against the revision just seen, once the copy is gone.
      row.entry = s.sync.documents[row.path] = { kind: 'wiki', pageId: row.remote!.id, revision: remote.revision, hash: row.entry?.hash ?? null };
    }
  }
  for (const row of s.rows.filter(r => r.state === 'both-changed' && r.kind !== 'wiki' && r.remote)) {
    if (!row.entry) row.entry = s.sync.documents[row.path] = { kind: row.kind, pageId: row.remote!.id, revision: row.remote!.revision, hash: null, diverged: true };
    if (row.kind !== 'board') s.notes.push(`${row.path} changed here and in the cloud; yours was kept. \`codeloop cloud pull --force\` takes the cloud copy, \`codeloop cloud push --force\` replaces it.`);
  }
}

type PushMode = 'edits' | 'initial' | 'all' | 'force';

/**
 * `edits` is what a command does by itself: wiki pages and config edited here. A lane edited here
 * is never pushed; it reaches the cloud through `lane promote`. `initial` is the first upload on
 * connect, `all` adds the board, `force` also replaces pages that changed in the cloud.
 */
function pushRows(s: Session, mode: PushMode): { pushed: Row[]; held: string[] } {
  const pushed: Row[] = [];
  const held: string[] = [];
  for (const row of s.rows) {
    if (row.local === null && row.kind !== 'board') continue;
    const forced = mode === 'force' && row.state === 'both-changed' && row.kind !== 'lane';
    if (row.state !== 'local-ahead' && !forced) continue;
    if (row.kind === 'lane' && !(mode === 'initial' && !row.remote)) {
      held.push(row.path);
      s.notes.push(`${row.path} was edited here and is not pushed; a lane changes through \`codeloop lane propose\`, \`lane eval\` and \`lane promote\`.`);
      continue;
    }
    if (row.kind === 'board' && mode === 'edits') continue;
    const expect = forced && row.entry ? { ...row.entry, revision: row.remote!.revision } : row.entry;
    upload(s, row, row.local ?? EMPTY_BOARD, expect);
    if (row.kind === 'wiki') rmSync(copyPath(s.projectDir, row.path), { force: true });
    pushed.push(row);
    if (mode === 'edits') s.notes.push(`pushed ${row.path} (revision ${row.entry!.revision})`);
  }
  return { pushed, held };
}

function ignoreLocalFiles(projectDir: string): void {
  const file = join(projectDir, '.codeloop/.gitignore');
  const current = existsSync(file) ? readFileSync(file, 'utf-8') : '';
  const missing = ['cloud.json', 'local.yaml', 'state/sync.json'].filter(l => !current.split('\n').includes(l));
  if (missing.length) writeFileSync(file, `${current.trimEnd()}${current.trim() ? '\n' : ''}${missing.join('\n')}\n`);
}

export interface ConnectResult {
  adopted: boolean;
  revision: number;
  wikiPages: number;
  /** Documents that differ from a page already in the workspace, one line each. */
  notes: string[];
}

/**
 * A board page that already exists under the same title is adopted as it is, never overwritten:
 * another checkout may have written it. `cloud pull` takes it, `cloud push --force` replaces it.
 * Config, lanes and wiki pages that are not in the workspace yet are uploaded.
 */
export function connect(projectDir: string, input: { url: string; key: string; workspaceName?: string; boardTitle?: string; folder?: string }): ConnectResult {
  const config: CloudConfig = {
    url: input.url,
    key: input.key,
    workspaceName: input.workspaceName,
    boardTitle: input.boardTitle ?? process.env.CODELOOP_CLOUD_BOARD_TITLE ?? 'codeloop board',
    folder: input.folder ?? process.env.CODELOOP_CLOUD_FOLDER ?? DEFAULT_FOLDER,
  };
  const s = open(projectDir, config, { documents: {} });
  const board = s.rows.find(r => r.kind === 'board')!;
  const adopted = !!board.remote;
  // The board is left where it is; everything else that only the cloud has is taken.
  if (adopted) board.state = 'in-sync';
  pullRows(s, 'unchanged');
  const { pushed } = pushRows(s, 'initial');
  saveCloud(projectDir, config);
  saveSync(projectDir, s.sync);
  ignoreLocalFiles(projectDir);
  return { adopted, revision: s.sync.documents[BOARD].revision, wikiPages: pushed.filter(r => r.kind === 'wiki').length, notes: s.notes.filter(n => !n.startsWith('pulled ')) };
}

// sync.json records the revision last seen for each page. Board writes, wiki writes, push and
// pull all read it, call the store and write it back, so they take turns. Anything that may
// replace cards.json takes that lock first, the same order a card write uses.
function locked<T>(projectDir: string, fn: () => T): T {
  return withLock(join(projectDir, CLOUD_FILE), fn);
}

const withBoard = <T>(projectDir: string, fn: () => T): T => withLock(join(projectDir, STATE_DIR, BOARD), () => locked(projectDir, fn));

/** One document written by a command: the page first, expecting the revision last seen. Unreachable means kept locally and marked pending. */
function writeDoc(projectDir: string, path: string, content: string, what: string): void {
  const config = loadCloud(projectDir);
  if (!config) return;
  const sync = loadSync(projectDir);
  const entry = sync.documents[path];
  const kind = kindOf(path);
  if (kind === 'board' && !entry) return;
  if (entry?.diverged) throw new CloudConflictError(`VERSION_CONFLICT: ${path} differs from the cloud copy and neither has been taken`);
  try {
    const { title, folder } = page(config, path, content);
    sync.documents[path] = { kind, ...writePage(config, title, folder, content, entry), hash: sha(content) };
  } catch (e) {
    // A wiki page that also changed in the cloud is not refused: the next command writes the cloud version beside it.
    if (!unreachable(e) && !(kind === 'wiki' && e instanceof CloudConflictError)) throw e;
    console.error(unreachable(e)
      ? `warning: ${e.message}; ${what} was saved locally only and will be pushed by the next command that reaches the cloud.`
      : `warning: ${what} also changed in the cloud; the next command writes the cloud version beside yours.`);
    sync.documents[path] = { kind, pageId: entry?.pageId ?? '', revision: entry?.revision ?? 0, hash: entry?.hash ?? null, pending: true };
  }
  saveSync(projectDir, sync);
}

/**
 * Called by every card write before the local file changes. A stale revision throws
 * CloudConflictError and the caller leaves the local file alone. If the cloud cannot be reached
 * the write stays local and is marked pending in sync.json.
 */
export function writeCloudBoard(projectDir: string, content: string): void {
  if (!existsSync(join(projectDir, CLOUD_FILE))) return;
  return locked(projectDir, () => writeDoc(projectDir, BOARD, content, 'the board'));
}

export function writeCloudWikiPage(projectDir: string, path: string): void {
  if (!existsSync(join(projectDir, CLOUD_FILE))) return;
  const rel = path.replace(`${STATE_DIR}/`, '');
  const content = readLocal(projectDir, rel);
  if (content === null) return;
  return locked(projectDir, () => writeDoc(projectDir, rel, content, 'the wiki page'));
}

/** Called by `lane promote` and `lane rollback` before the lane file is replaced: the only way a lane edit reaches the cloud. */
export function writeCloudLane(projectDir: string, laneId: string, content: string): void {
  if (!existsSync(join(projectDir, CLOUD_FILE))) return;
  return locked(projectDir, () => writeDoc(projectDir, `lanes/${laneId}.yaml`, content, `lane ${laneId}`));
}

function required(projectDir: string): CloudConfig {
  const config = loadCloud(projectDir);
  if (!config) throw new CloudError('not connected; run `codeloop cloud connect --url <mcp url> --key <api key>`');
  return config;
}

/**
 * Run before a command: pending writes are pushed, files nobody edited here are updated from the
 * cloud, and wiki pages and config edited here are pushed. Returns what it did, one line each.
 * With the cloud unreachable the command still runs on the local files.
 */
export function syncBefore(projectDir: string): string[] {
  if (!existsSync(join(projectDir, CLOUD_FILE))) return [];
  return withBoard(projectDir, () => {
    const config = required(projectDir);
    const sync = loadSync(projectDir);
    let s: Session;
    try {
      s = open(projectDir, config, sync, SYNC_TIMEOUT_MS);
    } catch (e) {
      if (!unreachable(e)) throw e;
      const pending = Object.values(sync.documents).filter(d => d.pending).length;
      return [`warning: ${e.message}; working from the local files${pending ? ` (${pending} pending ${pending === 1 ? 'write' : 'writes'})` : ''}`];
    }
    try {
      pushPending(s);
      pullRows(s, 'unchanged');
      pushRows(s, 'edits');
    } finally {
      saveSync(projectDir, s.sync);
    }
    return s.notes;
  });
}

export function push(projectDir: string, opts: { force?: boolean } = {}): { revision: number; wikiPages: number; held: string[] } {
  return locked(projectDir, () => {
    const s = open(projectDir, required(projectDir), loadSync(projectDir));
    try {
      pushPending(s);
      const { pushed, held } = pushRows(s, opts.force ? 'force' : 'all');
      return { revision: s.sync.documents[BOARD].revision, wikiPages: pushed.filter(r => r.kind === 'wiki').length, held };
    } finally {
      saveSync(projectDir, s.sync);
    }
  });
}

export function pull(projectDir: string, opts: { force?: boolean } = {}): { revision: number; wikiPages: number; notes: string[] } {
  return withBoard(projectDir, () => {
    const s = open(projectDir, required(projectDir), loadSync(projectDir));
    try {
      const stale = new Set(s.rows.filter(r => r.kind === 'wiki' && r.state !== 'in-sync').map(r => r.path));
      pullRows(s, opts.force ? 'force' : 'board');
      const wikiPages = s.rows.filter(r => stale.has(r.path) && r.state === 'in-sync').length;
      return { revision: s.sync.documents[BOARD].revision, wikiPages, notes: s.notes.filter(n => !n.startsWith('pulled ')) };
    } finally {
      saveSync(projectDir, s.sync);
    }
  });
}

export function status(projectDir: string) {
  const config = required(projectDir);
  const s = open(projectDir, config, loadSync(projectDir));
  const board = s.rows.find(r => r.kind === 'board')!;
  const local = JSON.parse(board.local ?? EMPTY_BOARD);
  return {
    url: config.url,
    workspaceName: config.workspaceName,
    boardTitle: config.boardTitle,
    pageRevision: board.remote?.revision ?? 0,
    lastSeenRevision: board.entry?.revision ?? 0,
    localVersion: local.version as number,
    cards: (local.cards as unknown[]).length,
    inSync: board.state === 'in-sync',
    wikiPages: s.rows.filter(r => r.kind === 'wiki').length,
    documents: s.rows.map(r => ({ path: r.path, kind: r.kind, state: r.state, ...(r.entry?.pending ? { pending: true } : {}) })),
  };
}

/** Pushes what is pending, brings every document back into the repo files, then forgets the connection. */
export function disconnect(projectDir: string): { revision: number; wikiPages: number } {
  return withBoard(projectDir, () => {
    const s = open(projectDir, required(projectDir), loadSync(projectDir));
    try {
      pushPending(s);
      pullRows(s, 'board');
      pushRows(s, 'edits');
    } catch (e) {
      saveSync(projectDir, s.sync);
      throw e;
    }
    rmSync(join(projectDir, CLOUD_FILE));
    rmSync(join(projectDir, SYNC_FILE), { force: true });
    return { revision: s.sync.documents[BOARD].revision, wikiPages: s.rows.filter(r => r.kind === 'wiki').length };
  });
}

export function search(projectDir: string, query: string, limit = 5): { title: string; id: string }[] {
  const [data] = callTools(required(projectDir), [{ name: 'KNOWLEDGE_SEARCH', args: { query, limit } }]);
  return (data.results ?? []).map((r: { title: string; id: string }) => ({ title: r.title, id: r.id }));
}
