/**
 * What counts as a story's real work, and where merged work puts the story on its lane. The review
 * pass and the stuck explanation both read these, so the "Move it" button and the review pass's
 * place never disagree about the target or about which commits shipped something.
 */
import type { Card } from './cards.js';
import { reviewMoveRefusal } from './engine.js';
import { stageApplies, type Lane } from './lane.js';
import { mockAppDir, mockTarget } from './mock.js';

// Planning, evidence, release notes and tool state: commits that touch only these say nothing about
// where the story's work is. specs/, evidence/ and shape/ are the legacy layout of the .codeloop store.
const NOT_WORK = [/^\.codeloop\//, /^specs\//, /^evidence\//, /^shape\//, /^docs\//, /^CHANGELOG\.md$/, /(^|\/)mocks\//];

/** Paths that are not the story's work: the store, docs, the changelog, mocks and the story's own spec folder. */
export function notWork(projectDir: string, card?: Pick<Card, 'spec'>): (path: string) => boolean {
  const app = mockTarget(projectDir) === 'app' ? mockAppDir(projectDir) : undefined;
  const mocks = app ? `${app}/mocks/` : undefined;
  const spec = card?.spec ? `${card.spec.replace(/\/$/, '')}/` : undefined;
  return path => NOT_WORK.some(re => re.test(path)) || (mocks !== undefined && path.startsWith(mocks)) || (spec !== undefined && path.startsWith(spec));
}

/**
 * Where merged code puts a story: the lane's build stage (id `build`, or the stage whose check reads
 * the task list), else the stage after the last one that writes a file in its spec folder. -1 when
 * there is none.
 */
export function codeStageIndex(lane: Lane): number {
  const build = lane.stages.findIndex(s => s.id === 'build' || /\btask check\b/.test(s.done?.cmd ?? ''));
  if (build >= 0) return build;
  const last = lane.stages.map(s => s.output?.startsWith('{spec}/') ?? false).lastIndexOf(true);
  return last + 1 < lane.stages.length ? last + 1 : -1;
}

/**
 * How far toward the code stage a story with merged work moves: as far as no unapproved gate lies
 * between, and never past one. Undefined when it would not move from where it is.
 */
export function mergedWorkTarget(lane: Lane, card: Card): number | undefined {
  const cur = lane.stages.findIndex(s => s.id === card.stage);
  const code = codeStageIndex(lane);
  if (cur < 0 || code <= cur) return undefined;
  let target = cur;
  for (let i = cur + 1; i <= code; i++) {
    if (!stageApplies(lane.stages[i], card)) continue;
    if (reviewMoveRefusal(lane, card, i)) break;
    target = i;
  }
  return target > cur ? target : undefined;
}
