import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PACKAGE_ROOT = join(__dirname, '..', '..', '..');

const SKILL_NAMES = ['design', 'plan', 'manage', 'test', 'commit', 'qa', 'deploy', 'debug', 'reflect', 'ship'];
const STARTER_NAMES = ['generic.yaml', 'node-typescript.yaml', 'python.yaml', 'go.yaml'];

describe('package integrity', () => {
  it('all 10 skill templates exist', () => {
    for (const name of SKILL_NAMES) {
      const path = join(PACKAGE_ROOT, `templates/commands/${name}.md`);
      expect(existsSync(path), `Missing template: ${name}.md`).toBe(true);
    }
  });

  it('all skill templates have version tags', () => {
    for (const name of SKILL_NAMES) {
      const path = join(PACKAGE_ROOT, `templates/commands/${name}.md`);
      const content = require('fs').readFileSync(path, 'utf-8');
      expect(content, `${name}.md missing version tag`).toMatch(/<!--\s*codeloop-version:\s*[\d.]+\s*-->/);
    }
  });

  it('all 4 starter configs exist', () => {
    for (const name of STARTER_NAMES) {
      const path = join(PACKAGE_ROOT, `starters/${name}`);
      expect(existsSync(path), `Missing starter: ${name}`).toBe(true);
    }
  });

  it('knowledge templates exist', () => {
    const files = ['board.json', 'rules.md', 'gotchas.md', 'patterns.md', 'principles.md'];
    for (const file of files) {
      const path = join(PACKAGE_ROOT, `templates/codeloop/${file}`);
      expect(existsSync(path), `Missing knowledge template: ${file}`).toBe(true);
    }
  });

  it('local registry index exists and has entries', () => {
    const path = join(PACKAGE_ROOT, 'registry/index.json');
    expect(existsSync(path)).toBe(true);

    const content = JSON.parse(require('fs').readFileSync(path, 'utf-8'));
    expect(content.version).toBe(1);
    expect(content.skills.length).toBe(SKILL_NAMES.length);
  });
});
