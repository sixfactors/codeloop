import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { scaffold } from '../scaffold.js';
import { loadBoard } from '../board.js';

describe('scaffold board', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'codeloop-scaffold-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('copies board.json to .codeloop/ during init', () => {
    const result = scaffold(tmpDir, 'generic.yaml', ['claude']);
    const boardPath = join(tmpDir, '.codeloop', 'board.json');

    expect(existsSync(boardPath)).toBe(true);
    expect(result.created).toContain('.codeloop/board.json');

    // Verify it's a valid board
    const board = loadBoard(tmpDir);
    expect(board.version).toBe(1);
    expect(board.tasks).toEqual([]);
    expect(board.columns).toEqual(['backlog', 'planned', 'in_progress', 'review', 'done']);
  });

  it('skips board.json if already exists', () => {
    // Pre-create board.json with a task
    const codeloopDir = join(tmpDir, '.codeloop');
    mkdirSync(codeloopDir, { recursive: true });
    writeFileSync(
      join(codeloopDir, 'board.json'),
      JSON.stringify({ version: 1, columns: [], tasks: [{ id: 't-001', title: 'Existing' }] }),
    );

    const result = scaffold(tmpDir, 'generic.yaml', ['claude']);

    expect(result.skipped).toContain('.codeloop/board.json');
    expect(result.created).not.toContain('.codeloop/board.json');

    // Verify existing content was NOT overwritten
    const content = readFileSync(join(codeloopDir, 'board.json'), 'utf-8');
    expect(content).toContain('Existing');
  });
});
