import { spawnSync } from 'child_process';
import { existsSync } from 'fs';

// Some tests spawn the built CLI or import dist/ from child processes (the MCP server, concurrent
// writers), so the build has to match the source before any of them run. tsc emits even when it
// reports type errors, and `npm run build` is where those fail; here only a missing build does.
export default function setup(): void {
  spawnSync('npx', ['tsc'], { stdio: 'ignore' });
  if (!existsSync('dist/index.js')) throw new Error('dist/index.js was not built; run `npm run build` to see why');
}
