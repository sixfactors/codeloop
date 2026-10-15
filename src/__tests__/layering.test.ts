import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * The onion (docs/architecture.md): a CLI command talks to the SDK, never to src/lib directly.
 * Two kinds of exception are listed here, each with the reason it exists. Add a command to the
 * SDK before adding it to this list.
 */

/** Whole files that still drive the engine directly: lane evaluation, packaging, cloud sync, project setup. */
const EXEMPT_FILES: Record<string, string> = {
  'adopt.ts': 'skills adoption writes .codeloop/skills.index.yaml; no SDK operation yet',
  'artifact.ts': 'artifact scaffolding writes docs/artifacts (and docs/mocks for the mock kind); no SDK operation yet',
  'check.ts': 'the gate check runs stage checks in-process for CI',
  'cloud.ts': 'cloud sync is a transport of its own',
  'guard.ts': 'the shell helper that maps engine errors to exit codes',
  'guard-hooks.ts': 'the host hooks (guard edit/prompt/diff, presence, whoami, card activate) read .codeloop/state directly; no SDK operation yet',
  'hookd.ts': 'starts the hook daemon process; host-local, no project operation',
  'ps.ts': 'reads the host process table and the memory ceiling in config; host-local, no project operation',
  'hub.ts': 'the hub process: builds the hub Hono app and the project registry is host-local state, not a project operation',
  'import.ts': 'bulk import of cards from files',
  'init.ts': 'project scaffolding before a store exists; also registers the project with the hub',
  'install.ts': 'skill registry',
  'lane.ts': 'lane lint and evaluation',
  'list.ts': 'skill registry',
  'login.ts': 'skill registry',
  'mock.ts': 'mock scaffolding writes the mock beside the spec',
  'off.ts': 'the pause switch is host-local state read by every hook before any project code loads; no SDK operation',
  'open.ts': 'reads serve.json and opens a browser; host-local like serve.ts, no SDK operation',
  'orch.ts': 'the orchestrator runs a builder agent to completion in this process; the API starts it in the background instead',
  'pack.ts': 'skill packaging',
  'projects.ts': 'the hub registry is host-local state, not a project operation',
  'publish.ts': 'skill registry',
  'remove.ts': 'skill registry',
  'render.ts': 'host file rendering, MCP and gate check',
  'run.ts': 'the unattended run starts agents; no SDK operation yet',
  'scan.ts': 'competitor scanning',
  'schedule.ts': 'cron scheduling',
  'search.ts': 'skill registry',
  'serve.ts': 'the API host: it builds the Hono app the http transport talks to',
  'spec.ts': 'spec folder scaffolding and task ticking',
  'status.ts': 'project status reads many engine files at once',
  'store.ts': 'store migrations',
  'update.ts': 'skill updates',
  'verify.ts': 'lane verification',
  'watch.ts': 'file watcher that hosts the API',
};

/** Per file: the one or two lib modules a migrated command may still import, with the reason. */
const ALLOWED_IMPORTS: Record<string, Record<string, string>> = {
  'wiki.ts': {
    '../lib/wiki.js': 'capture and learn write wiki pages; no SDK operation yet',
    '../lib/competitors.js': 'competitor pages; no SDK operation yet',
    '../lib/off.js': 'the Stop hook (`wiki capture --quiet`) must answer at once while codeloop is off, before any SDK client loads',
  },
};

const COMMANDS = join(dirname(fileURLToPath(import.meta.url)), '..', 'commands');
const IMPORT = /^\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/gm;

/** Every `../lib/...` import in a command file that the lists above do not allow. */
export function violations(file: string, source: string): string[] {
  if (file in EXEMPT_FILES) return [];
  const allowed = ALLOWED_IMPORTS[file] ?? {};
  const out: string[] = [];
  for (const m of source.matchAll(IMPORT)) {
    const spec = m[1];
    if (!spec.startsWith('../lib/')) continue;
    if (spec in allowed) continue;
    out.push(`${file} imports ${spec}: go through src/sdk instead`);
  }
  return out;
}

describe('layering: CLI commands reach the engine only through the SDK', () => {
  const files = readdirSync(COMMANDS).filter(f => f.endsWith('.ts'));

  it('no migrated command imports src/lib directly', () => {
    const found = files.flatMap(f => violations(f, readFileSync(join(COMMANDS, f), 'utf-8')));
    expect(found).toEqual([]);
  });

  it('the allow-lists name only files that exist', () => {
    for (const f of [...Object.keys(EXEMPT_FILES), ...Object.keys(ALLOWED_IMPORTS)]) expect(files, `${f} is listed but missing`).toContain(f);
  });

  it('the migrated commands are not exempt', () => {
    for (const f of ['card.ts', 'inbox.ts', 'ask.ts', 'brief.ts', 'wiki.ts']) expect(f in EXEMPT_FILES, `${f} must stay under the rule`).toBe(false);
  });

  it('reports a lib import in a migrated file (the check can fail)', () => {
    const source = "import { Command } from 'commander';\nimport { readCards } from '../lib/cards.js';\nimport type { Card } from '../lib/cards.js';\n";
    expect(violations('card.ts', source)).toEqual(['card.ts imports ../lib/cards.js: go through src/sdk instead', 'card.ts imports ../lib/cards.js: go through src/sdk instead']);
    expect(violations('wiki.ts', "import { capture } from '../lib/wiki.js';\n")).toEqual([]);
  });
});

/**
 * A builder runs inside its story worktree, whose cwd holds a stale committed copy of the board.
 * A command that reads cards, state, wiki or config from `process.cwd()` there reads that copy
 * (a gate once failed with `card "c-143" not found`), so board reads go through projectRoot().
 * Only these files may name the working directory, each for a reason that is about the directory
 * the user is standing in rather than the board.
 */
const CWD_ALLOWED: Record<string, string> = {
  'init.ts': 'scaffolds a new project into the directory the user is in, before any board exists',
  'serve.ts': 'finds the project to host by walking up from the directory the user is in',
  'off.ts': 'the pause switch is host-local state read by every hook before any project code loads; no SDK operation',
  'open.ts': 'finds the running server by walking up from the directory the user is in',
  'watch.ts': 'hosts the file watcher for the directory the user started it in',
  'publish.ts': 'publishes the skill package in the current directory',
  'pack.ts': 'packs the skill package in the current directory and resolves --out against it',
  'install.ts': 'installs skills into the project the user is in, not into a board',
  'remove.ts': 'removes installed skills from the project the user is in',
  'list.ts': 'lists installed skills of the project the user is in',
  'update.ts': 'updates installed skills of the project the user is in',
  'schedule.ts': 'installs the crontab entry for the repository the user is in',
};

describe('process.cwd() in commands', () => {
  it('appears only in the allow-listed files', () => {
    const offenders = readdirSync(COMMANDS)
      .filter(f => f.endsWith('.ts') && !(f in CWD_ALLOWED))
      .filter(f => /process\.cwd\(\)/.test(readFileSync(join(COMMANDS, f), 'utf-8')));
    expect(offenders).toEqual([]);
  });
});

/**
 * Everything codeloop writes lives under .codeloop (docs/plans: everything under .codeloop): only
 * src/lib/paths.ts knows where specs, evidence, shape, use cases, mocks and artifacts live. A
 * root-relative path to one of them anywhere else would write into the product's source tree.
 */
describe('story paths: only paths.ts names the folders', () => {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
  const ALLOWED: Record<string, string> = {
    'lib/paths.ts': 'the one module that knows the layouts',
    'lib/layout-move.ts': 'moves projects between the layouts, so it names both',
    'lib/import.ts': "reads a Spec Kit project's own specs/ folder, which is that tool's layout, not codeloop's",
  };
  const ROOT_PATH = /join\([^)]*['"`](specs|evidence|shape|usecases)['"`/]|[`'"](specs|evidence|shape|usecases)\/[$a-z{<]|['"`]docs\/(mocks|artifacts)/;
  const files = (dir: string): string[] =>
    readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? (e.name === '__tests__' ? [] : files(`${dir}/${e.name}`)) : e.name.endsWith('.ts') ? [`${dir}/${e.name}`] : []));

  it('no module outside paths.ts joins a root-relative specs, evidence, shape, usecases or docs/mocks path', () => {
    const found = ['lib', 'commands', 'sdk']
      .flatMap(files)
      .filter(f => !ALLOWED[f])
      .flatMap(f =>
        readFileSync(join(ROOT, f), 'utf-8')
          .split('\n')
          .map((line, i) => ({ line: line.trim(), at: `${f}:${i + 1}` }))
          // Comments describe the layout; only code can write into it.
          .filter(({ line }) => !/^(\/\/|\*|\/\*)/.test(line) && ROOT_PATH.test(line))
          .map(({ at, line }) => `${at}: ${line.slice(0, 120)}`),
      );
    expect(found).toEqual([]);
  });
});
