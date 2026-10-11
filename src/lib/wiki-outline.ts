/**
 * `codeloop wiki init --from-repo`: scans a repo's own files for facts (README, docs, package
 * manifests, Makefile/scripts, CI, deploy config, route handlers, schema files, commit history,
 * TODO/FIXME density, CODEOWNERS) and turns them into a starter wiki instead of the empty tree
 * `codeloop init` writes today. Every page states where its facts came from; a line the scanner
 * could not ground in a file is marked `assumption:` instead of asserted as fact.
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, join, relative } from 'path';
import { parse as parseYaml } from 'yaml';
import { detectProject } from './detect.js';
import { WIKI_DIR } from './wiki.js';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.codeloop', 'out', '.turbo', 'vendor', '__pycache__', '.venv', 'venv', '.pytest_cache']);

/** Every file under `root` whose name matches `pattern`, skipping dependency/build/dot directories. */
function listFiles(root: string, pattern: RegExp): string[] {
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        stack.push(join(cur, e.name));
      } else if (pattern.test(e.name)) {
        out.push(relative(root, join(cur, e.name)));
      }
    }
  }
  return out.sort();
}

/** A brace-delimited block starting at the first `{` at or after `fromIdx`, its contents (not the braces). */
function braceBlock(text: string, fromIdx: number): string {
  const start = text.indexOf('{', fromIdx);
  if (start === -1) return '';
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(start + 1, i);
    }
  }
  return text.slice(start + 1);
}

function firstH1AndParagraph(text: string): { title: string | null; paragraph: string | null } {
  const lines = text.split(/\r?\n/);
  let title: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const h1 = /^#\s+(.+)/.exec(lines[i]);
    if (!title && h1) {
      title = h1[1].trim();
      continue;
    }
    if (title === null) continue;
    const line = lines[i].trim();
    if (!line || line.startsWith('#') || line.startsWith('![') || line.startsWith('[![')) continue;
    const parts = [line];
    let j = i + 1;
    while (j < lines.length && lines[j].trim()) {
      parts.push(lines[j].trim());
      j++;
    }
    return { title, paragraph: parts.join(' ') };
  }
  return { title, paragraph: null };
}

export interface DocFact {
  path: string;
  title: string;
  paragraph: string;
}

export function scanReadme(repoDir: string): DocFact | null {
  for (const name of ['README.md', 'Readme.md', 'readme.md']) {
    const file = join(repoDir, name);
    if (!existsSync(file)) continue;
    const { title, paragraph } = firstH1AndParagraph(readFileSync(file, 'utf-8'));
    return { path: name, title: title ?? name, paragraph: paragraph ?? '' };
  }
  return null;
}

export function scanDocs(repoDir: string): DocFact[] {
  const docsDir = join(repoDir, 'docs');
  if (!existsSync(docsDir)) return [];
  return listFiles(docsDir, /\.md$/i).map(f => {
    const rel = `docs/${f}`;
    const { title, paragraph } = firstH1AndParagraph(readFileSync(join(repoDir, rel), 'utf-8'));
    return { path: rel, title: title ?? f, paragraph: paragraph ?? '' };
  });
}

export interface StackFact {
  layer: string;
  tech: string;
  where: string;
  source: string;
}

function frameworkLayer(fw: string): string {
  if (['express', 'fastify', 'nest', 'fastapi', 'flask', 'django'].includes(fw)) return 'API framework';
  if (['react', 'next'].includes(fw)) return 'frontend framework';
  if (['prisma', 'sqlalchemy', 'mongoose', 'typeorm'].includes(fw)) return 'ORM';
  if (['vitest', 'jest', 'playwright'].includes(fw)) return 'test framework';
  return 'library';
}

const PY_FRAMEWORKS = ['fastapi', 'flask', 'django', 'sqlalchemy'];
// ORMs `detectProject`'s FRAMEWORKS list does not cover (it is written for lint/build/test tooling).
const ORM_DEPS = ['mongoose', 'prisma', '@prisma/client', 'typeorm', 'sequelize'];

/** The frameworks and ORMs one package.json's dependencies name; `detectProject`'s list is lint/build/test tooling only, so ORMs are checked directly. */
function nodeDepsFacts(pkgFile: string, where: string): StackFact[] {
  try {
    const pkg = JSON.parse(readFileSync(pkgFile, 'utf-8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const facts: StackFact[] = [];
    for (const fw of ['next', 'express', 'fastify', '@nestjs/core', 'react', 'vite']) {
      const id = fw === '@nestjs/core' ? 'nest' : fw;
      if (fw in deps) facts.push({ layer: frameworkLayer(id), tech: id, where, source: `${where}/package.json` });
    }
    for (const orm of ORM_DEPS) if (orm in deps) facts.push({ layer: frameworkLayer(orm === '@prisma/client' ? 'prisma' : orm), tech: orm, where, source: `${where}/package.json` });
    return facts;
  } catch {
    return [];
  }
}

export function scanStack(repoDir: string): StackFact[] {
  const facts: StackFact[] = [];
  if (existsSync(join(repoDir, 'package.json'))) {
    const det = detectProject(repoDir);
    let name = basename(repoDir);
    try {
      name = JSON.parse(readFileSync(join(repoDir, 'package.json'), 'utf-8')).name ?? name;
    } catch {
      /* malformed package.json; keep the directory name */
    }
    facts.push({ layer: 'runtime', tech: 'Node.js', where: name, source: 'package.json' });
    if (det.packageManager) facts.push({ layer: 'package manager', tech: det.packageManager, where: '-', source: 'lockfile' });
    for (const fw of det.frameworks) facts.push({ layer: frameworkLayer(fw), tech: fw, where: '-', source: 'package.json dependencies' });
    facts.push(...nodeDepsFacts(join(repoDir, 'package.json'), 'root'));
    // A monorepo's own dependencies may be thin; services/packages/apps carry their own frameworks and ORMs.
    for (const workspace of ['services', 'packages', 'apps']) {
      const base = join(repoDir, workspace);
      if (!existsSync(base)) continue;
      for (const entry of readdirSync(base, { withFileTypes: true })) {
        if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
        const pkgFile = join(base, entry.name, 'package.json');
        if (existsSync(pkgFile)) facts.push(...nodeDepsFacts(pkgFile, `${workspace}/${entry.name}`));
      }
    }
  }
  const pyproject = join(repoDir, 'pyproject.toml');
  const requirements = join(repoDir, 'requirements.txt');
  if (existsSync(pyproject)) {
    const text = readFileSync(pyproject, 'utf-8');
    const name = /name\s*=\s*"([^"]+)"/.exec(text)?.[1] ?? '-';
    facts.push({ layer: 'runtime', tech: 'Python', where: name, source: 'pyproject.toml' });
    for (const dep of PY_FRAMEWORKS) if (new RegExp(dep, 'i').test(text)) facts.push({ layer: frameworkLayer(dep), tech: dep, where: '-', source: 'pyproject.toml' });
  } else if (existsSync(requirements)) {
    const text = readFileSync(requirements, 'utf-8');
    facts.push({ layer: 'runtime', tech: 'Python', where: '-', source: 'requirements.txt' });
    for (const dep of PY_FRAMEWORKS) if (new RegExp(dep, 'i').test(text)) facts.push({ layer: frameworkLayer(dep), tech: dep, where: '-', source: 'requirements.txt' });
  }
  const goMod = join(repoDir, 'go.mod');
  if (existsSync(goMod)) {
    const mod = /^module\s+(\S+)/m.exec(readFileSync(goMod, 'utf-8'))?.[1] ?? '-';
    facts.push({ layer: 'runtime', tech: 'Go', where: mod, source: 'go.mod' });
  }
  return facts;
}

export interface RunbookTarget {
  name: string;
  command: string;
  source: string;
}

export function scanMakefile(repoDir: string): RunbookTarget[] {
  const file = join(repoDir, 'Makefile');
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, 'utf-8').split(/\r?\n/);
  const targets: RunbookTarget[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z0-9][A-Za-z0-9_.-]*)\s*:(?!=)/.exec(lines[i]);
    if (!m || m[1] === '.PHONY') continue;
    const cmds: string[] = [];
    let j = i + 1;
    while (j < lines.length && /^\t/.test(lines[j])) {
      cmds.push(lines[j].trim());
      j++;
    }
    if (cmds.length) targets.push({ name: m[1], command: cmds.join(' && '), source: 'Makefile' });
  }
  return targets;
}

export function scanScripts(repoDir: string): RunbookTarget[] {
  const dir = join(repoDir, 'scripts');
  if (!existsSync(dir)) return [];
  const out: RunbookTarget[] = [];
  for (const f of readdirSync(dir)) {
    const full = join(dir, f);
    if (!statSync(full).isFile()) continue;
    out.push({ name: f, command: `scripts/${f}`, source: `scripts/${f}` });
  }
  return out;
}

/** The root `package.json`'s `scripts`, so `commands.md` and `codeloop check architecture` can tell a real npm script from an invented one without re-reading package.json themselves. */
export function scanNpmScripts(repoDir: string): RunbookTarget[] {
  const file = join(repoDir, 'package.json');
  if (!existsSync(file)) return [];
  try {
    const pkg = JSON.parse(readFileSync(file, 'utf-8')) as { scripts?: Record<string, string> };
    return Object.entries(pkg.scripts ?? {}).map(([name, command]) => ({ name, command, source: 'package.json' }));
  } catch {
    return [];
  }
}

export interface CiFact {
  file: string;
  name?: string;
  steps: string[];
  envs: string[];
}

export function scanWorkflows(repoDir: string): CiFact[] {
  const dir = join(repoDir, '.github', 'workflows');
  if (!existsSync(dir)) return [];
  const out: CiFact[] = [];
  for (const f of readdirSync(dir).filter(name => /\.(yml|yaml)$/.test(name))) {
    try {
      const doc = parseYaml(readFileSync(join(dir, f), 'utf-8')) as { name?: string; env?: Record<string, unknown>; jobs?: Record<string, { steps?: { name?: string; run?: string; uses?: string }[] }> };
      const steps: string[] = [];
      for (const job of Object.values(doc.jobs ?? {})) for (const step of job.steps ?? []) steps.push(step.name ?? step.run ?? step.uses ?? 'step');
      out.push({ file: `.github/workflows/${f}`, name: doc.name, steps, envs: Object.keys(doc.env ?? {}) });
    } catch {
      /* not valid YAML; skip rather than guess at its contents */
    }
  }
  return out;
}

export interface DeployFact {
  target: string;
  how: string;
  source: string;
}

export function scanDeploy(repoDir: string): DeployFact[] {
  const out: DeployFact[] = [];
  for (const name of ['docker-compose.yml', 'docker-compose.yaml']) {
    const file = join(repoDir, name);
    if (!existsSync(file)) continue;
    try {
      const doc = parseYaml(readFileSync(file, 'utf-8')) as { services?: Record<string, unknown> };
      for (const svc of Object.keys(doc.services ?? {})) out.push({ target: svc, how: 'docker-compose service', source: name });
    } catch {
      /* malformed compose file */
    }
  }
  const fly = join(repoDir, 'fly.toml');
  if (existsSync(fly)) {
    const app = /^app\s*=\s*"([^"]+)"/m.exec(readFileSync(fly, 'utf-8'))?.[1] ?? 'fly app';
    out.push({ target: app, how: 'Fly.io', source: 'fly.toml' });
  }
  if (existsSync(join(repoDir, 'vercel.json'))) out.push({ target: 'vercel project', how: 'Vercel', source: 'vercel.json' });
  return out;
}

export interface RouteFact {
  method: string;
  path: string;
  file: string;
  handler: string;
}

function nextRoutePath(rel: string): string {
  const parts = rel.split('/');
  const appIdx = parts.indexOf('app');
  const slice = (appIdx >= 0 ? parts.slice(appIdx + 1) : parts).slice(0, -1);
  return `/${slice.map(p => p.replace(/^\[(?:\.\.\.)?([^\]]+)\]$/, ':$1')).join('/')}`;
}

const TEST_FILE = /\.(spec|test)\.[jt]sx?$/;

export function scanRoutes(repoDir: string): RouteFact[] {
  const files = listFiles(repoDir, /\.(ts|tsx|js|jsx|py)$/).filter(f => !TEST_FILE.test(f));
  const out: RouteFact[] = [];
  for (const rel of files) {
    const text = readFileSync(join(repoDir, rel), 'utf-8');
    for (const m of text.matchAll(/\b(?:app|router)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/gi)) out.push({ method: m[1].toUpperCase(), path: m[2], file: rel, handler: rel });
    const ctrl = /@Controller\(\s*['"`]?([^'")`]*)['"`]?\s*\)/.exec(text);
    if (ctrl) {
      const prefix = ctrl[1] || '';
      for (const m of text.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s*['"`]?([^'")`]*)['"`]?\s*\)\s*\r?\n\s*(?:async\s+)?(\w+)\s*\(/g)) {
        const path = `/${[prefix, m[2] || ''].filter(Boolean).join('/')}`.replace(/\/+/g, '/');
        out.push({ method: m[1].toUpperCase(), path, file: rel, handler: m[3] });
      }
    }
    if (/[\\/]route\.(ts|js)$/.test(rel)) {
      for (const m of text.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) out.push({ method: m[1], path: nextRoutePath(rel), file: rel, handler: m[1] });
    }
    for (const m of text.matchAll(/@(?:app|router)\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/gi)) out.push({ method: m[1].toUpperCase(), path: m[2], file: rel, handler: rel });
  }
  const seen = new Set<string>();
  return out.filter(r => {
    const key = `${r.method} ${r.path} ${r.file}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface EntityFact {
  name: string;
  fields: string[];
  relations: { to: string; kind: string }[];
  source: string;
}

function scanMongooseInFile(text: string, rel: string): EntityFact[] {
  const blocks: { fields: string[]; relations: { to: string; kind: string }[] }[] = [];
  for (const m of text.matchAll(/new\s+(?:mongoose\.)?Schema\(/g)) {
    const body = braceBlock(text, m.index!);
    const fields = [...new Set([...body.matchAll(/^\s*(\w+)\s*:\s*\{/gm)].map(f => f[1]).concat([...body.matchAll(/^\s*(\w+)\s*:\s*(?:String|Number|Boolean|Date|Buffer|Map)\b/gm)].map(f => f[1])))];
    const relations = [...body.matchAll(/ref:\s*['"`](\w+)['"`]/g)].map(r => ({ to: r[1], kind: 'ref' }));
    blocks.push({ fields, relations });
  }
  const models = [...text.matchAll(/mongoose\.model(?:<[^>]*>)?\(\s*['"`](\w+)['"`]/g)].map(m => m[1]);
  return models.map((name, i) => ({ name, fields: blocks[i]?.fields ?? [], relations: blocks[i]?.relations ?? [], source: rel }));
}

const PRISMA_SCALARS = new Set(['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'BigInt', 'Decimal', 'Bytes']);

function scanPrismaFile(text: string, rel: string): EntityFact[] {
  const out: EntityFact[] = [];
  for (const m of text.matchAll(/model\s+(\w+)\s*\{([^}]*)\}/g)) {
    const name = m[1];
    const fields: string[] = [];
    const relations: { to: string; kind: string }[] = [];
    for (const line of m[2].split('\n').map(l => l.trim()).filter(Boolean)) {
      const fm = /^(\w+)\s+(\w+)(\[\])?(\??)/.exec(line);
      if (!fm) continue;
      fields.push(`${fm[1]} ${fm[2]}${fm[3] ?? ''}`);
      if (/^[A-Z]/.test(fm[2]) && fm[2] !== name && !PRISMA_SCALARS.has(fm[2])) relations.push({ to: fm[2], kind: fm[3] ? 'many' : 'one' });
    }
    out.push({ name, fields, relations, source: rel });
  }
  return out;
}

function scanSqlAlchemyFile(text: string, rel: string): EntityFact[] {
  const out: EntityFact[] = [];
  for (const m of text.matchAll(/class\s+(\w+)\(Base\):([\s\S]*?)(?=\nclass\s|$)/g)) {
    const fields = [...m[2].matchAll(/(\w+)\s*=\s*Column\(/g)].map(f => f[1]);
    const relations = [...m[2].matchAll(/relationship\(\s*["'](\w+)["']/g)].map(r => ({ to: r[1], kind: 'relationship' }));
    if (fields.length || relations.length) out.push({ name: m[1], fields, relations, source: rel });
  }
  return out;
}

function scanTypeormFile(text: string, rel: string): EntityFact[] {
  const out: EntityFact[] = [];
  for (const m of text.matchAll(/@Entity\([^)]*\)\s*(?:export\s+)?class\s+(\w+)/g)) {
    const body = braceBlock(text, m.index! + m[0].length);
    const fields = [...body.matchAll(/@Column\([^)]*\)\s*\r?\n\s*(\w+)/g)].map(f => f[1]);
    const relations = [...body.matchAll(/@(ManyToOne|OneToMany|ManyToMany|OneToOne)\(\s*\(\)\s*=>\s*(\w+)/g)].map(r => ({ to: r[2], kind: r[1] }));
    out.push({ name: m[1], fields, relations, source: rel });
  }
  return out;
}

/** `@nestjs/mongoose`'s decorator style: `@Schema() class X { @Prop() field; }`, not a raw `new Schema(...)`. */
function scanNestMongooseFile(text: string, rel: string): EntityFact[] {
  const out: EntityFact[] = [];
  for (const m of text.matchAll(/@Schema\([^)]*\)\s*\r?\n\s*(?:export\s+)?class\s+(\w+)/g)) {
    const body = braceBlock(text, m.index! + m[0].length);
    const fields = [...body.matchAll(/@Prop\([^)]*\)\s*\r?\n\s*(\w+)/g)].map(f => f[1]);
    const relations = [...body.matchAll(/@Prop\([^)]*ref:\s*['"`](\w+)['"`][^)]*\)/g)].map(r => ({ to: r[1], kind: 'ref' }));
    out.push({ name: m[1], fields, relations, source: rel });
  }
  return out;
}

export function scanSchemas(repoDir: string): EntityFact[] {
  const out: EntityFact[] = [];
  for (const rel of listFiles(repoDir, /\.prisma$/)) out.push(...scanPrismaFile(readFileSync(join(repoDir, rel), 'utf-8'), rel));
  for (const rel of listFiles(repoDir, /\.py$/).filter(f => !TEST_FILE.test(f))) out.push(...scanSqlAlchemyFile(readFileSync(join(repoDir, rel), 'utf-8'), rel));
  for (const rel of listFiles(repoDir, /\.ts$/).filter(f => !TEST_FILE.test(f))) {
    const text = readFileSync(join(repoDir, rel), 'utf-8');
    if (/@Entity\(/.test(text)) out.push(...scanTypeormFile(text, rel));
    if (/@Schema\(/.test(text) && /@nestjs\/mongoose/.test(text)) out.push(...scanNestMongooseFile(text, rel));
  }
  for (const rel of listFiles(repoDir, /\.(ts|js)$/).filter(f => !TEST_FILE.test(f))) {
    const text = readFileSync(join(repoDir, rel), 'utf-8');
    if (/mongoose\.model\(/.test(text)) out.push(...scanMongooseInFile(text, rel));
  }
  return out;
}

export interface CommitScopeFact {
  scope: string;
  count: number;
}

export function scanCommitScopes(repoDir: string): CommitScopeFact[] {
  let log = '';
  try {
    log = execSync('git log --format=%s -n 300', { cwd: repoDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return [];
  }
  const counts = new Map<string, number>();
  for (const line of log.split('\n')) {
    const m = /^\w+\(([^)]+)\):/.exec(line.trim());
    if (m) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  return [...counts.entries()].map(([scope, count]) => ({ scope, count })).sort((a, b) => b.count - a.count);
}

export function scanAdrs(repoDir: string): string[] {
  const out: string[] = [];
  for (const dir of ['docs/decisions', 'docs/adr', 'adr', 'docs/architecture/decisions']) {
    const full = join(repoDir, dir);
    if (!existsSync(full)) continue;
    for (const f of readdirSync(full).filter(name => name.endsWith('.md'))) out.push(`${dir}/${f}`);
  }
  return out;
}

export interface TodoFact {
  area: string;
  count: number;
}

export function scanTodos(repoDir: string): TodoFact[] {
  const counts = new Map<string, number>();
  for (const rel of listFiles(repoDir, /\.(ts|tsx|js|jsx|py|go)$/)) {
    let text: string;
    try {
      text = readFileSync(join(repoDir, rel), 'utf-8');
    } catch {
      continue;
    }
    const n = (text.match(/\b(?:TODO|FIXME)\b/g) ?? []).length;
    if (!n) continue;
    const area = rel.split('/')[0];
    counts.set(area, (counts.get(area) ?? 0) + n);
  }
  return [...counts.entries()].map(([area, count]) => ({ area, count })).sort((a, b) => b.count - a.count);
}

export function scanCodeowners(repoDir: string): { pattern: string; owners: string[] }[] {
  for (const p of ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS']) {
    const full = join(repoDir, p);
    if (!existsSync(full)) continue;
    return readFileSync(full, 'utf-8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
      .map(l => {
        const [pattern, ...owners] = l.split(/\s+/);
        return { pattern, owners };
      });
  }
  return [];
}

const ANALYTICS_DEPS = ['posthog-js', 'posthog-node', '@segment/analytics-node', 'analytics', 'mixpanel', 'amplitude-js', '@amplitude/analytics-browser', 'react-ga4', 'next-plausible'];

export function scanAnalyticsDeps(repoDir: string): string[] {
  const file = join(repoDir, 'package.json');
  if (!existsSync(file)) return [];
  try {
    const pkg = JSON.parse(readFileSync(file, 'utf-8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    return ANALYTICS_DEPS.filter(d => d in deps);
  } catch {
    return [];
  }
}

export interface RepoFacts {
  readme: DocFact | null;
  docs: DocFact[];
  stack: StackFact[];
  makeTargets: RunbookTarget[];
  scriptTargets: RunbookTarget[];
  /** The root package.json's npm scripts, so `commands.md` can name a real one. See `scanNpmScripts`. */
  scripts: RunbookTarget[];
  ci: CiFact[];
  deploy: DeployFact[];
  routes: RouteFact[];
  entities: EntityFact[];
  commitScopes: CommitScopeFact[];
  adrs: string[];
  todos: TodoFact[];
  codeowners: { pattern: string; owners: string[] }[];
  analyticsDeps: string[];
}

export function scanRepo(repoDir: string): RepoFacts {
  return {
    readme: scanReadme(repoDir),
    docs: scanDocs(repoDir),
    stack: scanStack(repoDir),
    makeTargets: scanMakefile(repoDir),
    scriptTargets: scanScripts(repoDir),
    scripts: scanNpmScripts(repoDir),
    ci: scanWorkflows(repoDir),
    deploy: scanDeploy(repoDir),
    routes: scanRoutes(repoDir),
    entities: scanSchemas(repoDir),
    commitScopes: scanCommitScopes(repoDir),
    adrs: scanAdrs(repoDir),
    todos: scanTodos(repoDir),
    codeowners: scanCodeowners(repoDir),
    analyticsDeps: scanAnalyticsDeps(repoDir),
  };
}

const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|java|kt|rs|c|cc|cpp|h|hpp|cs|php|swift)$/;

function hasSourceFile(dir: string): boolean {
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
        stack.push(join(cur, e.name));
      } else if (SOURCE_FILE.test(e.name)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * The folders the architecture skill must account for: top-level, non-dot, non-dependency
 * directories that hold at least one source file, plus `src/`'s own first-level subfolders when
 * `src/` exists (a monorepo's layers usually live one level deeper than the repo root).
 */
export function scanTopFolders(repoDir: string): string[] {
  let entries;
  try {
    entries = readdirSync(repoDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const top = entries
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
    .map(e => e.name)
    .filter(name => hasSourceFile(join(repoDir, name)))
    .sort();
  const srcDir = join(repoDir, 'src');
  if (!existsSync(srcDir)) return top;
  const subs = readdirSync(srcDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
    .map(e => `src/${e.name}`)
    .sort();
  return [...new Set([...top, ...subs])].sort();
}

export const REPO_FACTS_PATH = '.codeloop/state/repo-facts.json';

export type RepoFactsFile = RepoFacts & { topFolders: string[] };

/** `scanRepo` plus the top-level folders, as the architecture skill's brief reads it from disk. Pure: reads the repo, writes nothing. */
export function buildRepoFacts(repoDir: string): RepoFactsFile {
  return { ...scanRepo(repoDir), topFolders: scanTopFolders(repoDir) };
}

/** Refreshes `.codeloop/state/repo-facts.json`. Always overwritten: it is scanner state, not a page a person edits. */
export function writeRepoFacts(repoDir: string): RepoFactsFile {
  const facts = buildRepoFacts(repoDir);
  const full = join(repoDir, REPO_FACTS_PATH);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(facts, null, 2)}\n`);
  return facts;
}

export interface OutlinePage {
  path: string;
  title: string;
  body: string;
  facts: number;
  assumptions: number;
}

function mk(path: string, title: string, body: string): OutlinePage {
  const text = body.endsWith('\n') ? body : `${body}\n`;
  return { path, title, body: text, facts: (text.match(/source: /gi) ?? []).length, assumptions: (text.match(/^assumption:/gim) ?? []).length };
}

// These raw inventories follow the C4 model: context (the system, its people and the systems
// around it), containers (the deployable layers and what runs where), then data, flows and deploy.
// Each page is one diagram and one table; the diagram is a mermaid fence the wiki renders. They
// land under wiki/reference/, not wiki/architecture/: they are scanner output, not the explained
// five pages the architecture skill writes from them (see architecture-check.ts and
// templates/skills/architecture/).
const mermaidId = (text: string) => text.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'x';

function pageContext(facts: RepoFacts, repoName: string): OutlinePage {
  const external = facts.deploy.map(d => d.target).filter((t, i, a) => a.indexOf(t) === i).slice(0, 4);
  const lines = ['---', 'title: Context', '---', '', '# System context', '', 'C4 level 1: the system as one box, the people who use it and the systems it talks to.', ''];
  lines.push('```mermaid', 'C4Context', `  title ${repoName} in context`, `  Person(user, "User", "assumption: the persona is not named in any doc")`, `  System(sys, "${repoName}", "${facts.readme?.title ?? 'what it does is not stated in a README'}")`);
  for (const t of external) lines.push(`  System_Ext(${mermaidId(t)}, "${t}", "hosting, from the deploy config")`);
  lines.push('  Rel(user, sys, "uses")');
  for (const t of external) lines.push(`  Rel(sys, ${mermaidId(t)}, "deploys to")`);
  lines.push('```', '', '| Who or what | Role | Source |', '|---|---|---|', '| User | assumption: the persona is inferred, not stated | - |');
  for (const t of external) lines.push(`| ${t} | hosting | source: ${facts.deploy.find(d => d.target === t)?.source ?? '-'} |`);
  if (!external.length) lines.push('| (no external systems found) | assumption: no deploy config names one | - |');
  return mk(`${WIKI_DIR}/reference/context.md`, 'Context', lines.join('\n'));
}

function pageContainers(facts: RepoFacts): OutlinePage {
  const lines = ['---', 'title: Containers', '---', '', '# Containers and layers', '', 'C4 level 2: the deployable pieces, as layers from the user down to the data. Each box names its technology; a box with no technology is a gap to fill.', ''];
  const layers: Record<string, string[]> = {};
  for (const s of facts.stack) (layers[s.layer] ??= []).push(s.tech);
  const order = ['frontend framework', 'UI kit', 'API framework', 'API layer', 'backend framework', 'framework', 'runtime', 'ORM', 'database', 'queue', 'cache'];
  // Package managers, test runners and linters are tooling, not layers a request passes through.
  const names = Object.keys(layers).filter(l => !/package manager|tooling|test framework|linter|formatter|bundler/i.test(l)).sort((a, b) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)));
  if (names.length) {
    lines.push('```mermaid', 'flowchart TB');
    names.forEach((layer, i) => lines.push(`  subgraph L${i}["${layer}"]`, `    N${i}["${layers[layer].slice(0, 4).join(', ')}"]`, '  end'));
    for (let i = 0; i + 1 < names.length; i++) lines.push(`  N${i} --> N${i + 1}`);
    if (facts.routes.length) lines.push(`  API["${facts.routes.length} routes"]`, `  N0 -. calls .-> API`);
    if (facts.entities.length) lines.push(`  DATA[("${facts.entities.length} entities")]`, `  N${names.length - 1} --> DATA`);
    lines.push('```', '');
    lines.push('| Layer | Tech | Where | Source |', '|---|---|---|---|');
    for (const s of facts.stack) lines.push(`| ${s.layer} | ${s.tech} | ${s.where} | source: ${s.source} |`);
  } else lines.push('assumption: no manifest was found, so no layers could be drawn.');
  return mk(`${WIKI_DIR}/reference/containers.md`, 'Containers', lines.join('\n'));
}

function pageStack(facts: RepoFacts): OutlinePage {
  const lines = ['---', 'title: Stack', '---', '', '# Stack', ''];
  if (facts.stack.length) {
    lines.push('| Layer | Tech | Where | Source |', '|---|---|---|---|');
    for (const s of facts.stack) lines.push(`| ${s.layer} | ${s.tech} | ${s.where} | source: ${s.source} |`);
  } else lines.push('assumption: no package.json, pyproject.toml, requirements.txt or go.mod was found; stack is unknown.');
  return mk(`${WIKI_DIR}/reference/stack.md`, 'Stack', lines.join('\n'));
}

function pageErd(facts: RepoFacts): OutlinePage {
  const lines = ['---', 'title: ERD', '---', '', '# Entity relationships', ''];
  if (facts.entities.length) {
    lines.push('```mermaid', 'erDiagram');
    for (const e of facts.entities) for (const r of e.relations) lines.push(`  ${e.name} }o--o{ ${r.to} : "${r.kind}"`);
    lines.push('```', '', '| Entity | Fields | Source |', '|---|---|---|');
    for (const e of facts.entities) lines.push(`| ${e.name} | ${e.fields.join(', ') || '-'} | source: ${e.source} |`);
  } else lines.push('assumption: no Prisma, Mongoose, SQLAlchemy or TypeORM schema files were found; no ERD could be drawn.');
  return mk(`${WIKI_DIR}/reference/erd.md`, 'ERD', lines.join('\n'));
}

function pageContracts(facts: RepoFacts): OutlinePage {
  const lines = ['---', 'title: Service contracts', '---', '', '# Routes', ''];
  if (facts.routes.length) {
    lines.push('| Method | Path | Handler file |', '|---|---|---|');
    for (const r of facts.routes) lines.push(`| ${r.method} | ${r.path} | source: ${r.file} |`);
  } else lines.push('assumption: no route handlers (Express, Nest, Next route handlers, FastAPI) were found.');
  return mk(`${WIKI_DIR}/reference/service-contracts.md`, 'Service contracts', lines.join('\n'));
}

function pageDataFlows(facts: RepoFacts): OutlinePage {
  const lines = ['---', 'title: Data flows', '---', '', '# Top flows', '', 'assumption: these sequences are inferred from the routes and entities found elsewhere in this outline; no flow documentation exists for them yet.', ''];
  const top = facts.routes.slice(0, 3);
  if (!top.length) lines.push('assumption: no routes were found, so no flow could be inferred.');
  for (const r of top) lines.push(`## ${r.method} ${r.path}`, '', '```mermaid', 'sequenceDiagram', `  Client->>API: ${r.method} ${r.path}`, '  API->>DB: query/update', '  DB-->>API: result', '  API-->>Client: response', '```', '');
  return mk(`${WIKI_DIR}/reference/data-flows.md`, 'Data flows', lines.join('\n'));
}

function pageDeploy(facts: RepoFacts): OutlinePage {
  const lines = ['---', 'title: Deploy', '---', '', '# Environments', ''];
  if (facts.deploy.length) {
    lines.push('```mermaid', 'flowchart LR', '  dev["developer machine"]');
    facts.deploy.forEach((d, i) => lines.push(`  T${i}["${d.target}"]`, `  dev -- "${d.how.replace(/"/g, "'").slice(0, 40)}" --> T${i}`));
    lines.push('```', '');
    lines.push('| Target | How | Source |', '|---|---|---|');
    for (const d of facts.deploy) lines.push(`| ${d.target} | ${d.how} | source: ${d.source} |`);
  } else lines.push('assumption: no docker-compose.yml, fly.toml or vercel.json was found; deploy mechanism is unknown.');
  if (facts.ci.length) {
    lines.push('', '## CI', '');
    for (const c of facts.ci) lines.push(`- ${c.name ?? c.file}: ${c.steps.length} steps (source: ${c.file})`);
  }
  return mk(`${WIKI_DIR}/reference/deploy.md`, 'Deploy', lines.join('\n'));
}

/**
 * The pages `wiki init --from-repo` would write, in write order. Pure: reads the repo, writes
 * nothing. Every page lands under `reference/`: the scanner no longer seeds `product/`, `runbooks/`,
 * `decisions/`, `gotchas/`, `glossary.md` or `numbers/` (docs/plans/codeloop/2026-10-10-wiki-schema.md
 * rule 1) - those are a person's or an agent's pages, and the scanner used to fill them with
 * `assumption:`/`no-data:` filler that `codeloop wiki migrate` now cleans up from older runs.
 */
export function buildOutline(repoDir: string): OutlinePage[] {
  const facts = scanRepo(repoDir);
  const repoName = basename(repoDir);
  return [pageContext(facts, repoName), pageContainers(facts), pageStack(facts), pageErd(facts), pageContracts(facts), pageDataFlows(facts), pageDeploy(facts)];
}

export interface OutlineSummary {
  path: string;
  title: string;
  facts: number;
  assumptions: number;
  exists: boolean;
}

/** `--dry-run` / `--json` / the SDK read: the outline's shape and counts, without writing anything. */
export function outlineSummary(repoDir: string): OutlineSummary[] {
  return buildOutline(repoDir).map(p => ({ path: p.path, title: p.title, facts: p.facts, assumptions: p.assumptions, exists: existsSync(join(repoDir, p.path)) }));
}

export interface WriteOutlineResult {
  written: string[];
  skipped: string[];
  assumptions: number;
}

/** `--write`: writes every page that does not already exist (or all of them, with `force`), and always refreshes `.codeloop/state/repo-facts.json`. */
export function writeOutline(repoDir: string, opts: { force?: boolean; forceUnder?: string } = {}): WriteOutlineResult {
  const result: WriteOutlineResult = { written: [], skipped: [], assumptions: 0 };
  writeRepoFacts(repoDir);
  result.written.push(REPO_FACTS_PATH);
  for (const page of buildOutline(repoDir)) {
    const full = join(repoDir, page.path);
    const overwrite = opts.force || (opts.forceUnder !== undefined && page.path.startsWith(opts.forceUnder));
    if (existsSync(full) && !overwrite) {
      result.skipped.push(page.path);
      continue;
    }
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, page.body);
    result.written.push(page.path);
    result.assumptions += page.assumptions;
  }
  return result;
}
