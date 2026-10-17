import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const TEST_DIST = fileURLToPath(new URL('./.test-dist', import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globalSetup: './vitest.global-setup.ts',
    setupFiles: ['./vitest.setup.ts'],
    // Serial on purpose: the suite spawns the CLI (a node process each) from 20 files, and parallel
    // files multiplied that into 133 workers and 91 children, exhausting memory. Two workers at most,
    // files one at a time, tests within a file in order.
    fileParallelism: false,
    maxWorkers: 2,
    isolate: true,
    sequence: { concurrent: false },
    // Every CLI the tests spawn inherits this, so `init` and `serve` register throwaway projects in a
    // temp registry, never in the person's ~/.codeloop/projects.json.
    // Session ids are cleared so a test run inside an agent session behaves like one outside it.
    // The CLI tests spawn is built into .test-dist by the global setup, never into dist, which is the
    // linked global codeloop other projects run while a test suite is going.
    env: { CODELOOP_HOME: join(tmpdir(), `codeloop-test-home-${process.pid}`), CLAUDE_CODE_SESSION_ID: '', CURSOR_SESSION_ID: '', CODELOOP_TEST_DIST: TEST_DIST },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
    },
  },
});
