import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  loadLockfile,
  saveLockfile,
  lockSkill,
  unlockSkill,
  computeIntegrity,
  type Lockfile,
} from '../lockfile.js';

describe('lockfile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'codeloop-lock-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty lockfile when no file exists', () => {
    const lockfile = loadLockfile(tmpDir);
    expect(lockfile.installed).toEqual({});
  });

  it('saves and loads lockfile', () => {
    const lockfile = {
      installed: {
        'my-skill': {
          version: '1.0.0',
          source: 'registry:my-skill',
          tier: 'community' as const,
          installed: '2026-02-21',
          integrity: 'sha256-abc123',
          files: ['.claude/commands/my-skill.md'],
        },
      },
    };

    saveLockfile(tmpDir, lockfile);
    expect(existsSync(join(tmpDir, '.codeloop/skills.lock'))).toBe(true);

    const loaded = loadLockfile(tmpDir);
    expect(loaded.installed['my-skill'].version).toBe('1.0.0');
    expect(loaded.installed['my-skill'].source).toBe('registry:my-skill');
    expect(loaded.installed['my-skill'].tier).toBe('community');
  });

  it('adds skills to lockfile', () => {
    let lockfile: Lockfile = { installed: {} };
    lockfile = lockSkill(lockfile, 'skill-a', {
      version: '1.0.0',
      source: 'registry:skill-a',
      tier: 'trusted',
      installed: '2026-02-21',
      integrity: 'sha256-aaa',
      files: ['.claude/commands/skill-a.md'],
    });
    lockfile = lockSkill(lockfile, 'skill-b', {
      version: '2.0.0',
      source: 'github:user/repo',
      tier: 'community',
      installed: '2026-02-21',
      integrity: 'sha256-bbb',
      files: ['.claude/commands/skill-b.md'],
    });

    expect(Object.keys(lockfile.installed)).toEqual(['skill-a', 'skill-b']);
    expect(lockfile.installed['skill-a'].version).toBe('1.0.0');
    expect(lockfile.installed['skill-b'].version).toBe('2.0.0');
  });

  it('removes skills from lockfile', () => {
    let lockfile = lockSkill({ installed: {} }, 'skill-a', {
      version: '1.0.0',
      source: 'registry:skill-a',
      tier: 'trusted',
      installed: '2026-02-21',
      integrity: 'sha256-aaa',
      files: [],
    });
    lockfile = lockSkill(lockfile, 'skill-b', {
      version: '2.0.0',
      source: 'registry:skill-b',
      tier: 'community',
      installed: '2026-02-21',
      integrity: 'sha256-bbb',
      files: [],
    });

    lockfile = unlockSkill(lockfile, 'skill-a');
    expect(Object.keys(lockfile.installed)).toEqual(['skill-b']);
  });

  it('computes deterministic integrity hashes', () => {
    const content = 'Hello, world!';
    const hash1 = computeIntegrity(content);
    const hash2 = computeIntegrity(content);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^sha256-[a-f0-9]{12}$/);
  });

  it('produces different hashes for different content', () => {
    const hash1 = computeIntegrity('content A');
    const hash2 = computeIntegrity('content B');
    expect(hash1).not.toBe(hash2);
  });
});
