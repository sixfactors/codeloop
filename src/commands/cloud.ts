import { Command } from 'commander';
import chalk from 'chalk';
import { CloudConflictError, CloudError, connect, disconnect, pull, push, search, status, syncBefore } from '../lib/cloud.js';

const CONFLICT_HINT = 'Next: `codeloop cloud pull` takes the cloud board; `codeloop cloud push --force` replaces it with yours.';

/** Exit 3 on a version conflict, as for a local one; 1 for anything else the cloud refuses. */
function guardCloud<A extends unknown[]>(fn: (...args: A) => void) {
  return (...args: A): void => {
    try {
      fn(...args);
    } catch (e) {
      if (e instanceof CloudConflictError) {
        console.error(chalk.red(`conflict: ${e.message}`));
        console.error(CONFLICT_HINT);
        process.exit(3);
      }
      console.error(chalk.red(e instanceof CloudError ? e.message : String((e as Error).message)));
      process.exit(1);
    }
  };
}

// `cloud` commands sync themselves, `init` and `check` have nothing to sync, and a command started
// by a check or an agent runs inside one that has already synced. CODELOOP_NO_SYNC=1 skips the
// step for any command: a script that reads many times in a row would otherwise spend the
// endpoint's requests on listings.
const NO_SYNC = new Set(['cloud', 'init', 'check', 'help']);

/**
 * The step before every command while connected. What it did goes to stderr, so `--json` output
 * and the MCP server's stdout stay clean. A pending board write that the cloud has moved past
 * refuses the command with exit 3; any other trouble leaves the command to run on local files.
 */
export function syncBeforeCommand(command: string): void {
  if (NO_SYNC.has(command) || process.env.CODELOOP_NO_SYNC) return;
  try {
    for (const note of syncBefore(process.cwd())) console.error(chalk.dim(`  cloud: ${note}`));
  } catch (e) {
    if (e instanceof CloudConflictError) {
      console.error(chalk.red(`conflict: ${e.message}`));
      console.error(CONFLICT_HINT);
      process.exit(3);
    }
    console.error(chalk.yellow(`  cloud: ${(e as Error).message}; working from the local files`));
  }
}

export const cloudCommand = new Command('cloud').description('Optional: keep the board, wiki, config and lanes in a Protobox workspace as well as in the repo');

cloudCommand
  .command('connect')
  .description('Save the connection in .codeloop/cloud.json (gitignored) and upload the board, wiki, config.yaml and lanes')
  .requiredOption('--url <mcp url>', 'Workspace MCP URL')
  .requiredOption('--key <api key>', 'Workspace API key (stored in cloud.json, never printed)')
  .option('--workspace-name <name>', 'A label for status output')
  .option('--folder <path>', 'Workspace folder for this project\'s pages (default: codeloop)')
  .action(guardCloud((opts: { url: string; key: string; workspaceName?: string; folder?: string }) => {
    const r = connect(process.cwd(), opts);
    console.log(r.adopted
      ? `  connected: a board page already exists (revision ${r.revision}) and was left as it is`
      : `  connected: board uploaded (revision ${r.revision})`);
    console.log(`  ${r.wikiPages} wiki pages uploaded`);
    r.notes.forEach(n => console.log(chalk.yellow(`  ${n}`)));
    if (r.adopted) console.log('Next: `codeloop cloud pull` to take the cloud board, or `codeloop cloud push --force` to replace it with yours.');
  }));

cloudCommand
  .command('status')
  .description('Workspace, page revision against the local version, and each document as in-sync, local-ahead, cloud-ahead or both-changed')
  .option('--json', 'JSON output')
  .action(guardCloud((opts: { json?: boolean }) => {
    const s = status(process.cwd());
    if (opts.json) {
      console.log(JSON.stringify(s, null, 2));
      return;
    }
    console.log(`  workspace: ${s.workspaceName ? `${s.workspaceName} ` : ''}${s.url}`);
    console.log(`  board page "${s.boardTitle}": revision ${s.pageRevision} (last seen here: ${s.lastSeenRevision})`);
    console.log(`  local cards.json: version ${s.localVersion}, ${s.cards} cards`);
    console.log(`  in sync: ${s.inSync ? 'yes' : 'no'}   wiki pages: ${s.wikiPages}`);
    for (const d of s.documents) {
      const state = d.state === 'in-sync' ? chalk.green(d.state.padEnd(12)) : chalk.yellow(d.state.padEnd(12));
      console.log(`  ${state} ${d.path}${d.pending ? chalk.dim('  (pending: kept locally while the cloud was unreachable)') : ''}`);
    }
  }));

cloudCommand
  .command('push')
  .description('Write the board, wiki pages and config that changed here to the cloud. Lanes are not pushed: they change through `lane promote`')
  .option('--force', 'Overwrite even if the cloud copy changed since it was last seen here')
  .action(guardCloud((opts: { force?: boolean }) => {
    const r = push(process.cwd(), opts);
    console.log(`  pushed: board revision ${r.revision}, ${r.wikiPages} wiki pages`);
    r.held.forEach(p => console.log(chalk.yellow(`  not pushed: ${p} was edited here; a lane changes through \`codeloop lane promote\``)));
  }));

cloudCommand
  .command('pull')
  .description('Take the cloud board, and every other cloud copy whose local file was not edited here')
  .option('--force', 'Take the cloud copy of every document, discarding local edits')
  .action(guardCloud((opts: { force?: boolean }) => {
    const r = pull(process.cwd(), opts);
    console.log(`  pulled: board revision ${r.revision}, ${r.wikiPages} wiki pages`);
    r.notes.forEach(n => console.log(chalk.yellow(`  ${n}`)));
  }));

cloudCommand
  .command('disconnect')
  .description('Push pending writes, pull everything back into the repo, then remove cloud.json')
  .action(guardCloud(() => {
    const r = disconnect(process.cwd());
    console.log(`  disconnected: board (revision ${r.revision}) and ${r.wikiPages} wiki pages are back in the repo; .codeloop/cloud.json removed`);
  }));

cloudCommand
  .command('search <query>')
  .description('Search the workspace knowledge base')
  .option('--json', 'JSON output')
  .action(guardCloud((query: string, opts: { json?: boolean }) => {
    const results = search(process.cwd(), query);
    if (opts.json) console.log(JSON.stringify(results, null, 2));
    else if (results.length === 0) console.log('  no results');
    else results.forEach(r => console.log(`  ${r.title}`));
  }));
