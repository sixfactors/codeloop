import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

export type StackId = 'node-typescript' | 'python' | 'go' | 'java' | 'dotnet' | 'generic';
export type ToolId = 'claude' | 'cursor' | 'codex';

/** Directories no scan descends into: dependencies, build output, virtual environments, the board. */
export const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.codeloop', 'out', '.turbo', 'vendor', '__pycache__', '.venv', 'venv', '.pytest_cache', 'target', 'bin', 'obj']);

interface DetectionRule {
  stack: StackId;
  /** The language the marker proves. */
  language: string;
  /** Files at the folder's root; a `*.ext` entry matches any file with that extension. */
  files: string[];
  description: string;
}

// In order: the first rule whose marker exists names the stack a starter config is picked for.
const rules: DetectionRule[] = [
  { stack: 'java', language: 'Java', files: ['pom.xml', 'build.gradle', 'build.gradle.kts'], description: 'Java' },
  { stack: 'dotnet', language: 'C#', files: ['*.sln', '*.csproj', 'global.json'], description: '.NET' },
  { stack: 'go', language: 'Go', files: ['go.mod'], description: 'Go' },
  { stack: 'node-typescript', language: 'TypeScript', files: ['tsconfig.json'], description: 'TypeScript (Node.js)' },
  { stack: 'python', language: 'Python', files: ['pyproject.toml', 'setup.py', 'requirements.txt', 'Pipfile'], description: 'Python' },
];

/** The marker file a rule matches in `dir`, or null. */
function markerIn(dir: string, rule: DetectionRule): string | null {
  for (const file of rule.files) {
    if (file.startsWith('*.')) {
      let names: string[] = [];
      try {
        names = readdirSync(dir);
      } catch {
        return null;
      }
      const hit = names.find(n => n.endsWith(file.slice(1)));
      if (hit) return hit;
    } else if (existsSync(join(dir, file))) return file;
  }
  return null;
}

export interface DetectionResult {
  stack: StackId;
  description: string;
  matchedFile: string | null;
}

export function detectStack(projectDir: string): DetectionResult {
  for (const rule of rules) {
    const matched = markerIn(projectDir, rule);
    if (matched) return { stack: rule.stack, description: rule.description, matchedFile: matched };
  }
  return { stack: 'generic', description: 'Generic project', matchedFile: null };
}

/**
 * Detect which AI coding tools are present in the project.
 * Looks for tool-specific directories.
 */
export function detectTools(projectDir: string): ToolId[] {
  const detected: ToolId[] = [];

  // Claude Code: .claude/ directory or CLAUDE.md
  if (existsSync(join(projectDir, '.claude')) || existsSync(join(projectDir, 'CLAUDE.md'))) {
    detected.push('claude');
  }

  // Cursor: .cursor/ directory or .cursorrules
  if (existsSync(join(projectDir, '.cursor')) || existsSync(join(projectDir, '.cursorrules'))) {
    detected.push('cursor');
  }

  // Codex: .codex/ directory or AGENTS.md or .agents/
  if (
    existsSync(join(projectDir, '.codex')) ||
    existsSync(join(projectDir, 'AGENTS.md')) ||
    existsSync(join(projectDir, '.agents'))
  ) {
    detected.push('codex');
  }

  return detected;
}

/** A language found in the repository and the file that proves it, from the root or one folder down. */
export interface LanguageFact {
  name: string;
  /** The marker, relative to the root: `pom.xml`, `admin/tsconfig.json`. */
  where: string;
}

/** A build, test or lint command the repository's own files name, and the folder it runs in. */
export interface CommandFact {
  name: 'build' | 'test' | 'lint' | 'typecheck';
  command: string;
  /** Relative to the root; empty for the root itself. */
  cwd: string;
  source: string;
}

export interface DatabaseFact {
  tech: string;
  source: string;
}

export interface PipelineFact {
  file: string;
  /** Job names, when the file could be read. */
  jobs: string[];
}

/** What `codeloop init` reads out of the repository's own files, and what it writes from that. */
export interface ProjectDetection {
  stack: DetectionResult;
  tools: ToolId[];
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | null;
  /** The known frameworks and test tools among the dependencies, in this order. */
  frameworks: string[];
  scripts: { test?: string; lint?: string; build?: string };
  /** What goes under `quality_checks:` in config.yaml. */
  qualityChecks: { name: string; command: string }[];
  /** What replaces `npm test` in the build lane's build stage. */
  testCommand?: string;
  /** Every language found, root first. Empty when nothing matched. */
  languages: LanguageFact[];
  /** The build, lint, typecheck and test commands the repository names, in the order learning runs them. */
  commands: CommandFact[];
  database: DatabaseFact[];
  pipeline: PipelineFact[];
  /** The main modules: top-level source folders, or the packages under a Java source root. */
  modules: string[];
  /** Set when no stack matched: what was looked for, so the terminal can say why it fell back to generic. */
  undetected?: string;
}

const FRAMEWORKS: [string, string[]][] = [
  ['next', ['next']],
  ['express', ['express']],
  ['fastify', ['fastify']],
  ['nest', ['@nestjs/core', '@nestjs/common']],
  ['react', ['react']],
  ['vite', ['vite']],
  ['vitest', ['vitest']],
  ['jest', ['jest']],
  ['playwright', ['@playwright/test', 'playwright']],
];

const LOCKFILES: [ProjectDetection['packageManager'], string][] = [
  ['pnpm', 'pnpm-lock.yaml'],
  ['yarn', 'yarn.lock'],
  ['bun', 'bun.lockb'],
  ['bun', 'bun.lock'],
  ['npm', 'package-lock.json'],
];

// Frameworks named in a manifest's text, by stack: the token to look for and the name reported.
const TEXT_FRAMEWORKS: Record<string, [string, string][]> = {
  java: [['spring-boot', 'spring-boot'], ['quarkus', 'quarkus'], ['micronaut', 'micronaut'], ['junit', 'junit'], ['hibernate', 'hibernate']],
  python: [['fastapi', 'fastapi'], ['flask', 'flask'], ['django', 'django'], ['sqlalchemy', 'sqlalchemy'], ['pytest', 'pytest']],
  dotnet: [['Microsoft.AspNetCore', 'aspnet'], ['xunit', 'xunit'], ['NUnit', 'nunit'], ['Microsoft.EntityFrameworkCore', 'entity-framework']],
  go: [['gin-gonic', 'gin'], ['labstack/echo', 'echo'], ['gorm.io', 'gorm']],
};

// Dependencies that mean a database, by the token found in a manifest and the name reported.
const DATABASE_DEPS: [string, string][] = [
  ['prisma', 'Prisma'], ['mongoose', 'MongoDB (mongoose)'], ['typeorm', 'TypeORM'], ['sequelize', 'Sequelize'], ['knex', 'Knex'], ['drizzle-orm', 'Drizzle'],
  ['sqlalchemy', 'SQLAlchemy'], ['django', 'Django ORM'], ['psycopg', 'PostgreSQL (psycopg)'], ['pymongo', 'MongoDB (pymongo)'],
  ['flyway', 'Flyway migrations'], ['liquibase', 'Liquibase migrations'], ['spring-boot-starter-data-jpa', 'Spring Data JPA'], ['hibernate', 'Hibernate'],
  ['Microsoft.EntityFrameworkCore', 'Entity Framework'], ['Dapper', 'Dapper'], ['Npgsql', 'PostgreSQL (Npgsql)'],
  ['gorm.io', 'GORM'], ['jackc/pgx', 'PostgreSQL (pgx)'], ['go-sql-driver/mysql', 'MySQL (go driver)'],
];
const COMPOSE_IMAGES: [RegExp, string][] = [[/postgres/i, 'PostgreSQL'], [/mysql|mariadb/i, 'MySQL'], [/mongo/i, 'MongoDB'], [/redis/i, 'Redis'], [/mssql|sqlserver/i, 'SQL Server']];
const MIGRATION_DIRS: [string, string][] = [['src/main/resources/db/migration', 'Flyway migrations'], ['db/migration', 'Flyway migrations'], ['alembic', 'Alembic migrations'], ['prisma/migrations', 'Prisma migrations'], ['migrations', 'migrations folder'], ['db/migrate', 'migrations folder']];
const PIPELINE_FILES = ['.gitlab-ci.yml', 'Jenkinsfile', 'azure-pipelines.yml', '.circleci/config.yml', 'bitbucket-pipelines.yml', '.buildkite/pipeline.yml'];

const read = (file: string): string => {
  try {
    return readFileSync(file, 'utf-8');
  } catch {
    return '';
  }
};

/** Folders one level down that may carry a second language: everything not skipped, not hidden. */
function subfolders(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name)).map(e => e.name).sort();
  } catch {
    return [];
  }
}

function packageCommands(dir: string, cwd: string): { present: boolean; commands: CommandFact[]; scripts: ProjectDetection['scripts']; pm: ProjectDetection['packageManager']; deps: Record<string, string> } {
  const out = { present: false, commands: [] as CommandFact[], scripts: {} as ProjectDetection['scripts'], pm: null as ProjectDetection['packageManager'], deps: {} as Record<string, string> };
  const file = join(dir, 'package.json');
  if (!existsSync(file)) return out;
  out.present = true;
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string>; scripts?: Record<string, string> };
  try {
    pkg = JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return out;
  }
  out.deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  out.pm = LOCKFILES.find(([, lock]) => existsSync(join(dir, lock)))?.[0] ?? 'npm';
  const scripts = pkg.scripts ?? {};
  for (const name of ['test', 'lint', 'build'] as const) if (typeof scripts[name] === 'string' && scripts[name].trim()) out.scripts[name] = scripts[name];
  const source = cwd ? `${cwd}/package.json` : 'package.json';
  // `run` is what every manager accepts; `test` is special-cased by all of them too. Build and
  // lint first: a test that fails because the build is broken says nothing about the tests.
  if (out.scripts.build) out.commands.push({ name: 'build', command: `${out.pm} run build`, cwd, source });
  if (out.scripts.lint) out.commands.push({ name: 'lint', command: `${out.pm} run lint`, cwd, source });
  if ('typescript' in out.deps && existsSync(join(dir, 'tsconfig.json'))) out.commands.push({ name: 'typecheck', command: 'npx tsc --noEmit', cwd, source });
  if (out.scripts.test) out.commands.push({ name: 'test', command: `${out.pm} test`, cwd, source });
  return out;
}

/** The commands a stack's own files name, for the folder the marker was found in. */
function stackCommands(stack: StackId, dir: string, cwd: string, marker: string): CommandFact[] {
  const source = cwd ? `${cwd}/${marker}` : marker;
  const wrapper = (name: string) => existsSync(join(dir, name));
  switch (stack) {
    case 'java': {
      if (marker === 'pom.xml') {
        const mvn = wrapper('mvnw') ? './mvnw' : 'mvn';
        return [{ name: 'build', command: `${mvn} -q compile`, cwd, source }, { name: 'test', command: `${mvn} -q test`, cwd, source }];
      }
      const gradle = wrapper('gradlew') ? './gradlew' : 'gradle';
      return [{ name: 'build', command: `${gradle} build -x test`, cwd, source }, { name: 'test', command: `${gradle} test`, cwd, source }];
    }
    case 'dotnet':
      return [{ name: 'build', command: 'dotnet build', cwd, source }, { name: 'test', command: 'dotnet test', cwd, source }];
    case 'go':
      return [{ name: 'build', command: 'go build ./...', cwd, source }, { name: 'test', command: 'go test ./...', cwd, source }];
    case 'python': {
      const text = read(join(dir, marker));
      const out: CommandFact[] = [];
      if (/\bruff\b/.test(text)) out.push({ name: 'lint', command: 'ruff check .', cwd, source });
      if (/\bmypy\b/.test(text)) out.push({ name: 'typecheck', command: 'mypy .', cwd, source });
      // pytest is the test runner unless the manifest names another; a tests folder is proof enough too.
      if (/pytest/.test(text) || existsSync(join(dir, 'tests')) || existsSync(join(dir, 'test'))) out.push({ name: 'test', command: 'pytest', cwd, source });
      return out;
    }
    default:
      return [];
  }
}

/** The manifest text frameworks and database tokens are looked for in. */
function manifestText(stack: StackId, dir: string, marker: string): string {
  if (stack === 'dotnet') {
    // Package references sit in each project file, not in the solution.
    const texts: string[] = [];
    const walk = (d: string, depth: number) => {
      if (depth > 3) return;
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) {
          if (!e.name.startsWith('.') && !SKIP_DIRS.has(e.name)) walk(join(d, e.name), depth + 1);
        } else if (e.name.endsWith('.csproj') || e.name.endsWith('.fsproj')) texts.push(read(join(d, e.name)));
      }
    };
    try {
      walk(dir, 0);
    } catch {
      /* unreadable folder; the solution file alone is enough to name the stack */
    }
    return texts.join('\n');
  }
  if (stack === 'go') return read(join(dir, 'go.mod'));
  return read(join(dir, marker));
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

/**
 * The main modules a person would name. A Java or Kotlin source root is walked down its single
 * package chain (`com/acme/billing`) and the packages under it are the modules; anything else
 * uses the top-level source folders, with `src/` opened one level.
 */
export function detectModules(projectDir: string): string[] {
  for (const root of ['src/main/java', 'src/main/kotlin']) {
    let dir = join(projectDir, root);
    if (!existsSync(dir)) continue;
    for (let depth = 0; depth < 8; depth++) {
      const entries = readdirSync(dir, { withFileTypes: true }).filter(e => !e.name.startsWith('.'));
      const dirs = entries.filter(e => e.isDirectory());
      if (dirs.length === 1 && entries.length === 1) {
        dir = join(dir, dirs[0].name);
        continue;
      }
      if (dirs.length > 0) return dirs.map(e => e.name).sort();
      break;
    }
  }
  const folders = scanTopFolders(projectDir);
  // `src/x` entries already name the layer; the bare `src` beside them says nothing more.
  const nested = folders.filter(f => f.startsWith('src/')).map(f => f.slice(4));
  return nested.length ? nested : folders;
}

function detectDatabase(projectDir: string, manifests: { text: string; source: string }[]): DatabaseFact[] {
  const out: DatabaseFact[] = [];
  const seen = new Set<string>();
  const add = (tech: string, source: string) => {
    if (seen.has(tech)) return;
    seen.add(tech);
    out.push({ tech, source });
  };
  for (const name of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']) {
    const file = join(projectDir, name);
    if (!existsSync(file)) continue;
    try {
      const doc = parseYaml(readFileSync(file, 'utf-8')) as { services?: Record<string, { image?: string }> };
      for (const [svc, def] of Object.entries(doc.services ?? {})) {
        const image = `${def?.image ?? ''} ${svc}`;
        for (const [re, tech] of COMPOSE_IMAGES) if (re.test(image)) add(tech, `${name} service ${svc}`);
      }
    } catch {
      /* malformed compose file */
    }
  }
  for (const m of manifests) for (const [token, tech] of DATABASE_DEPS) if (m.text.includes(token)) add(tech, m.source);
  for (const [dir, tech] of MIGRATION_DIRS) if (existsSync(join(projectDir, dir))) add(tech, dir);
  return out;
}

function detectPipeline(projectDir: string): PipelineFact[] {
  const out: PipelineFact[] = [];
  const workflows = join(projectDir, '.github', 'workflows');
  if (existsSync(workflows)) {
    for (const f of readdirSync(workflows).filter(n => /\.ya?ml$/.test(n)).sort()) {
      let jobs: string[] = [];
      try {
        const doc = parseYaml(readFileSync(join(workflows, f), 'utf-8')) as { jobs?: Record<string, unknown> };
        jobs = Object.keys(doc.jobs ?? {});
      } catch {
        /* unreadable workflow; the file still counts as the pipeline */
      }
      out.push({ file: `.github/workflows/${f}`, jobs });
    }
  }
  for (const file of PIPELINE_FILES) if (existsSync(join(projectDir, file))) out.push({ file, jobs: [] });
  return out;
}

export function detectProject(projectDir: string): ProjectDetection {
  const out: ProjectDetection = { stack: detectStack(projectDir), tools: detectTools(projectDir), packageManager: null, frameworks: [], scripts: {}, qualityChecks: [], languages: [], commands: [], database: [], pipeline: [], modules: [] };
  const manifests: { text: string; source: string }[] = [];

  // Every language at the root, then one folder down: a Java service with a TypeScript admin
  // names both, and the admin's build runs from its own folder.
  for (const cwd of ['', ...subfolders(projectDir)]) {
    const dir = cwd ? join(projectDir, cwd) : projectDir;
    for (const rule of rules) {
      const marker = markerIn(dir, rule);
      if (!marker) continue;
      if (cwd && out.languages.some(l => l.name === rule.language)) continue;
      out.languages.push({ name: rule.language, where: cwd ? `${cwd}/${marker}` : marker });
      if (rule.stack === 'node-typescript') continue; // package.json below carries the commands
      const text = manifestText(rule.stack, dir, marker);
      manifests.push({ text, source: cwd ? `${cwd}/${marker}` : marker });
      for (const [token, name] of TEXT_FRAMEWORKS[rule.stack] ?? []) if (text.includes(token) && !out.frameworks.includes(name)) out.frameworks.push(name);
      out.commands.push(...stackCommands(rule.stack, dir, cwd, marker));
    }
    const pkg = packageCommands(dir, cwd);
    if (!pkg.present) continue;
    manifests.push({ text: Object.keys(pkg.deps).join('\n'), source: cwd ? `${cwd}/package.json` : 'package.json' });
    if (!cwd) {
      out.packageManager = pkg.pm;
      out.scripts = pkg.scripts;
      out.frameworks.push(...FRAMEWORKS.filter(([, names]) => names.some(n => n in pkg.deps)).map(([id]) => id).filter(id => !out.frameworks.includes(id)));
      // A JavaScript project without tsconfig is still Node.
      if (!out.languages.some(l => l.name === 'TypeScript')) out.languages.push({ name: 'JavaScript (Node.js)', where: 'package.json' });
    }
    out.commands.push(...pkg.commands);
  }

  // The root's lint, typecheck and build, in that order, are the config's `quality_checks:`; the
  // root's test command is the lane's.
  const root = out.commands.filter(c => !c.cwd);
  for (const [name, label] of [['lint', 'Lint'], ['typecheck', 'Typecheck'], ['build', 'Build']] as const) {
    const c = root.find(x => x.name === name);
    if (c) out.qualityChecks.push({ name: label, command: c.command });
  }
  out.testCommand = out.commands.find(c => c.name === 'test' && !c.cwd)?.command ?? out.commands.find(c => c.name === 'test')?.command;
  out.database = detectDatabase(projectDir, manifests);
  out.pipeline = detectPipeline(projectDir);
  out.modules = detectModules(projectDir);
  if (out.stack.stack === 'generic') out.undetected = `stack not detected: no ${rules.flatMap(r => r.files).join(', ')} at the root, so the generic config is used`;
  return out;
}
