import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

// Some tests spawn the built CLI or import compiled modules from child processes, so a build has to
// match the source before any of them run. It goes to .test-dist, never dist: dist is the linked
// global codeloop that every other project runs, and a test run must not replace it. Type errors are
// allowed here (`npm run build` is where those fail); a module that does not load is not.
export default function setup(): void {
  const build = spawnSync(process.execPath, ['scripts/build-safe.mjs', '--out', '.test-dist', '--allow-type-errors'], { encoding: 'utf-8' });
  if (build.status !== 0) console.error(`${build.stderr.trim()}\ntests run against the previous .test-dist`);
  if (!existsSync(join('.test-dist', 'index.js'))) throw new Error('.test-dist/index.js was not built; run `node scripts/build-safe.mjs --out .test-dist` to see why');
}
