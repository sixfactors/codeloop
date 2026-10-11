import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { checkArchitecture } from '../architecture-check.js';

let dir: string;

function write(root: string, path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

const OVERVIEW = `# Overview

This system logs a user in and serves their session.

\`\`\`mermaid
flowchart TB
  subgraph UI["ui -- renders pages"]
    App["app entry"]
  end
  subgraph API["api -- handles requests"]
    Login["login handler"]
  end
  App --> Login
  click App "src/app.ts"
  click Login "src/login.ts"
\`\`\`

| Folder | Purpose | Depends on |
|---|---|---|
| \`src\` | Handles requests and renders pages | - |
`;

const FLOWS = `# Flows

## A user signs in

\`\`\`mermaid
sequenceDiagram
  participant App
  participant Login
  App->>Login: POST /login
  Login-->>App: session token
\`\`\`
`;

const DATA_MODEL = `# Data model

\`\`\`mermaid
erDiagram
  USER ||--o{ SESSION : "has many"
  USER {
    string id
  }
\`\`\`

| Entity | Field | Why |
|---|---|---|
| User | id | identity |
`;

const CHANGE_MAP = `| To change | Edit | Then run |
|---|---|---|
| Login page copy | \`src/app.ts\` | \`npm test\` |
| Login handler | \`src/login.ts\` | \`npm test\` |
| Session schema | \`src/schema.ts\` | \`npm test\` |
| Login test | \`src/__tests__/login.test.ts\` | \`npm test\` |
| App entry | \`src/app.ts\` | \`npm test\` |
`;

const INVARIANTS = `## Invariant: a session always has a user

A session row with no matching user is a bug, not a valid state.

- enforced by: \`src/schema.ts\`
- tested by: \`src/__tests__/login.test.ts\`

## Invariant: login requires a password

Logging in with no password must be refused.

- enforced by: \`src/login.ts\`
- tested by: \`src/__tests__/login.test.ts\`

## Invariant: the app boots without a session

A fresh visit must not crash before a session exists.

- enforced by: \`src/app.ts\`
- tested by: \`src/__tests__/login.test.ts\`
`;

/** A fixture that passes every rule: five pages, real paths, one top folder named, in range tables and diagrams. */
function passingFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'codeloop-arch-check-'));
  write(root, 'src/app.ts', 'export function app() {}\n');
  write(root, 'src/login.ts', 'export function login() {}\n');
  write(root, 'src/schema.ts', 'export interface User { id: string }\n');
  write(root, 'src/__tests__/login.test.ts', 'test("login", () => {});\n');
  write(root, '.codeloop/state/repo-facts.json', JSON.stringify({ topFolders: ['src'] }));
  write(root, '.codeloop/wiki/architecture/overview.md', OVERVIEW);
  write(root, '.codeloop/wiki/architecture/flows.md', FLOWS);
  write(root, '.codeloop/wiki/architecture/data-model.md', DATA_MODEL);
  write(root, '.codeloop/wiki/architecture/change-map.md', CHANGE_MAP);
  write(root, '.codeloop/wiki/architecture/invariants.md', INVARIANTS);
  return root;
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('check architecture', () => {
  it('a passing fixture reports no problems', () => {
    dir = passingFixture();
    expect(checkArchitecture(dir)).toEqual([]);
  });

  it('is not vacuous: deleting a path the pages name makes the same fixture fail', () => {
    dir = passingFixture();
    expect(checkArchitecture(dir)).toEqual([]);
    rmSync(join(dir, 'src/login.ts'));
    const problems = checkArchitecture(dir);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.some(p => p.includes('src/login.ts'))).toBe(true);
  });

  it('reports a missing page', () => {
    dir = passingFixture();
    rmSync(join(dir, '.codeloop/wiki/architecture/invariants.md'));
    const problems = checkArchitecture(dir);
    expect(problems).toContainEqual(expect.stringContaining('invariants.md: missing'));
  });

  it('reports an invented path a page names', () => {
    dir = passingFixture();
    const overview = readFileSync(join(dir, '.codeloop/wiki/architecture/overview.md'), 'utf-8');
    writeFileSync(join(dir, '.codeloop/wiki/architecture/overview.md'), overview.replace('src/login.ts', 'src/does-not-exist.ts'));
    const problems = checkArchitecture(dir);
    expect(problems).toContainEqual(expect.stringContaining('src/does-not-exist.ts'));
  });

  it('does not count routes, npm scopes, globs or placeholders as invented paths', () => {
    dir = passingFixture();
    const flows = readFileSync(join(dir, '.codeloop/wiki/architecture/flows.md'), 'utf-8');
    writeFileSync(join(dir, '.codeloop/wiki/architecture/flows.md'), flows + '\nCalls `/api/cards/:id/approve`, ships as `@acme/app`, reads `.codeloop/wiki/<folder>/*.md`.\n');
    expect(checkArchitecture(dir)).toEqual([]);
  });

  it('reports a top-level source folder missing from the overview', () => {
    dir = passingFixture();
    writeFileSync(join(dir, '.codeloop/state/repo-facts.json'), JSON.stringify({ topFolders: ['src', 'lib'] }));
    const problems = checkArchitecture(dir);
    expect(problems).toContainEqual(expect.stringContaining('"lib"'));
  });

  it('reports a table over 15 rows', () => {
    dir = passingFixture();
    const rows = Array.from({ length: 16 }, (_, i) => `| \`src\` folder row ${i} | row ${i} purpose | - |`).join('\n');
    writeFileSync(join(dir, '.codeloop/wiki/architecture/overview.md'), `${OVERVIEW}${rows}\n`);
    const problems = checkArchitecture(dir);
    expect(problems).toContainEqual(expect.stringContaining('the limit is 15'));
  });

  it('reports a flowchart diagram over 15 nodes', () => {
    dir = passingFixture();
    const extraNodes = Array.from({ length: 14 }, (_, i) => `N${i}["node ${i}"]`).join('\n  ');
    const extraEdges = Array.from({ length: 13 }, (_, i) => `N${i} --> N${i + 1}`).join('\n  ');
    const bloated = OVERVIEW.replace('App --> Login', `App --> Login\n  ${extraNodes}\n  ${extraEdges}`);
    writeFileSync(join(dir, '.codeloop/wiki/architecture/overview.md'), bloated);
    const problems = checkArchitecture(dir);
    expect(problems).toContainEqual(expect.stringContaining('the limit is 15'));
    expect(problems.some(p => p.includes('nodes'))).toBe(true);
  });

  it('reports a flows.md participant not named in overview.md', () => {
    dir = passingFixture();
    writeFileSync(
      join(dir, '.codeloop/wiki/architecture/flows.md'),
      FLOWS.replace('participant Login', 'participant Stranger').replace('Login-->>App', 'Stranger-->>App').replace('App->>Login', 'App->>Stranger'),
    );
    const problems = checkArchitecture(dir);
    expect(problems).toContainEqual(expect.stringContaining('Stranger'));
  });

  it("reports an invariant whose test file does not exist", () => {
    dir = passingFixture();
    writeFileSync(join(dir, '.codeloop/wiki/architecture/invariants.md'), INVARIANTS.replace('tested by: `src/__tests__/login.test.ts`\n\n## Invariant: login', 'tested by: `src/__tests__/missing.test.ts`\n\n## Invariant: login'));
    const problems = checkArchitecture(dir);
    expect(problems).toContainEqual(expect.stringContaining('src/__tests__/missing.test.ts'));
  });

  it('reports a scanner leftover label like "59 routes"', () => {
    dir = passingFixture();
    writeFileSync(join(dir, '.codeloop/wiki/architecture/overview.md'), `${OVERVIEW}\nThe api layer wires up 59 routes.\n`);
    const problems = checkArchitecture(dir);
    expect(problems).toContainEqual(expect.stringContaining('59 routes'));
  });

  it('exits 0 with no --dir override against the default architecture folder, and fails cleanly when it is empty', () => {
    dir = mkdtempSync(join(tmpdir(), 'codeloop-arch-empty-'));
    const problems = checkArchitecture(dir);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every(p => /^(overview|flows|data-model|change-map|invariants)\.md:/.test(p))).toBe(true);
  });
});
