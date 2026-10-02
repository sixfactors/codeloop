import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { buildBrief } from '../agent.js';
import { findCard, readCards } from '../cards.js';
import { addCompetitor, appendFindings, listCompetitors } from '../competitors.js';
import { advanceCard } from '../engine.js';
import { startCard } from '../flow.js';
import { buildInbox } from '../inbox.js';
import { lintLane, parseLane } from '../lane.js';
import { checkMock, findMock, newMock, writeMocksIndex } from '../mock.js';
import { checkOnline, checkResearch } from '../research.js';
import { createApp } from '../server.js';

let dir: string;

const read = (path: string) => readFileSync(join(dir, path), 'utf-8');
function write(path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}
const append = (path: string, text: string) => write(path, read(path) + text);

const SPEC = 'specs/001-add-csv-export';
const SOURCES = ['- source: https://acme.test/docs/export — export lives in the list toolbar', '- source: https://globex.test/changelog — shipped bulk export in March', '- source: https://example.test/forum/42 - users ask for a column picker'];
const TEMPLATE = readFileSync(resolve('templates/mock/template.html'), 'utf-8');

// Lane checks call `codeloop`; point the shim they run through at the built CLI instead of the test runner.
const entry = process.argv[1];

beforeEach(() => {
  process.argv[1] = resolve('dist/index.js');
  dir = mkdtempSync(join(tmpdir(), 'codeloop-research-'));
  write('.codeloop/lanes/build.yaml', readFileSync(resolve('templates/lanes/build.yaml'), 'utf-8'));
  write('.codeloop/config.yaml', 'project:\n  name: "Acme App"\n');
  startCard(dir, { lane: 'build', title: 'Add CSV export', id: 'c-001' });
});

afterEach(() => {
  process.argv[1] = entry;
  rmSync(dir, { recursive: true, force: true });
});

describe('check research', () => {
  it('fails on the unfilled template', () => {
    expect(checkResearch(dir, 'c-001', 3).errors).toEqual([`${SPEC}/research.md has no line starting with "verdict:"`, `${SPEC}/research.md cites 0 sources, needs 3 (\`- source: <url> — <note>\`)`]);
  });

  it('fails with a verdict and too few source lines, and counts only well-formed ones', () => {
    append(`${SPEC}/research.md`, `${SOURCES.slice(0, 2).join('\n')}\n- source: not a url — nope\nsee https://stray.test/link\nverdict: build\n`);
    expect(checkResearch(dir, 'c-001', 3).errors).toEqual([`${SPEC}/research.md cites 2 sources, needs 3 (\`- source: <url> — <note>\`)`]);
    expect(checkResearch(dir, 'c-001', 2).errors).toEqual([]);
  });

  it('passes with a verdict and three sources, and returns the URLs for the online check', () => {
    append(`${SPEC}/research.md`, `${SOURCES.join('\n')}\nverdict: build\n`);
    expect(checkResearch(dir, '1', 3)).toMatchObject({ errors: [], urls: ['https://acme.test/docs/export', 'https://globex.test/changelog', 'https://example.test/forum/42'] });
  });

  describe('--online', () => {
    let server: Server;
    let base: string;
    beforeEach(async () => {
      server = createServer((req, res) => res.writeHead(req.url === '/gone' ? 404 : req.url === '/moved' ? 302 : 200, { location: '/ok' }).end());
      await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
      base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    });
    afterEach(() => void server.close());

    it('names each source that does not answer with 2xx or 3xx', async () => {
      expect(await checkOnline([`${base}/ok`, `${base}/moved`, `${base}/gone`, 'http://127.0.0.1:1/down'])).toEqual([
        `${base}/gone answered 404`,
        expect.stringMatching(/^http:\/\/127\.0\.0\.1:1\/down did not answer/),
      ]);
    });
  });
});

describe('competitor pages', () => {
  it('competitor add writes a wiki page with title, docs and changelog in its front matter', () => {
    addCompetitor(dir, { name: 'acme', docs: 'https://acme.test/docs', changelog: 'https://acme.test/changelog' });
    expect(read('.codeloop/wiki/competitors/acme.md')).toMatch(/^---\ntitle: acme\ndocs: https:\/\/acme\.test\/docs\nchangelog: https:\/\/acme\.test\/changelog\n---\n/);
    expect(listCompetitors(dir)).toMatchObject([{ name: 'acme', title: 'acme', changelog: 'https://acme.test/changelog' }]);
    expect(() => addCompetitor(dir, { name: '../etc', docs: 'https://x.test' })).toThrow(/not a plain name/);
  });

  it('puts the competitor pages in the brief of a research stage and of no other stage', () => {
    addCompetitor(dir, { name: 'acme', docs: 'https://acme.test/docs', changelog: 'https://acme.test/changelog' });
    const card = () => findCard(readCards(dir).cards, 'c-001');
    expect(buildBrief(dir, card())).toContain('## Competitors');
    expect(buildBrief(dir, card())).toContain('Changelog: https://acme.test/changelog');

    append(`${SPEC}/research.md`, `${SOURCES.join('\n')}\nverdict: build\n`);
    expect(advanceCard(dir, 'c-001').card.stage).toBe('mock');
    expect(buildBrief(dir, card())).not.toContain('## Competitors');
  });

  it('appends the findings row for each competitor named in research.md when the research stage passes, once per card', () => {
    addCompetitor(dir, { name: 'acme', docs: 'https://acme.test/docs' });
    addCompetitor(dir, { name: 'globex', docs: 'https://globex.test/docs' });
    append(`${SPEC}/research.md`, `| Acme | Export button in the list toolbar | https://acme.test/docs/export |\n| Initech | No export | https://initech.test |\n${SOURCES.join('\n')}\nverdict: build\n`);

    const { card } = advanceCard(dir, 'c-001');
    expect(read('.codeloop/wiki/competitors/acme.md')).toContain('- c-001 Add CSV export: Export button in the list toolbar | https://acme.test/docs/export');
    expect(read('.codeloop/wiki/competitors/globex.md')).not.toContain('c-001');
    expect(card.events.filter(e => e.action === 'findings').map(e => e.note)).toEqual(['.codeloop/wiki/competitors/acme.md']);

    expect(appendFindings(dir, card, read(`${SPEC}/research.md`))).toEqual([]);
    expect(read('.codeloop/wiki/competitors/acme.md').match(/- c-001 /g)).toHaveLength(1);
  });
});

describe('mocks', () => {
  const MOCK = 'docs/mocks/acme-app/exports/c-001.html';
  const screens = (names: string) => write(`${SPEC}/spec.md`, read(`${SPEC}/spec.md`).replace(/^screens:.*$/m, `screens:\n${names}`));
  const section = (name: string) => write(MOCK, read(MOCK).replace('</main>', `<section data-screen="${name}"><h2>${name}</h2></section>\n</main>`));

  it('the shared template uses the system font stack, light and dark tokens, and no pixel sizes', () => {
    expect(TEMPLATE).toContain('<!-- codeloop-mock-template: 1 -->');
    expect(TEMPLATE).toMatch(/font-family: system-ui/);
    expect(TEMPLATE).toMatch(/codeloop-tokens:start[\s\S]*prefers-color-scheme: dark[\s\S]*codeloop-tokens:end/);
    expect(TEMPLATE).toMatch(/minmax\(/);
    expect(TEMPLATE).not.toMatch(/\d+px/);
  });

  it('mock new creates docs/mocks/<project>/<topic>/<card-id>.html from the template and never overwrites it', () => {
    expect(newMock(dir, '1', 'exports')).toEqual({ path: MOCK, created: true });
    expect(read(MOCK)).toContain('<title>c-001 Add CSV export</title>');
    write(MOCK, read(MOCK) + '<!-- my work -->');
    expect(newMock(dir, 'c-001', 'exports')).toEqual({ path: MOCK, created: false });
    expect(read(MOCK)).toContain('<!-- my work -->');
    expect(findMock(dir, 'c-001')).toBe(MOCK);
    expect(() => newMock(dir, 'c-001', '../up')).toThrow(/not a plain name/);
  });

  it('check mock fails while the spec names no screens, and while there is no mock file', () => {
    expect(checkMock(dir, 'c-001')).toEqual([`${SPEC}/spec.md names no screens under \`screens:\` (write \`screens: none\` for a card with nothing to draw)`]);
    screens('- export-dialog\n');
    expect(checkMock(dir, 'c-001')).toEqual(['no mock for c-001 under docs/mocks; run `codeloop mock new c-001 --topic <topic>`']);
  });

  it('check mock fails on a missing screen, a changed tokens block, a missing marker and a colour outside the tokens', () => {
    screens('- export-dialog\n- export-done\n');
    newMock(dir, 'c-001', 'exports');
    section('export-dialog');
    expect(checkMock(dir, 'c-001')).toEqual([`${MOCK} has no <section data-screen="export-done"> for a screen named in the spec`]);

    section('export-done');
    expect(checkMock(dir, 'c-001')).toEqual([]);

    const good = read(MOCK);
    write(MOCK, good.replace('--accent:', '--brand:'));
    expect(checkMock(dir, 'c-001')).toEqual([`${MOCK}: the tokens block differs from templates/mock/template.html`]);
    write(MOCK, good.replace('<!-- codeloop-mock-template: 1 -->', ''));
    expect(checkMock(dir, 'c-001')).toEqual([`${MOCK} does not carry the template marker <!-- codeloop-mock-template: 1 -->`]);
    write(MOCK, good.replace('</main>', '<p style="color: #ff0000; background: rgb(0 0 0)">x</p><a href="#fff">ok</a></main>'));
    expect(checkMock(dir, 'c-001')).toEqual([`${MOCK} uses colours outside the tokens block: #ff0000, rgb(`]);
  });

  it('check mock passes with no mock when the spec says `screens: none`', () => {
    write(`${SPEC}/spec.md`, read(`${SPEC}/spec.md`).replace(/^screens:.*$/m, 'screens: none'));
    expect(checkMock(dir, 'c-001')).toEqual([]);
  });

  it('the shipped build lane has the mock stage between research and spec and passes lint', () => {
    const lane = parseLane(read('.codeloop/lanes/build.yaml'));
    expect(lane.stages.map(s => s.id).slice(0, 3)).toEqual(['research', 'mock', 'spec']);
    expect(lane.stages[1]).toMatchObject({ skill: 'design', done: { cmd: 'codeloop check mock {id}' } });
    expect(lintLane(lane)).toEqual([]);
  });

  it('mocks index lists project, topic and cards, newest first', () => {
    startCard(dir, { lane: 'build', title: 'Import wizard', id: 'c-002' });
    newMock(dir, 'c-001', 'exports');
    newMock(dir, 'c-002', 'exports');
    write('docs/mocks/acme-app/billing/c-777.html', '<title>Old invoice page</title>');
    utimesSync(join(dir, MOCK), new Date('2026-09-01'), new Date('2026-09-01'));
    utimesSync(join(dir, 'docs/mocks/acme-app/exports/c-002.html'), new Date('2026-09-20'), new Date('2026-09-20'));
    utimesSync(join(dir, 'docs/mocks/acme-app/billing/c-777.html'), new Date('2026-08-01'), new Date('2026-08-01'));

    expect(writeMocksIndex(dir)).toEqual({ path: 'docs/mocks/index.html', mocks: 3 });
    const index = read('docs/mocks/index.html');
    const order = ['acme-app', 'exports', 'acme-app/exports/c-002.html', 'Import wizard', 'acme-app/exports/c-001.html', 'Add CSV export', 'billing', 'acme-app/billing/c-777.html', 'Old invoice page'].map(s => index.indexOf(s));
    expect(order.every(i => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(index).toContain('codeloop-tokens:start');
    writeMocksIndex(dir);
    expect(read('docs/mocks/index.html').match(/index\.html/g)).toBeNull();
  });

  it('serve answers /mocks/ from docs/mocks, refuses a path that climbs out, and links the mock on the card', async () => {
    newMock(dir, 'c-001', 'exports');
    writeMocksIndex(dir);
    write('secret.html', 'top secret');
    const { app } = createApp(dir);
    expect(await (await app.request('/mocks/acme-app/exports/c-001.html')).text()).toContain('<title>c-001 Add CSV export</title>');
    expect(await (await app.request('/mocks/')).text()).toContain('acme-app/exports/c-001.html');
    expect((await app.request('/mocks/..%2F..%2Fsecret.html')).status).toBe(404);
    expect((await app.request('/mocks/nope.html')).status).toBe(404);
    const payload = await (await app.request('/api/cards')).json() as { cards: { id: string; mock?: string }[] };
    expect(payload.cards.find(c => c.id === 'c-001')!.mock).toBe('/mocks/acme-app/exports/c-001.html');
  });

  it('inbox shows the mock path on the card waiting at the spec gate', () => {
    append(`${SPEC}/research.md`, `${SOURCES.join('\n')}\nverdict: build\n`);
    advanceCard(dir, 'c-001');
    screens('- export-dialog\n');
    newMock(dir, 'c-001', 'exports');
    section('export-dialog');
    expect(advanceCard(dir, 'c-001').card.stage).toBe('spec');
    append(`${SPEC}/tasks.md`, '- [ ] T001 [US1] [ui] Export dialog\n');
    expect(advanceCard(dir, 'c-001').outcome).toBe('parked');
    expect(buildInbox(dir).needs_you).toMatchObject([{ id: 'c-001', gate: 'spec', read: `${SPEC}/tasks.md`, mock: MOCK }]);
    expect(existsSync(join(dir, MOCK))).toBe(true);
  });
});
