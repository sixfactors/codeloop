import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { validateConfig } from '../../commands/status.js';

describe('validateConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'codeloop-validate-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports missing config.yaml', () => {
    const issues = validateConfig(tmpDir);
    expect(issues).toContain('No config.yaml found — run codeloop init');
  });

  it('reports invalid YAML', () => {
    mkdirSync(join(tmpDir, '.codeloop'), { recursive: true });
    writeFileSync(join(tmpDir, '.codeloop/config.yaml'), '{{bad yaml');

    const issues = validateConfig(tmpDir);
    expect(issues).toContain('config.yaml has invalid YAML syntax');
  });

  it('catches common typos in top-level keys', () => {
    mkdirSync(join(tmpDir, '.codeloop'), { recursive: true });
    writeFileSync(join(tmpDir, '.codeloop/config.yaml'), `
project:
  name: test
quality_check:
  backend:
    - name: Lint
      command: "npm run lint"
scope:
  all:
    paths: ["**/*"]
`);

    const issues = validateConfig(tmpDir);
    expect(issues.some(i => i.includes('quality_check') && i.includes('quality_checks'))).toBe(true);
    expect(issues.some(i => i.includes('scope') && i.includes('scopes'))).toBe(true);
  });

  it('validates scope structure', () => {
    mkdirSync(join(tmpDir, '.codeloop'), { recursive: true });
    writeFileSync(join(tmpDir, '.codeloop/config.yaml'), `
project:
  name: test
scopes:
  empty_scope:
    gotcha_sections: ["Backend"]
`);

    const issues = validateConfig(tmpDir);
    expect(issues.some(i => i.includes('empty_scope') && i.includes('no paths'))).toBe(true);
  });

  it('validates quality_checks have commands', () => {
    mkdirSync(join(tmpDir, '.codeloop'), { recursive: true });
    writeFileSync(join(tmpDir, '.codeloop/config.yaml'), `
project:
  name: test
scopes:
  all:
    paths: ["**/*"]
quality_checks:
  all:
    - name: "Lint"
    - command: "npm test"
`);

    const issues = validateConfig(tmpDir);
    expect(issues.some(i => i.includes('Lint') && i.includes('no command'))).toBe(true);
    expect(issues.some(i => i.includes('without a name'))).toBe(true);
  });

  it('flags empty deploy commands', () => {
    mkdirSync(join(tmpDir, '.codeloop'), { recursive: true });
    writeFileSync(join(tmpDir, '.codeloop/config.yaml'), `
project:
  name: test
scopes:
  all:
    paths: ["**/*"]
quality_checks:
  all:
    - name: Lint
      command: "npm run lint"
deploy:
  staging:
    command: ""
`);

    const issues = validateConfig(tmpDir);
    expect(issues.some(i => i.includes('deploy.staging.command is empty'))).toBe(true);
  });

  it('passes on valid config', () => {
    mkdirSync(join(tmpDir, '.codeloop'), { recursive: true });
    writeFileSync(join(tmpDir, '.codeloop/config.yaml'), `
project:
  name: my-project
scopes:
  all:
    paths: ["**/*"]
    gotcha_sections: ["General"]
quality_checks:
  all:
    - name: Typecheck
      command: "npx tsc --noEmit"
commit:
  types: [feat, fix]
`);

    const issues = validateConfig(tmpDir);
    expect(issues).toEqual([]);
  });
});
