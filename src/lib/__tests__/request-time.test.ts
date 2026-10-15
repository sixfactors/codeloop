import { execSync } from 'child_process';
import { rmSync } from 'fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLocalClient } from '../../sdk/local.js';
import { closeIndex } from '../index/index.js';
import { buildBoard } from './board-fixture.js';

// What a page costs on a board of this size: the board, home and a story's full view. The hub
// serves each of them per request, so these budgets are what a person waits for.
let dir: string;
let client: ReturnType<typeof createLocalClient>;

beforeAll(async () => {
  dir = buildBoard({ cards: 200, commits: 400, activityLines: 150 });
  client = createLocalClient(dir);
  await client.board.get(); // opens the index; the budget is for a served request, not the first open
});
afterAll(async () => {
  await closeIndex(dir);
  if (process.env.CODELOOP_KEEP_FIXTURE) console.log(`FIXTURE ${dir}`);
  else rmSync(dir, { recursive: true, force: true });
});

const time = async (label: string, fn: () => Promise<unknown>): Promise<number> => {
  const t0 = performance.now();
  await fn();
  const ms = performance.now() - t0;
  console.log(`${label}: ${ms.toFixed(0)} ms`);
  return ms;
};

describe('request time on a 200 card board with 400 commits', () => {
  it('serves the board in under 300 ms', async () => {
    expect(await time('board', () => client.board.get())).toBeLessThan(300);
  });
  it('serves home in under 300 ms', async () => {
    expect(await time('home', () => client.home.get())).toBeLessThan(300);
  });
  it('serves the board in under 300 ms right after a new commit invalidated the commit graph', async () => {
    execSync('git -c user.email=a@b -c user.name=t commit -q --allow-empty -m "late\n\nCard: c-050"', { cwd: dir });
    expect(await time('board after commit', () => client.board.get())).toBeLessThan(300);
  });
  it('serves a story in full in under 500 ms', async () => {
    expect(await time('card full', () => client.cards.full('c-048'))).toBeLessThan(500);
  });
});
