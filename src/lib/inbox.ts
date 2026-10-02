import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { DONE, inLane, PROPOSED, readCards, type Card, type CardEvent } from './cards.js';
import { clock } from './clock.js';
import { loadLanes, substitute } from './lane.js';
import { findMock } from './mock.js';
import { cloudCopies } from './wiki.js';

export const INBOX_SEEN = '.codeloop/state/inbox-seen.json';

export interface Inbox {
  summary: string;
  needs_you: { id: string; title: string; lane: string; stage: string; gate: string; awaiting?: string; read?: string; mock?: string; source?: string; last_check: string; since: string; last_event?: CardEvent }[];
  /** Wiki pages changed here and in the cloud: merge the cloud version into the local page, then delete it. */
  needs_merge: { path: string; cloud: string }[];
  shipped: { id: string; title: string; lane: string; finishedAt: string }[];
  numbers: {
    lane: string;
    metric?: string;
    target?: string;
    active: number;
    parked: number;
    done: number;
    human_turns_per_card: number | null;
    first_pass_rate: number | null;
  }[];
}

const firstPass = (c: Card) => !c.events.some(e => e.action === 'fail' || e.action === 'reject');

export function buildInbox(projectDir: string, now: Date = clock()): Inbox {
  const { cards } = readCards(projectDir);
  const seenFile = join(projectDir, INBOX_SEEN);
  const seen: string = existsSync(seenFile) ? JSON.parse(readFileSync(seenFile, 'utf-8')).at : '';

  const lanes = loadLanes(projectDir);
  const laneIds = [...new Set([...lanes.map(l => l.id), ...cards.map(c => c.lane)])];

  const waiting = cards.filter(c => c.gate).map(c => {
    const stage = lanes.find(l => l.id === c.lane)?.stages.find(s => s.id === c.stage);
    const parkedAt = c.events.filter(e => e.action === 'park' || e.action === 'stuck').at(-1);
    const last_check = c.stage === PROPOSED
      ? 'not started: a proposal'
      : c.gate === 'stuck'
      ? `failed: ${c.events.filter(e => e.action === 'stuck').at(-1)?.note?.split('\n').at(-1) ?? ''}`
      : stage?.gate?.outward ? 'not run yet (public step, approve first)' : 'passed';
    const mock = findMock(projectDir, c.id);
    return {
      id: c.id, title: c.title, lane: c.lane, stage: c.stage, gate: c.gate!, awaiting: c.awaiting,
      read: stage?.output ? substitute(stage.output, c) : undefined,
      ...(mock ? { mock } : {}),
      ...(c.source ? { source: c.source } : {}),
      last_check, since: parkedAt?.at ?? c.updatedAt, last_event: c.events.at(-1),
    };
  });
  const day = 86_400_000;
  const week = cards.filter(c => c.stage === DONE && now.getTime() - new Date(c.updatedAt).getTime() < 7 * day).length;
  const oldest = waiting.length ? Math.floor((now.getTime() - Math.min(...waiting.map(w => new Date(w.since).getTime()))) / day) : 0;

  return {
    summary: `${week} shipped this week, ${waiting.length} waiting on you${waiting.length ? `, oldest ${oldest === 0 ? 'today' : `${oldest} day${oldest === 1 ? '' : 's'}`}` : ''}`,
    needs_you: waiting,
    needs_merge: cloudCopies(projectDir),
    shipped: cards
      .filter(c => c.stage === DONE && c.updatedAt > seen)
      .map(c => ({ id: c.id, title: c.title, lane: c.lane, finishedAt: c.updatedAt })),
    numbers: laneIds.map(id => {
      const mine = cards.filter(c => c.lane === id);
      const done = mine.filter(c => c.stage === DONE);
      const lane = lanes.find(l => l.id === id);
      return {
        lane: id,
        metric: lane?.metric?.name,
        target: lane?.metric?.target,
        active: mine.filter(c => inLane(c) && !c.gate).length,
        parked: mine.filter(c => c.gate).length,
        done: done.length,
        human_turns_per_card: mine.length ? mine.reduce((n, c) => n + c.events.filter(e => e.human).length, 0) / mine.length : null,
        first_pass_rate: done.length ? done.filter(firstPass).length / done.length : null,
      };
    }),
  };
}

export function markInboxSeen(projectDir: string, now: Date = clock()): void {
  const file = join(projectDir, INBOX_SEEN);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ at: now.toISOString() }, null, 2) + '\n');
}
