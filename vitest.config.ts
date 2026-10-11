import { tmpdir } from 'os';
import { join } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globalSetup: './vitest.global-setup.ts',
    // Every CLI the tests spawn inherits this, so `init` and `serve` register throwaway projects in a
    // temp registry, never in the person's ~/.codeloop/projects.json.
    // Session ids are cleared so a test run inside an agent session behaves like one outside it.
    env: { CODELOOP_HOME: join(tmpdir(), `codeloop-test-home-${process.pid}`), CLAUDE_CODE_SESSION_ID: '', CURSOR_SESSION_ID: '' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
    },
  },
});
