import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { startCard } from '../flow.js';
import { checkMock, cleanupMock, findMock, mockTarget, newMock } from '../mock.js';

let dir: string;
const SPEC = 'specs/001-add-csv-export';
const PAGE = 'src/app/mocks/001-add-csv-export/page.tsx';

const read = (path: string) => readFileSync(join(dir, path), 'utf-8');
function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

function project(pkg: object | null, appDir: string | null): void {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-mock-app-'));
  if (pkg) write('package.json', JSON.stringify(pkg));
  if (appDir) write(`${appDir}/layout.tsx`, 'export default function L() { return null; }\n');
  write('.codeloop/lanes/build.yaml', readFileSync(resolve('templates/lanes/build.yaml'), 'utf-8'));
  write('.codeloop/config.yaml', 'project:\n  name: "Acme App"\n');
  startCard(dir, { lane: 'build', title: 'Add CSV export', id: 'c-001' });
  write(`${SPEC}/spec.md`, read(`${SPEC}/spec.md`).replace(/^screens:\s*$/m, 'screens:\n- list\n- picker'));
}

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('app mock target', () => {
  beforeEach(() => project({ dependencies: { next: '15.0.0', react: '19.0.0' } }, 'src/app'));

  it('defaults to app, scaffolds the page and data file with one section per screen, and check passes', () => {
    expect(mockTarget(dir)).toBe('app');
    const made = newMock(dir, 'c-001', 'exports');
    expect(made).toEqual({ path: PAGE, created: true });
    const page = read(PAGE);
    expect(page.match(/data-screen="/g)).toHaveLength(2);
    expect(page).toContain('Add CSV export');
    expect(page).toContain("from '@/components/shared/<file>'");
    expect(read('src/app/mocks/001-add-csv-export/mock-data.ts')).toContain('"picker"');
    expect(findMock(dir, 'c-001')).toBe(PAGE);
    expect(newMock(dir, 'c-001', 'exports').created).toBe(false);
    expect(checkMock(dir, 'c-001')).toEqual([]);
  });

  it('fails a page that lost a screen section, naming it', () => {
    newMock(dir, 'c-001', 'exports');
    write(PAGE, read(PAGE).replace(/<section data-screen="picker">[\s\S]*?<\/section>\n/, ''));
    expect(checkMock(dir, 'c-001')).toEqual([`${PAGE} has no <section data-screen="picker"> for a screen named in the spec`]);
  });

  it('fails inline colour and style tags, allows layout props', () => {
    newMock(dir, 'c-001', 'exports');
    write(PAGE, read(PAGE).replace('<h1>', "<h1 style={{ color: 'red', padding: 4 }}>"));
    expect(checkMock(dir, 'c-001')).toEqual([expect.stringMatching(/sets inline style beyond layout \(color\)/)]);
    write(PAGE, read(PAGE).replace(/ style=\{\{ color[^}]*\}\}/, '') + '<style>{`h1{}`}</style>');
    expect(checkMock(dir, 'c-001')).toEqual([expect.stringMatching(/inline <style> block/)]);
  });

  it('fails an import that leaves the project', () => {
    newMock(dir, 'c-001', 'exports');
    write(PAGE, `import x from '../../../../../node_modules/x';\nimport y from 'https://cdn.test/y.js';\n${read(PAGE)}`);
    expect(checkMock(dir, 'c-001').join('\n')).toMatch(/imports \.\.\/\.\.\/\.\.\/\.\.\/\.\.\/node_modules\/x[\s\S]*imports https:\/\/cdn\.test/);
  });

  it('cleanup deletes the page by default and keeps it when the spec says keep', () => {
    newMock(dir, 'c-001', 'exports');
    write(`${SPEC}/spec.md`, read(`${SPEC}/spec.md`).replace(/^mock:.*$/m, 'mock: keep'));
    expect(cleanupMock(dir, 'c-001')).toEqual({ path: PAGE, action: 'kept' });
    expect(existsSync(join(dir, PAGE))).toBe(true);
    write(`${SPEC}/spec.md`, read(`${SPEC}/spec.md`).replace(/^mock:.*$/m, 'mock: drop'));
    expect(cleanupMock(dir, 'c-001')).toEqual({ path: PAGE, action: 'dropped' });
    expect(existsSync(join(dir, dirname(PAGE)))).toBe(false);
  });

  it('honours mock.target: html', () => {
    write('.codeloop/config.yaml', 'mock:\n  target: html\n');
    expect(mockTarget(dir)).toBe('html');
    expect(newMock(dir, 'c-001', 'exports').path).toBe(`${SPEC}/mock.html`);
  });
});

describe('without next', () => {
  it('keeps the html target', () => {
    project({ dependencies: { react: '19.0.0' } }, 'src/app');
    expect(mockTarget(dir)).toBe('html');
    expect(newMock(dir, 'c-001', 'exports').path).toBe(`${SPEC}/mock.html`);
  });
});
