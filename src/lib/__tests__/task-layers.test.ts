import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { checkSpec } from '../spec.js';

let dir: string;

function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

const SPEC = 'Story: As a founder, I can do the thing, so that it is done.\nsize: S\nmetric: no-data\ndone_when: npm test exits 0\nacceptance:\n- US1 Given a, when b, then c.\n';
const LAYERS = 'layers:\n  api: ["src/lib/**", "src/commands/**"]\n  ui: ["workspace/**", "ui/**"]\n';

const check = (task: string, config?: string) => {
  if (config !== undefined) write('.codeloop/config.yaml', config);
  write('specs/001/spec.md', SPEC);
  write('specs/001/tasks.md', `- [ ] T003 [US1] ${task}\n`);
  return checkSpec(dir, 'specs/001');
};

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'codeloop-layers-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('task layer check', () => {
  it('passes an [api] task naming a file in the api layer', () => {
    expect(check('[api] Add src/lib/x.ts', LAYERS)).toEqual([]);
  });

  it('fails an [api] task naming a file in the ui layer, naming the layer', () => {
    expect(check('[api] Edit workspace/app/page.tsx', LAYERS)).toEqual(['T003 [api] names workspace/app/page.tsx, which is in the ui layer']);
  });

  it('reports no layer errors without a layers: block', () => {
    expect(check('[api] Edit workspace/app/page.tsx', 'name: x\n')).toEqual([]);
  });

  it('passes a [ui] task naming a path in no layer', () => {
    expect(check('[ui] Touch scripts/other/thing.sh', LAYERS)).toEqual([]);
  });

  it('does not check a layer with no globs configured', () => {
    expect(check('[sdk] Edit workspace/app/page.tsx', LAYERS)).toEqual([]);
  });
});
