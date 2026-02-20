import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createBoard, addTask, type Board } from '../../lib/board.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = join(__dirname, '..', '..', '..', 'templates');

function readTemplate(path: string): string {
  return readFileSync(join(TEMPLATES_DIR, path), 'utf-8');
}

describe('TDD planning', () => {
  it('plan.md template contains acceptance criteria instructions', () => {
    const content = readTemplate('commands/plan.md');
    expect(content.toLowerCase()).toContain('acceptance criteria');
  });

  it('plan.md template contains test-first instructions', () => {
    const content = readTemplate('commands/plan.md');
    // Should reference writing tests before implementation
    expect(content.toLowerCase()).toMatch(/test.*before|red.*green|test.first/i);
  });

  it('principles.md contains TDD Default principle', () => {
    const content = readTemplate('codeloop/principles.md');
    expect(content).toContain('TDD');
  });

  it('board task model accepts acceptanceCriteria field', () => {
    let board: Board = createBoard();
    board = addTask(board, {
      title: 'TDD task',
      acceptanceCriteria: ['Tests pass', 'Coverage > 80%'],
    });

    expect(board.tasks[0].acceptanceCriteria).toEqual(['Tests pass', 'Coverage > 80%']);
  });

  it('acceptanceCriteria is optional (backward compatible)', () => {
    let board: Board = createBoard();
    board = addTask(board, { title: 'No criteria' });

    // Should not be set (undefined) rather than empty array
    expect(board.tasks[0].acceptanceCriteria).toBeUndefined();
  });
});
