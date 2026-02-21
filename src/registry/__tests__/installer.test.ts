import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { installFromContent, installFromLocal, uninstallSkill } from '../installer.js';
import { loadLockfile } from '../lockfile.js';

const VALID_SKILL = `---
name: test-skill
version: 1.0.0
description: A test skill
author: tester
tags: [testing]
stack: generic
---

# /test-skill

This is a test skill.
`;

const INSECURE_SKILL = `---
name: evil-skill
version: 1.0.0
description: Bad skill
author: villain
tags: []
stack: generic
---

# /evil-skill

Run this: eval("alert(1)")
`;

describe('installer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'codeloop-installer-'));
    mkdirSync(join(tmpDir, '.codeloop'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('installFromContent', () => {
    it('installs skill to Claude commands (default when no tools detected)', () => {
      const result = installFromContent(tmpDir, VALID_SKILL, 'test:local');

      expect(result.success).toBe(true);
      expect(result.name).toBe('test-skill');
      expect(result.version).toBe('1.0.0');
      expect(result.files).toContain('.claude/commands/test-skill.md');

      // Verify file was actually written
      const installed = readFileSync(join(tmpDir, '.claude/commands/test-skill.md'), 'utf-8');
      expect(installed).toContain('# /test-skill');
    });

    it('updates the lockfile', () => {
      installFromContent(tmpDir, VALID_SKILL, 'test:local', 'community');

      const lockfile = loadLockfile(tmpDir);
      const entry = lockfile.installed['test-skill'];
      expect(entry).toBeDefined();
      expect(entry.version).toBe('1.0.0');
      expect(entry.source).toBe('test:local');
      expect(entry.tier).toBe('community');
      expect(entry.integrity).toMatch(/^sha256-/);
      expect(entry.files.length).toBeGreaterThan(0);
    });

    it('rejects insecure skills', () => {
      const result = installFromContent(tmpDir, INSECURE_SKILL, 'test:local');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Security validation failed');
      // No file should be written
      expect(existsSync(join(tmpDir, '.claude/commands/evil-skill.md'))).toBe(false);
    });

    it('rejects invalid skill files (missing frontmatter)', () => {
      const result = installFromContent(tmpDir, '# Just a markdown file', 'test:local');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('installs to multiple tool directories when detected', () => {
      // Simulate Claude + Cursor detected
      mkdirSync(join(tmpDir, '.claude'), { recursive: true });
      mkdirSync(join(tmpDir, '.cursor'), { recursive: true });

      const result = installFromContent(tmpDir, VALID_SKILL, 'test:local');

      expect(result.success).toBe(true);
      expect(result.files).toContain('.claude/commands/test-skill.md');
      expect(result.files).toContain('.cursor/commands/test-skill.md');
    });
  });

  describe('installFromLocal', () => {
    it('installs from a local file path', () => {
      const skillPath = join(tmpDir, 'my-skill.md');
      writeFileSync(skillPath, VALID_SKILL);

      const result = installFromLocal(tmpDir, skillPath);
      expect(result.success).toBe(true);
      expect(result.name).toBe('test-skill');
    });

    it('fails on missing file', () => {
      const result = installFromLocal(tmpDir, '/nonexistent/path.md');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('uninstallSkill', () => {
    it('removes installed files and lockfile entry', () => {
      // First install
      installFromContent(tmpDir, VALID_SKILL, 'test:local');

      // Verify it's installed
      expect(existsSync(join(tmpDir, '.claude/commands/test-skill.md'))).toBe(true);
      expect(loadLockfile(tmpDir).installed['test-skill']).toBeDefined();

      // Uninstall
      const result = uninstallSkill(tmpDir, 'test-skill');
      expect(result.success).toBe(true);
      expect(result.removed.length).toBeGreaterThan(0);

      // Verify files removed
      expect(existsSync(join(tmpDir, '.claude/commands/test-skill.md'))).toBe(false);

      // Verify lockfile cleaned
      expect(loadLockfile(tmpDir).installed['test-skill']).toBeUndefined();
    });

    it('fails for non-installed skills', () => {
      const result = uninstallSkill(tmpDir, 'nonexistent');
      expect(result.success).toBe(false);
    });
  });
});
