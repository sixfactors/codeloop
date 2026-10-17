import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendActivity } from '../activity.js';
import { CHECK_CRASHED, readCards } from '../cards.js';
import { advanceCard, createCard, markStuck, recordEvent } from '../engine.js';
import { buildInbox } from '../inbox.js';
import { createApp } from '../server.js';
import { showCard } from '../services.js';
import { explanationText, moveStuck, stuckExplanation } from '../stuck-explanation.js';

let dir: string;
const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, stdio: 'pipe' });
const commit = (file: string, msg: string) => {
  mkdirSync(join(dir, file, '..'), { recursive: true });
  writeFileSync(join(dir, file), `${file} ${Math.random()}`);
  git('add', file);
  git('commit', '-q', '-m', msg, '-m', 'Card: c-1');
};
const lane = (researchCmd: string, retries = 1) => writeFileSync(join(dir, '.codeloop/lanes/build.yaml'), `id: build
version: 1
metric: { name: m, source: cards }
retries: ${retries}
stages:
  - id: research
    output: research.md
    done: { cmd: "${researchCmd}" }
  - id: spec
    output: tasks.md
    done: { cmd: "exit 1" }
    gate: { name: spec, approver: owner }
  - id: build
    done: { cmd: "echo task check; exit 1" }
  - id: verify
    done: { cmd: "exit 1" }
`);
const card = () => readCards(dir).cards[0];
const explain = () => stuckExplanation(dir, card())!;
/** Stuck at research after one counted failure on a written research.md. */
const stuckAtResearch = () => {
  writeFileSync(join(dir, 'research.md'), 'a first draft');
  advanceCard(dir, 'c-1');
  expect(card().gate).toBe('stuck');
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codeloop-stuck-explanation-'));
  mkdirSync(join(dir, '.codeloop/lanes'), { recursive: true });
  writeFileSync(join(dir, '.codeloop/config.yaml'), 'project:\n  name: demo\n');
  lane('echo research.md cites 0 sources, needs 3 >&2; exit 1');
  git('init', '-q', '-b', 'main');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  createCard(dir, { lane: 'build', title: 'The board shows every story by stage', id: 'c-1' });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('the stuck explanation', () => {
  it('uc-308-01: offers one more try only when the work changed since the last try', () => {
    stuckAtResearch();
    expect(explain()).toMatchObject({ kind: 'unchanged', buttons: [] });
    expect(explain().action).toMatch(/^Trying again would fail the same way\./);
    writeFileSync(join(dir, 'research.md'), 'a draft with a third source');
    expect(explain()).toMatchObject({ kind: 'changed', buttons: ['retry'] });
  });

  it('uc-308-02: the move button stops before the spec gate and is refused at a gated step', () => {
    commit('src/board.ts', 'feat: the board');
    stuckAtResearch();
    const e = explain();
    expect(e).toMatchObject({ kind: 'shipped', moveTo: 'spec', buttons: ['move'] });
    const { card: moved } = moveStuck(dir, 'c-1', 'owner');
    expect(moved).toMatchObject({ stage: 'spec' });
    expect(moved.gate).toBeUndefined();
    expect(moved.events.slice(-2).map(x => x.action)).toEqual(['unstick', 'place']);
    // Stuck at the gated step itself: moving on would skip its approval, so there is no move.
    advanceCard(dir, 'c-1');
    expect(card()).toMatchObject({ stage: 'spec', gate: 'stuck' });
    expect(explain().buttons).not.toContain('move');
    expect(() => moveStuck(dir, 'c-1', 'owner')).toThrow(/no step to move to/);
  });

  it('uc-308-03: a broken check says the check broke, with the step and time, and keeps the raw error apart', () => {
    lane(`node -e \\"throw new Error('boom')\\"`);
    advanceCard(dir, 'c-1');
    expect(card().events.at(-1)?.action).toBe('check-error');
    markStuck(dir, 'c-1', CHECK_CRASHED);
    const e = explain();
    expect(e.kind).toBe('broken');
    expect(e.tried).toMatch(/^The check itself broke at \d\d:\d\d on the research step/);
    expect(e.error).toMatch(/Node\.js v\d+/);
    expect(`${e.action} ${e.tried} ${e.shipped}`).not.toMatch(/Node\.js/);
  });

  it('uc-308-04: a later pass at the same step takes the failure off the inbox failing list', () => {
    lane('echo the verify check failed >&2; exit 1', 9);
    writeFileSync(join(dir, 'research.md'), 'draft');
    advanceCard(dir, 'c-1');
    appendActivity(dir, 'c-1', { kind: 'edit', file: 'research.md' });
    advanceCard(dir, 'c-1');
    const later = new Date(Date.now() + 3 * 3_600_000);
    expect(buildInbox(dir, later).failing.map(f => f.id)).toEqual(['c-1']);
    recordEvent(dir, 'c-1', () => ({ action: 'verify', stage: 'research', note: 'verify result: pass at abc1234' }));
    expect(buildInbox(dir, later).failing).toEqual([]);
    // The story's history keeps the failure.
    expect(card().events.filter(x => x.action === 'fail')).toHaveLength(2);
  });

  it('uc-308-05: the page, the inbox and card show give the same explanation', async () => {
    commit('src/board.ts', 'feat: the board');
    stuckAtResearch();
    const e = explain();
    const shown = showCard(dir, 'c-1').stuck!;
    expect(shown).toEqual(e);
    expect(buildInbox(dir).needs_you[0].last_check).toBe(explanationText(e));
    const full = await (await createApp(dir).app.request('/api/cards/c-1/full')).json();
    expect(full.summary.stuck).toEqual(e);
    expect(full.summary.you.text).toBe(e.action);
  });

  it('uc-308-06: docs, spec and mock commits are not shipped work and offer no move', () => {
    commit('docs/board.md', 'docs: the board');
    commit('workspace/app/mocks/136-board/page.tsx', 'docs: the mock');
    stuckAtResearch();
    const e = explain();
    expect(e.shipped).toMatch(/change only docs, specs or mocks/);
    expect(e.buttons).not.toContain('move');
  });

  it('uc-308-07: every explanation names an action', () => {
    lane('exit 1');
    stuckAtResearch();
    const quiet = explain();
    expect(quiet.action).toMatch(/send the story back with what to change\.$/);
    for (const e of [quiet]) expect(e.action.length).toBeGreaterThan(20);
  });
});
