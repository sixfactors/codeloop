import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { startCard } from '../flow.js';
import { artifactLineage, checkArtifact, findArtifact, newArtifact } from '../artifact.js';

let dir: string;

const read = (path: string) => readFileSync(join(dir, path), 'utf-8');
function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

/** Sets a frontmatter list field (`screens: []` etc) to the given names. */
function setFrontmatter(path: string, field: string, values: string[]): void {
  write(path, read(path).replace(new RegExp(`^${field}: \\[.*\\]$`, 'm'), `${field}: [${values.join(', ')}]`));
}

/** Inserts a mock screen group with a .frame and, unless `omitCaption`, a sibling .caption. */
function addScreen(path: string, name: string, opts: { omitCaption?: boolean; frameBody?: string } = {}): void {
  const caption = opts.omitCaption ? '' : `<div class="caption"><h4>${name}</h4><p>why</p></div>`;
  const block = `<section class="screen-group" data-screen="${name}"><div class="frame">${opts.frameBody ?? '<div class="chrome"><div class="main">ok</div></div>'}</div>${caption}</section>\n</main>`;
  write(path, read(path).replace('</main>', block));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-artifact-'));
  write('.codeloop/lanes/build.yaml', readFileSync(resolve('templates/lanes/build.yaml'), 'utf-8'));
  write('.codeloop/config.yaml', 'project:\n  name: "Acme App"\n');
  startCard(dir, { lane: 'build', title: 'Checkout flow', id: 'c-001' });
  startCard(dir, { lane: 'build', title: 'Billing sync', id: 'c-002' });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('newArtifact', () => {
  it('writes docs/artifacts/<project>/<topic>/<card-id>-<kind>.html and never overwrites it', () => {
    const result = newArtifact(dir, 'c-001', 'board', 'mock', 'none');
    expect(result).toEqual({ path: 'docs/artifacts/acme-app/board/c-001-mock.html', created: true });
    expect(read(result.path)).toContain('<title>c-001 Checkout flow</title>');
    write(result.path, read(result.path) + '<!-- my work -->');
    expect(newArtifact(dir, 'c-001', 'board', 'mock', 'none')).toEqual({ path: result.path, created: false });
    expect(read(result.path)).toContain('<!-- my work -->');
    expect(findArtifact(dir, 'c-001', 'mock')).toBe(result.path);
  });

  it('a bare mock/workflow template (empty frontmatter) passes the check', () => {
    for (const kind of ['mock', 'workflow'] as const) {
      const { path } = newArtifact(dir, 'c-001', 'board', kind, 'none');
      expect(checkArtifact(dir, 'c-001', kind)).toEqual([]);
      expect(path).toContain(`-${kind}.html`);
    }
  });

  it('a bare system-design template fails on its own placeholder tech names, by design', () => {
    newArtifact(dir, 'c-001', 'board', 'system-design', 'none');
    expect(checkArtifact(dir, 'c-001', 'system-design')).toEqual([
      'docs/artifacts/acme-app/board/c-001-system-design.html software-layer box "UI, name the framework" names no technology',
      'docs/artifacts/acme-app/board/c-001-system-design.html software-layer box "API, name the framework" names no technology',
      'docs/artifacts/acme-app/board/c-001-system-design.html software-layer box "Services, name the language/runtime" names no technology',
      'docs/artifacts/acme-app/board/c-001-system-design.html software-layer box "Data, name the datastore" names no technology',
    ]);
  });

  it('--from <card> preserves lineage across the chain', () => {
    const first = newArtifact(dir, 'c-001', 'board', 'workflow', 'none');
    expect(artifactLineage(read(first.path))).toEqual(['c-001', 'base']);

    const second = newArtifact(dir, 'c-002', 'board', 'workflow', 'c-001');
    expect(second).toMatchObject({ created: true, from: 'c-001' });
    expect(artifactLineage(read(second.path))).toEqual(['c-002', 'c-001', 'base']);
    expect(checkArtifact(dir, 'c-002', 'workflow')).toEqual([]);
  });
});

describe('checkArtifact: mock', () => {
  it('fails when a screen named in the frontmatter has no frame', () => {
    const { path } = newArtifact(dir, 'c-001', 'board', 'mock', 'none');
    setFrontmatter(path, 'screens', ['board', 'card-drawer']);
    addScreen(path, 'board');
    expect(checkArtifact(dir, 'c-001', 'mock')).toEqual([`${path} has no frame for screen "card-drawer" named in the frontmatter`]);
  });

  it('fails when a frame has no sibling caption', () => {
    const { path } = newArtifact(dir, 'c-001', 'board', 'mock', 'none');
    setFrontmatter(path, 'screens', ['board']);
    addScreen(path, 'board', { omitCaption: true });
    expect(checkArtifact(dir, 'c-001', 'mock')).toEqual([`${path} screen "board" has a frame with no sibling .caption`]);
  });

  it('fails on a raw colour literal outside the token blocks', () => {
    const { path } = newArtifact(dir, 'c-001', 'board', 'mock', 'none');
    setFrontmatter(path, 'screens', ['board']);
    addScreen(path, 'board', { frameBody: '<p style="color: #ff0000">hot</p>' });
    expect(checkArtifact(dir, 'c-001', 'mock')).toContain(`${path} uses colours outside the tokens blocks: #ff0000`);
  });

  it('fails when the dark-mode block is removed', () => {
    const { path } = newArtifact(dir, 'c-001', 'board', 'mock', 'none');
    const html = read(path);
    expect(html).toMatch(/prefers-color-scheme: dark/);
    const noDark = html
      .replace(/@media\s*\(prefers-color-scheme:\s*dark\)\s*{[\s\S]*?:root:not\([^)]*\)\s*{[^}]*}\s*}/, '')
      .replace(/:root\[data-theme=["']dark["']\]\s*{[^}]*}/, '');
    expect(noDark).not.toMatch(/prefers-color-scheme: dark/);
    write(path, noDark);
    expect(checkArtifact(dir, 'c-001', 'mock')).toContain(`${path} has no dark-mode block redefining the tokens`);
  });
});

describe('checkArtifact: system-design', () => {
  it('fails when a mermaid block uses an unknown diagram type', () => {
    const { path } = newArtifact(dir, 'c-001', 'infra', 'system-design', 'none');
    write(path, read(path).replace('<pre class="mermaid">\nerDiagram', '<pre class="mermaid">\nnotADiagram'));
    expect(checkArtifact(dir, 'c-001', 'system-design')).toContain(`${path} has a mermaid block with an unknown diagram type: "notADiagram"`);
  });

  it('fails when a software-layer box names no technology', () => {
    const { path } = newArtifact(dir, 'c-001', 'infra', 'system-design', 'none');
    // The template's own placeholder boxes ("name the framework"/"runtime"/"datastore") are the
    // failure case by construction; fill in real tech for every box except one.
    let html = read(path);
    html = html
      .replace('UI["UI, name the framework"]', 'UI["UI, Next.js"]')
      .replace('API["API, name the framework"]', 'API["API, Hono"]')
      .replace('SVC["Services, name the language/runtime"]', 'SVC["Services, Node.js"]');
    write(path, html);
    expect(checkArtifact(dir, 'c-001', 'system-design')).toEqual([`${path} software-layer box "Data, name the datastore" names no technology`]);
  });
});

describe('checkArtifact: workflow', () => {
  it('fails when an actor named in the frontmatter does not appear in any diagram', () => {
    const { path } = newArtifact(dir, 'c-001', 'board', 'workflow', 'none');
    // The template's own sequence diagram names "User"; "Support agent" appears nowhere.
    setFrontmatter(path, 'actors', ['User', 'Support agent']);
    expect(checkArtifact(dir, 'c-001', 'workflow')).toEqual([`${path} actor "Support agent" does not appear in any diagram`]);
  });
});
