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
    env: { CODELOOP_HOME: join(tmpdir(), `codeloop-test-home-${process.pid}`) },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
    },
  },
});
