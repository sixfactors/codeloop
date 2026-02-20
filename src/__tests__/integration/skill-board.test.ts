import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = join(__dirname, '..', '..', '..', 'templates', 'commands');

function readTemplate(name: string): string {
  return readFileSync(join(TEMPLATES_DIR, `${name}.md`), 'utf-8');
}

describe('skill → board integration', () => {
  describe('plan.md', () => {
    it('references board.json update', () => {
      const content = readTemplate('plan');
      expect(content).toContain('board.json');
      expect(content).toContain('.codeloop/board.json');
    });

    it('board update is conditional on file existence', () => {
      const content = readTemplate('plan');
      expect(content).toMatch(/if.*\.codeloop\/board\.json.*exists/i);
    });

    it('creates task with planned status', () => {
      const content = readTemplate('plan');
      expect(content).toContain('"planned"');
    });
  });

  describe('manage.md', () => {
    it('references board.json update', () => {
      const content = readTemplate('manage');
      expect(content).toContain('board.json');
      expect(content).toContain('.codeloop/board.json');
    });

    it('board update is conditional on file existence', () => {
      const content = readTemplate('manage');
      expect(content).toMatch(/if.*\.codeloop\/board\.json.*exists/i);
    });

    it('updates step done status', () => {
      const content = readTemplate('manage');
      expect(content).toContain('done');
      expect(content).toContain('step');
    });

    it('transitions to in_progress on first step', () => {
      const content = readTemplate('manage');
      expect(content).toContain('in_progress');
    });

    it('transitions to review when all steps done', () => {
      const content = readTemplate('manage');
      expect(content).toContain('review');
    });
  });

  describe('commit.md', () => {
    it('references board.json update', () => {
      const content = readTemplate('commit');
      expect(content).toContain('board.json');
      expect(content).toContain('.codeloop/board.json');
    });

    it('board update is conditional on file existence', () => {
      const content = readTemplate('commit');
      expect(content).toMatch(/if.*\.codeloop\/board\.json.*exists/i);
    });

    it('appends commit SHA to task', () => {
      const content = readTemplate('commit');
      expect(content).toContain('commit SHA');
      expect(content).toContain('commits');
    });
  });

  describe('all templates', () => {
    it('have version 0.2.0', () => {
      for (const name of ['plan', 'manage', 'commit']) {
        const content = readTemplate(name);
        expect(content).toContain('codeloop-version: 0.2.0');
      }
    });
  });
});
