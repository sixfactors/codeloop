import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { blockingGotchas, capture, inject, learn, lintWiki, listPages } from '../wiki.js';

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
});
