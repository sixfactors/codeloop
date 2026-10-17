import { spawnSync } from 'child_process';
import { existsSync } from 'fs';

// Some tests spawn the built CLI or import dist/ from child processes (the MCP server, concurrent
// writers), so the build has to match the source before any of them run. The safe build swaps dist
// in only when the new output parses and loads, because dist is also the linked global CLI; type
// errors are allowed here (`npm run build` is where those fail), a module that does not load is not.
export default function setup(): void {
  const build = spawnSync(process.execPath, ['scripts/build-safe.mjs', '--allow-type-errors'], { encoding: 'utf-8' });
  if (build.status !== 0) console.error(`${build.stderr.trim()}\ntests run against the previous dist`);
  if (!existsSync('dist/index.js')) throw new Error('dist/index.js was not built; run `npm run build` to see why');
}
