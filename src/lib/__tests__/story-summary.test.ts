import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readCards, SUMMARY_MAX, writeSummary } from '../cards.js';
import { advanceCard, approveCard, createCard } from '../engine.js';
import { createApp } from '../server.js';
import { recordHandback } from '../handback.js';

let dir: string;

const put = (app: ReturnType<typeof createApp>, path: string, body: object) =>
  app.app.request(path, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-codeloop-token': app.token }, body: JSON.stringify(body) });
const full = async (app: ReturnType<typeof createApp>, id = 'c-1') => (await app.app.request(`/api/cards/${id}/full`)).json();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-story-summary-'));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/config.yaml'), 'project:\n  name: demo\n');
  writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), `id: build
version: 1
metric: { name: m, source: cards }
stages:
  - id: draft
    done: { cmd: "true" }
  - id: spec
    done: { cmd: "true" }
    gate: { name: spec, approver: owner }
  - id: ship
    done: { cmd: "true" }
`);
  createCard(dir, { lane: 'build', title: 'Export invoices as a spreadsheet', id: 'c-1' });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('the story summary', () => {
  it('uc-311-01: says the gate waits on the founder whatever the written text says', async () => {
    advanceCard(dir, 'c-1');
    advanceCard(dir, 'c-1');
    expect(readCards(dir).cards[0].gate).toBe('spec');
    writeSummary(dir, 'c-1', { needed: 'A spreadsheet of invoices.', done: 'All done, nothing waits on you.' }, { by: 'claude', kind: 'agent' });
    const body = await full(createApp(dir));
    expect(body.summary.you).toMatchObject({ byKind: 'board', text: 'Approve the spec step, or send it back with what to change.' });
  });

  it('uc-311-02: an agent write keeps the line a person wrote and fills the other', async () => {
    const owner = createApp(dir, undefined, { owner: true });
    expect((await put(owner, '/api/cards/c-1/summary', { needed: 'Totals in the last row.' })).status).toBe(200);
    // The agent's end-of-turn summary arrives with its hand-back.
    recordHandback(dir, 'c-1', { branch: 'main', head: 'abc', proof: 'true', summary: { needed: 'Something else entirely.', done: 'Research is finished.' } });
    const { summary } = readCards(dir).cards[0];
    expect(summary?.needed).toMatchObject({ text: 'Totals in the last row.', kind: 'person', by: 'owner', step: 'draft' });
    expect(summary?.done).toMatchObject({ text: 'Research is finished.', kind: 'agent', by: 'agent' });
  });

  it('uc-311-03: marks a summary written at an earlier step once the story moved on', async () => {
    writeSummary(dir, 'c-1', { needed: 'A spreadsheet.', done: 'Nothing yet.' }, { by: 'claude', kind: 'agent' });
    expect((await full(createApp(dir))).summary.mark).toBeUndefined();
    advanceCard(dir, 'c-1');
    advanceCard(dir, 'c-1');
    approveCard(dir, 'c-1', 'owner');
    advanceCard(dir, 'c-1');
    expect(readCards(dir).cards[0].stage).toBe('ship');
    const body = await full(createApp(dir));
    expect(body.summary.mark).toBe('stale');
    expect(body.summary.needed).toMatchObject({ step: 'draft', byKind: 'agent' });
  });

  it('uc-311-05: a story nobody summarised opens on lines worked out from the board, marked unwritten', async () => {
    const body = await full(createApp(dir));
    expect(body.summary.mark).toBe('unwritten');
    expect(body.summary.needed).toMatchObject({ byKind: 'board', text: 'Export invoices as a spreadsheet.' });
    expect(body.summary.done.text).toBe('Nothing yet. The story is at draft.');
    expect(body.summary.you.text).toMatch(/^Nothing waits on you/);
  });

  it('uc-311-06: an edit and a hand-back landing on the same read both stay', () => {
    const read = readCards(dir);
    writeSummary(dir, 'c-1', { needed: 'The owner wrote this.' }, { by: 'owner', kind: 'person' });
    // The agent's write starts from the read taken before the owner's landed.
    writeSummary(dir, 'c-1', { done: 'The agent wrote this.' }, { by: 'claude', kind: 'agent' }, { read });
    const { summary } = readCards(dir).cards[0];
    expect(summary?.needed?.text).toBe('The owner wrote this.');
    expect(summary?.done?.text).toBe('The agent wrote this.');
  });

  it('uc-311-07: a long line is cut to one short line so the buttons stay on a phone screen', () => {
    const long = `${'word '.repeat(400)}end`;
    writeSummary(dir, 'c-1', { done: long }, { by: 'claude', kind: 'agent' });
    const text = readCards(dir).cards[0].summary!.done!.text;
    expect(text.length).toBeLessThanOrEqual(SUMMARY_MAX);
    expect(text).not.toContain('\n');
  });
});
