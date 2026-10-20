import { Command } from 'commander';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { movedNotice, RefusalError } from './lib/cards.js';
import { assertStoreReady } from './lib/store-home.js';
import { legacyNotice } from './lib/paths.js';
import { projectRoot } from './lib/project-root.js';

// Read from package.json directly: createRequire plus a JSON parse is the same work, and this keeps
// the fast path free of anything but fs.
const version = (): string =>
  (JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8')) as { version: string }).version;

const NO_SYNC = new Set(['cloud', 'init', 'check', 'help']);

/** The program shell: name, version and the step every command runs first. */
export function baseProgram(): Command {
  const program = new Command();
  program
    .name('codeloop')
    .description('Self-improving development workflow for AI coding agents')
    .version(version());

  // With the cloud connected, every command first pushes pending writes and takes what changed there.
  // cloud.js and the lib behind it load only when .codeloop/cloud.json exists: `guard` runs on every
  // tool call and has no use for them otherwise.
  program.hook('preAction', async (_program, action) => {
    let top = action;
    while (top.parent && top.parent !== program) top = top.parent;
    const root = projectRoot();
    if (!NO_SYNC.has(top.name()) && !process.env.CODELOOP_NO_SYNC && existsSync(join(root, '.codeloop/cloud.json'))) {
      (await import('./commands/cloud.js')).syncBeforeCommand(top.name());
    }
    // store.home: user keeps the board outside the repo, reached through links in the main tree;
    // every command but `store` itself needs them in place first.
    // A hook runs outside each command's guard(), so its refusal is printed and exited here: one
    // line and exit 2, never an uncaught stack trace.
    if (top.name() !== 'store' && existsSync(join(root, '.codeloop'))) {
      try {
        assertStoreReady(root);
      } catch (e) {
        if (!(e instanceof RefusalError)) throw e;
        console.error(`codeloop: ${e.message}`);
        process.exit(2);
      }
    }
    // The legacy layout is announced on every command a person runs (on stderr, so JSON stays clean);
    // the hooks a host runs on every tool call stay quiet.
    if (!['store', 'guard', 'hookd'].includes(top.name()) && existsSync(join(root, '.codeloop'))) {
      const notice = legacyNotice(root);
      if (notice) console.error(notice);
      // A board that moved to v2 (c-330): reads here show the v1 copy and say so, once per command;
      // the guard verbs print it themselves, so the hook daemon path says it too.
      const moved = movedNotice(root);
      if (moved) console.error(moved);
    }
  });
  return program;
}
