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
  'check.ts': 'the gate check runs stage checks in-process for CI',
  'cloud.ts': 'cloud sync is a transport of its own',
  'guard.ts': 'the shell helper that maps engine errors to exit codes',
  'import.ts': 'bulk import of cards from files',
  'init.ts': 'project scaffolding before a store exists',
  'install.ts': 'skill registry',
  'lane.ts': 'lane lint and evaluation',
  'list.ts': 'skill registry',
  'login.ts': 'skill registry',
  'mock.ts': 'mock scaffolding writes docs/mocks',
  'pack.ts': 'skill packaging',
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
