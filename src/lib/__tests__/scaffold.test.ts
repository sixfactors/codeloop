import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { scaffold } from '../scaffold.js';

describe('scaffold', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'codeloop-scaffold-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes the wiki tree and lanes, not board.json or gotchas.md', () => {
    const result = scaffold(tmpDir, 'generic.yaml', ['claude']);
    expect(existsSync(join(tmpDir, '.codeloop', 'board.json'))).toBe(false);
    expect(existsSync(join(tmpDir, '.codeloop', 'gotchas.md'))).toBe(false);
    expect(existsSync(join(tmpDir, '.codeloop', 'patterns.md'))).toBe(false);
    expect(existsSync(join(tmpDir, '.codeloop', 'lanes', 'build.yaml'))).toBe(true);
    expect(existsSync(join(tmpDir, '.codeloop', 'wiki', 'INDEX.md'))).toBe(true);
    expect(existsSync(join(tmpDir, '.codeloop', 'wiki', 'gotchas'))).toBe(true);
    expect(result.created).toContain('.codeloop/wiki/INDEX.md');
    expect(result.created).not.toContain('.codeloop/board.json');
  });

  it('does not overwrite an existing wiki INDEX.md', () => {
    const wiki = join(tmpDir, '.codeloop', 'wiki');
    mkdirSync(wiki, { recursive: true });
    writeFileSync(join(wiki, 'INDEX.md'), '# Mine\n');
    scaffold(tmpDir, 'generic.yaml', ['claude']);
    expect(readFileSync(join(wiki, 'INDEX.md'), 'utf-8')).toBe('# Mine\n');
  });
});
