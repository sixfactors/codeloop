import { Command } from 'commander';
import { openStore, pendingMigrations, readStoreRecord, runMigrations } from '../lib/store/index.js';
import { guard } from './guard.js';

export const storeCommand = new Command('store').description('The store under the board: which driver, which migrations have run');

storeCommand
  .command('status')
  .description('Show the driver in use and the migrations applied and pending')
  .option('--json', 'JSON output')
  .action(guard(async (opts: { json?: boolean }) => {
    const projectDir = process.cwd();
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
    const projectDir = process.cwd();
    const store = openStore(projectDir);
    const ran = await runMigrations(projectDir, store);
    await store.close();
    if (ran.length === 0) console.log('nothing pending');
    for (const m of ran) console.log(`applied ${m.id}${m.note ? `: ${m.note}` : ''}`);
  }));
