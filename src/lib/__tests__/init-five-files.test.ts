import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runCli } from '../../__tests__/cli.js';

// `codeloop init` on an existing service: five files in the repository and nothing else, the
// stack reported from its own files, and the board still usable (lanes and skills come from the
// package). Spawns the built CLI from .test-dist, the real seam a person uses.

describe('init writes five files and reports what it found', () => {
  let dir: string;
  let home: string;
  const cli = (args: string[]) => runCli(args, { cwd: dir, encoding: 'utf-8', env: { ...process.env, CODELOOP_HOME: home, CLAUDE_CODE_SESSION_ID: '' } });
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf-8' });
  const write = (rel: string, text = '') => {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), text);
  };
  const porcelain = () => git('status', '--porcelain', '--untracked-files=all').split('\n').filter(Boolean).map(l => l.slice(3)).sort();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'codeloop-init-five-'));
    home = mkdtempSync(join(tmpdir(), 'codeloop-init-five-home-'));
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    write('pom.xml', '<project><dependencies><dependency><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>');
    write('mvnw', '#!/bin/sh\n');
    write('src/main/java/com/acme/billing/invoice/Invoice.java', 'class Invoice {}');
    write('src/main/java/com/acme/billing/ledger/Ledger.java', 'class Ledger {}');
    write('src/main/resources/db/migration/V1__init.sql', '');
    write('.github/workflows/ci.yml', 'name: ci\njobs:\n  test:\n    steps: []\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'service');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  it('leaves exactly five new paths in the repository and reports the stack', () => {
    const out = cli(['init', '--tools', 'claude', '--yes']);
    expect(out.status, out.stdout + out.stderr).toBe(0);
    expect(porcelain()).toEqual(['.codeloop/config.yaml', '.codeloop/process.yaml', '.codeloop/rules.md', '.mcp.json', 'CLAUDE.md']);
    const text = out.stdout;
    expect(text).toMatch(/Languages:\s+Java/);
    expect(text).toMatch(/Build and test:.*\.\/mvnw -q compile.*\.\/mvnw -q test/);
    expect(text).toMatch(/Database:.*Flyway/);
    expect(text).toMatch(/Pipeline:.*\.github\/workflows\/ci\.yml/);
    expect(text).toMatch(/Modules:.*invoice, ledger/);
    expect(text).toMatch(/5 files added/);
    // The lead-agent block, and nothing of the old scaffold.
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf-8')).toMatch(/lead agent/);
    expect(existsSync(join(dir, '.claude/skills'))).toBe(false);
    expect(existsSync(join(dir, '.codeloop/lanes'))).toBe(false);
    // The host hooks and the git hooks exist, outside the diff.
    expect(existsSync(join(dir, '.claude/settings.local.json'))).toBe(true);
    expect(existsSync(join(dir, '.git/hooks/commit-msg'))).toBe(true);
    expect(readFileSync(join(dir, '.git/info/exclude'), 'utf-8')).toMatch(/settings\.local\.json/);
  });

  it('still has lanes and skills for the board, from the package', () => {
    expect(cli(['init', '--tools', 'claude', '--yes']).status).toBe(0);
    const lanes = cli(['lane', 'list']);
    expect(lanes.status, lanes.stdout + lanes.stderr).toBe(0);
    expect(lanes.stdout).toMatch(/\bbuild\b/);
    const brief = cli(['start', 'Export the report as a spreadsheet', '--size', 'S']);
    expect(brief.status, brief.stdout + brief.stderr).toBe(0);
    const shown = cli(['brief', 'c-001']);
    expect(shown.status, shown.stdout + shown.stderr).toBe(0);
    expect(shown.stdout).toMatch(/## Skill: api/);
    expect(shown.stdout).not.toMatch(/skill's text is not in/);
    // Runtime state under .codeloop is kept out of the repository diff; the board and specs are work and may be committed.
    expect(git('check-ignore', '.codeloop/state/briefs/x').trim()).toBe('.codeloop/state/briefs/x');
  });

  it('says so and uses the generic config when nothing is detected', () => {
    rmSync(join(dir, 'pom.xml'));
    rmSync(join(dir, 'mvnw'));
    const out = cli(['init', '--tools', 'claude', '--yes']);
    expect(out.status, out.stdout + out.stderr).toBe(0);
    expect(out.stdout).toMatch(/stack not detected/i);
    expect(out.stdout).toMatch(/generic/);
    expect(porcelain()).toContain('.codeloop/config.yaml');
  });

  it('keeps the full scaffold behind --full', () => {
    const out = cli(['init', '--tools', 'claude', '--starter', 'generic', '--yes', '--full']);
    expect(out.status, out.stdout + out.stderr).toBe(0);
    expect(existsSync(join(dir, '.codeloop/lanes/build.yaml'))).toBe(true);
    expect(existsSync(join(dir, '.claude/skills/research/SKILL.md'))).toBe(true);
  });
});
