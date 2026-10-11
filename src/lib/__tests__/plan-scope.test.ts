import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { pathInPlan, planFiles } from '../plan-scope.js';
import type { Card } from '../cards.js';

function plan(body: string): { dir: string; files: string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'plan-scope-'));
  mkdirSync(join(dir, 'specs/026'), { recursive: true });
  writeFileSync(join(dir, 'specs/026/plan.md'), `# Plan\n\n## Files\n\n${body}\n\n## Risks\n\n- none\n`);
  return { dir, files: planFiles(dir, { id: 'c-026', spec: 'specs/026' } as Card) ?? [] };
}

describe('the plan guard matches the files the plan lists', () => {
  it('reads paths written in backticks, with a trailing note, or with ./', () => {
    const { files } = plan('- `services/tools/src/store/egress.py`\n- `services/tools/tests/test_egress.py` (new)\n- ./docs/tools.md: the page');
    expect(files).toEqual(['services/tools/src/store/egress.py', 'services/tools/tests/test_egress.py', 'docs/tools.md']);
  });

  it('accepts the absolute path a host hook sends for a planned file', () => {
    const { dir, files } = plan('- `services/tools/src/store/egress.py`');
    expect(pathInPlan(dir, files, join(dir, 'services/tools/src/store/egress.py'))).toBe(true);
    expect(pathInPlan(dir, files, join(dir, 'services/tools/src/store/other.py'))).toBe(false);
  });

  it('keeps folders and globs working', () => {
    const { dir, files } = plan('- `services/tools/tests/`\n- `services/tools/src/**/*.py`');
    expect(pathInPlan(dir, files, join(dir, 'services/tools/tests/test_egress.py'))).toBe(true);
    expect(pathInPlan(dir, files, join(dir, 'services/tools/src/store/egress.py'))).toBe(true);
    expect(pathInPlan(dir, files, join(dir, 'services/tools/src/store/egress.ts'))).toBe(false);
  });
});
