import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadWatchConfig } from '../index.js';

describe('loadWatchConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'codeloop-watch-config-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns defaults when no config exists', () => {
    const config = loadWatchConfig(tmpDir);
    expect(config.enabled).toBe(true);
    expect(config.idle_timeout).toBe(300);
    expect(config.signals.file_change).toBe(true);
    expect(config.signals.git_commit).toBe(true);
    expect(config.ignore).toContain('node_modules');
  });

  it('returns defaults when config has no watch section', () => {
    mkdirSync(join(tmpDir, '.codeloop'), { recursive: true });
    writeFileSync(join(tmpDir, '.codeloop/config.yaml'), 'project:\n  name: test\n');

    const config = loadWatchConfig(tmpDir);
    expect(config.enabled).toBe(true);
    expect(config.idle_timeout).toBe(300);
  });

  it('merges watch config with defaults', () => {
    mkdirSync(join(tmpDir, '.codeloop'), { recursive: true });
    writeFileSync(
      join(tmpDir, '.codeloop/config.yaml'),
      `watch:
  enabled: false
  idle_timeout: 600
  signals:
    file_change: false
  ignore:
    - vendor
`,
    );

    const config = loadWatchConfig(tmpDir);
    expect(config.enabled).toBe(false);
    expect(config.idle_timeout).toBe(600);
    expect(config.signals.file_change).toBe(false);
    expect(config.signals.git_commit).toBe(true); // default preserved
    expect(config.ignore).toEqual(['vendor']);
  });

  it('handles malformed YAML gracefully', () => {
    mkdirSync(join(tmpDir, '.codeloop'), { recursive: true });
    writeFileSync(join(tmpDir, '.codeloop/config.yaml'), '{{not valid yaml');

    const config = loadWatchConfig(tmpDir);
    expect(config.enabled).toBe(true); // falls back to defaults
  });
});
