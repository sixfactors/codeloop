import { Command } from 'commander';
import { openStore, pendingMigrations, readStoreRecord, runMigrations } from '../lib/store/index.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { CONFIG_FILE } from '../lib/config.js';
import { moveStore, storeWhere, userStoreDir } from '../lib/store-home.js';
import { withRunLockSync } from '../lib/run-lock.js';
import { guard, refuse } from './guard.js';
import { projectRoot } from '../sdk/local.js';

export const storeCommand = new Command('store').description('The store under the board: which driver, which migrations have run');

storeCommand
  .command('status')
  .description('Show the driver in use and the migrations applied and pending')
  .option('--json', 'JSON output')
  .action(guard(async (opts: { json?: boolean }) => {
    const projectDir = projectRoot();
    const store = openStore(projectDir);
    await store.close();
    const status = { driver: store.constructor.name.replace(/Driver$/, '').toLowerCase(), applied: readStoreRecord(projectDir).applied, pending: pendingMigrations(projectDir).map(m => m.id) };
    if (opts.json) console.log(JSON.stringify(status, null, 2));
    else {
      console.log(`driver: ${status.driver}`);
      console.log(`applied: ${status.applied.map(a => a.id).join(', ') || 'none'}`);
      console.log(`pending: ${status.pending.join(', ') || 'none'}`);
    }
  }));

storeCommand
  .command('migrate')
  .description('Apply the pending migrations and record them in .codeloop/store.json')
  .action(guard(async () => {
    const projectDir = projectRoot();
    const store = openStore(projectDir);
    const ran = await runMigrations(projectDir, store);
    await store.close();
    if (ran.length === 0) console.log('nothing pending');
    for (const m of ran) console.log(`applied ${m.id}${m.note ? `: ${m.note}` : ''}`);
  }));

storeCommand
  .command('where')
  .description('Print where the board and story files resolve: store.home, the store folder and each path')
  .option('--json', 'JSON output')
  .action(guard(async (opts: { json?: boolean }) => {
    const where = storeWhere(projectRoot());
    if (opts.json) return console.log(JSON.stringify(where, null, 2));
    console.log(`store.home: ${where.home}`);
    console.log(`store: ${where.dir}`);
    for (const i of where.items) console.log(`  ${i.item.padEnd(22)} ${i.home.padEnd(5)} ${i.resolved}${i.link ? ' (linked)' : ''}`);
  }));

storeCommand
  .command('move')
  .description('Copy the board and story files to the other home and set store.home; the old copy is left for you to delete')
  .requiredOption('--to <home>', 'user (~/.codeloop/projects/<id>/) or repo')
  .action(guard(async (opts: { to: string }) => {
    if (opts.to !== 'user' && opts.to !== 'repo') throw refuse(`--to is user or repo, not "${opts.to}"`);
    const projectDir = projectRoot();
    const config = join(projectDir, CONFIG_FILE);
    // Moving the board while a run reads it would lose that run's writes: the repo lock first.
    const moved = withRunLockSync(projectDir, 'store move', () => moveStore(projectDir, opts.to as 'user' | 'repo', { read: () => (existsSync(config) ? readFileSync(config, 'utf-8') : ''), write: text => writeFileSync(config, text) }));
    console.log(`  store.home: ${moved.to}; copied ${moved.copied.join(', ') || 'nothing'}`);
    if (moved.to === 'user') {
      console.log(`  The repo copies are untouched. Once you have checked ${userStoreDir(projectDir)}, delete them; codeloop links each path into the store on its next run:`);
      console.log(`    git rm -r -q --cached ${moved.toDelete.join(' ')} && rm -rf ${moved.toDelete.join(' ')}`);
      console.log(`    printf '%s\\n' ${moved.toDelete.map(p => `'/${p}'`).join(' ')} >> .gitignore`);
    } else if (moved.toDelete.length) {
      console.log('  The user-home copy is untouched. Delete it once the repo copy is checked:');
      console.log(`    rm -rf ${userStoreDir(projectDir)}`);
    }
  }));
