import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { blockingGotchas, capture, inject, learn, lintWiki, listPages, migrateWikiFiller, wikiShape, WIKI_DIR } from '../wiki.js';

let dir: string;

function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

const gotcha = { title: 'Rename is not atomic across devices', scope: ['src/lib/store.ts'], body: 'Write the temp file next to the target.' };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-wiki-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('wiki', () => {
  it('turns a gotcha critical at the third capture, and it blocks matching files until acknowledged', () => {
    capture(dir, gotcha);
    expect(capture(dir, gotcha)).toMatchObject({ freq: 2, severity: 'warning' });
    expect(blockingGotchas(dir, ['src/lib/store.ts'], [])).toEqual([]);

    expect(capture(dir, gotcha)).toMatchObject({ freq: 3, severity: 'critical' });
    expect(listPages(dir)).toHaveLength(1);
    expect(blockingGotchas(dir, ['src/lib/store.ts'], []).map(p => p.title)).toEqual([gotcha.title]);
    expect(blockingGotchas(dir, ['src/lib/store.ts'], [gotcha.title])).toEqual([]);
    expect(blockingGotchas(dir, ['README.md'], [])).toEqual([]);
  });

  it('injects only pages whose scope matches the changed files', () => {
    capture(dir, { title: 'Store', scope: ['src/lib/**'], body: 'b' });
    capture(dir, { title: 'Landing', scope: ['site/**'], body: 'b', kind: 'decision' });

    expect(inject(dir, ['site/app/page.tsx']).map(p => p.title)).toEqual(['Landing']);
    expect(inject(dir, ['docs/plan.md'])).toEqual([]);
  });

  it('promotes a page to rules.md once, at the configured frequency', () => {
    write('.codeloop/config.yaml', 'codeloop:\n  critical_frequency: 2\n  promote_frequency: 2\n');
    write('.codeloop/rules.md', '# Rules\n');
    capture(dir, gotcha);
    expect(learn(dir).promoted).toEqual([]);

    capture(dir, gotcha);
    expect(learn(dir).promoted).toEqual([gotcha.title]);
    expect(learn(dir).promoted).toEqual([]);
    expect(readFileSync(join(dir, '.codeloop/rules.md'), 'utf-8').split(`## ${gotcha.title}`)).toHaveLength(2);
  });

  it('lint reports a broken relative link, a stale page and a duplicate title', () => {
    capture(dir, { title: 'Old', scope: [], body: 'See [the store](../concepts/store.md).' }, new Date('2026-01-01'));
    capture(dir, { title: 'Fresh', scope: [], body: 'See [old](old.md) and [docs](https://example.test).' }, new Date('2026-09-30'));
    write('.codeloop/wiki/decisions/copy.md', '---\ntitle: fresh\nupdated: 2026-09-30\n---\n\nSame title, other folder.\n');

    const result = lintWiki(dir, new Date('2026-10-01'));
    expect(result.broken).toEqual(['.codeloop/wiki/gotchas/old.md: link to ../concepts/store.md does not resolve']);
    expect(result.stale).toHaveLength(1);
    expect(result.stale[0]).toMatch(/gotchas\/old\.md/);
    expect(result.duplicates).toHaveLength(1);
  });

  it('lint refuses a page in a folder that is neither in the shape nor in wiki.sections', () => {
    write('.codeloop/wiki/scratch/notes.md', '---\ntitle: Notes\n---\n\nSome notes.\n');
    const { unknownFolder } = lintWiki(dir);
    expect(unknownFolder).toEqual([expect.stringContaining('.codeloop/wiki/scratch/notes.md')]);
  });

  it('lint accepts a page in a config-declared section', () => {
    write('.codeloop/config.yaml', 'wiki:\n  sections:\n    - folder: playbooks\n      title: Playbooks\n');
    write('.codeloop/wiki/playbooks/release.md', '---\ntitle: Release\n---\n\nHow to release.\n');
    const { unknownFolder } = lintWiki(dir);
    expect(unknownFolder).toEqual([]);
  });

  it('lint reports a page still carrying scanner filler', () => {
    write('.codeloop/wiki/gotchas/README.md', '---\ntitle: Gotchas\n---\n\nassumption: no gotchas were found.\n');
    write('.codeloop/wiki/reference/erd.md', '---\ntitle: ERD\n---\n\nassumption: no schema files were found.\n');
    const { filler } = lintWiki(dir);
    expect(filler).toEqual([expect.stringContaining('.codeloop/wiki/gotchas/README.md')]);
  });

  it('migrate moves filler into reference/legacy/ and never deletes it', () => {
    write('.codeloop/wiki/glossary.md', '---\ntitle: Glossary\n---\n\n- **Widget**, assumption: term found in schemas.\n');
    write('.codeloop/wiki/runbooks/dev.md', '---\ntitle: dev\n---\n\n```\nnode server.js\n```\n');
    const before = readFileSync(join(dir, '.codeloop/wiki/glossary.md'), 'utf-8');

    const result = migrateWikiFiller(dir);
    expect(result.dryRun).toBe(false);
    expect(result.moved).toEqual(
      expect.arrayContaining([
        { from: `${WIKI_DIR}/glossary.md`, to: `${WIKI_DIR}/reference/legacy/glossary.md` },
        { from: `${WIKI_DIR}/runbooks/dev.md`, to: `${WIKI_DIR}/reference/legacy/runbooks/dev.md` },
      ]),
    );
    expect(existsSync(join(dir, '.codeloop/wiki/glossary.md'))).toBe(false);
    expect(readFileSync(join(dir, '.codeloop/wiki/reference/legacy/glossary.md'), 'utf-8')).toBe(before);
  });

  it('migrate --dry-run moves nothing', () => {
    write('.codeloop/wiki/glossary.md', '---\ntitle: Glossary\n---\n\n- **Widget**, assumption: term found in schemas.\n');
    const result = migrateWikiFiller(dir, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.moved).toHaveLength(1);
    expect(existsSync(join(dir, '.codeloop/wiki/glossary.md'))).toBe(true);
    expect(existsSync(join(dir, '.codeloop/wiki/reference/legacy/glossary.md'))).toBe(false);
  });

  it('wikiShape hides storage folders and empty sections, and shows numbers once it has a page', () => {
    capture(dir, gotcha); // gotchas/: non-empty, should show
    write('.codeloop/wiki/cards/CL-1.md', '---\ntitle: CL-1\n---\n\nStory page.\n'); // a hidden storage folder
    expect(wikiShape(dir).map(s => s.id)).not.toContain('cards');
    expect(wikiShape(dir).map(s => s.id)).not.toContain('decisions'); // empty, hidden
    expect(wikiShape(dir).map(s => s.id)).not.toContain('numbers'); // hidden storage folder, empty
    expect(wikiShape(dir).find(s => s.id === 'gotchas')).toMatchObject({ count: 1 });

    write('.codeloop/wiki/numbers/signups.md', '---\ntitle: Signups\n---\n\n120 signups last week.\n');
    expect(wikiShape(dir).find(s => s.id === 'numbers')).toMatchObject({ count: 1 }); // the one hidden storage folder that shows once it has data
    expect(wikiShape(dir).map(s => s.id)).not.toContain('cards'); // cards stays hidden even with a page: the board owns it
  });

  it('migrate leaves scanner reference pages in place even with assumption lines', () => {
    mkdirSync(join(dir, '.codeloop/wiki/reference'), { recursive: true });
    writeFileSync(join(dir, '.codeloop/wiki/reference/erd.md'), '---\ntitle: ERD\n---\n\nassumption: no schema found.\n');
    expect(migrateWikiFiller(dir).moved).toEqual([]);
    expect(existsSync(join(dir, '.codeloop/wiki/reference/erd.md'))).toBe(true);
  });

  it('migrate leaves a hand-written gotcha untouched', () => {
    capture(dir, gotcha);
    const before = readFileSync(join(dir, '.codeloop/wiki/gotchas/rename-is-not-atomic-across-devices.md'), 'utf-8');
    const result = migrateWikiFiller(dir);
    expect(result.moved).toEqual([]);
    expect(readFileSync(join(dir, '.codeloop/wiki/gotchas/rename-is-not-atomic-across-devices.md'), 'utf-8')).toBe(before);
  });
});
