// Mock data for c-308 A stuck story says why in plain words and which action will move it.
// The three answers a stuck story owes (work tried, what shipped, which action), taken from c-136's real timeline.

export type Stuck = {
  id: string;
  title: string;
  step: string;
  needed: string;
  done: string;
  /** The summary's "what you must do" line: the stuck explanation. */
  tried: string;
  shipped: string;
  action: string;
  buttons: ('move' | 'retry' | 'retry-after-fix')[];
  moveTo?: string;
  error?: string;
  at: string;
};

export const screens = {
  'stuck-story': {
    shipped: {
      id: 'c-136',
      title: 'The board shows every story by stage',
      step: 'research',
      needed: 'A board with one column per step and every open story on it.',
      done: 'The whole board was built and merged in 9ade47c on Tue 03:46.',
      tried: 'No agent has worked the research step. The check ran three times on an empty file, once after a lane upgrade.',
      shipped: '18 commits under this story are merged, the last on Tue 03:46. They change the board screen, not docs.',
      action: 'Move it to verify, where its shipped work belongs. It will stop there for your approval.',
      buttons: ['move'],
      moveTo: 'verify',
      at: 'Wed 23:06',
    } satisfies Stuck,
    changed: {
      id: 'c-149',
      title: 'Tasks tick as their commits land',
      step: 'research',
      needed: 'Each task in the plan ticks itself when a commit names it.',
      done: 'Research is half written: two sources of three.',
      tried: 'An agent tried twice; research.md has changed since the last try (a third source was added at 09:20).',
      shipped: 'Nothing has shipped under this story yet.',
      action: 'Let an agent try once more. The file changed, so the check may pass this time.',
      buttons: ['retry'],
      at: 'Fri 09:20',
    } satisfies Stuck,
    unchanged: {
      id: 'c-155',
      title: 'Reviews name the files they read',
      step: 'spec',
      needed: 'A review that lists every file it read, with a line each.',
      done: 'Research and questions are finished.',
      tried: 'An agent tried three times and changed nothing since its last try.',
      shipped: 'Nothing has shipped under this story yet.',
      action: 'Trying again would fail the same way. Write the missing task for acceptance line US2 in tasks.md, or send the story back with what to change.',
      buttons: [],
      at: 'Fri 08:02',
    } satisfies Stuck,
    broken: {
      id: 'c-098',
      title: 'Stories import from a spreadsheet',
      step: 'verify',
      needed: 'Paste a spreadsheet of stories and get one story per row.',
      done: 'Build is finished; 6 of 6 tasks are ticked.',
      tried: 'The check itself broke at 14:31 on the verify step, before it looked at the work. Your work is not the problem.',
      shipped: '4 commits under this story are merged.',
      action: 'Fix the check, then try again.',
      buttons: ['retry-after-fix'],
      error: 'node:internal/modules/run_main:123\n    triggerUncaughtException(\n    ^\nError [ERR_MODULE_NOT_FOUND]: Cannot find package \'vitest\' imported from /repo/vitest.config.ts\n\nNode.js v26.4.0',
      at: 'Thu 14:31',
    } satisfies Stuck,
    loadError: { title: 'Story failed to load', message: 'The board did not answer: connection refused on the local hub' },
  },
  'inbox-failing': {
    rows: [
      { id: 'c-149', title: 'Tasks tick as their commits land', stage: 'research' },
      { id: 'c-155', title: 'Reviews name the files they read', stage: 'spec' },
    ],
    gone: { id: 'c-302', title: 'A trivial story that grows still parks at the first gate', stage: 'verify', note: 'Failed at 10:12, passed at 10:40: gone from this list, kept in the story history.' },
    loadError: { title: 'Inbox failed to load', message: 'The board did not answer: connection refused on the local hub' },
  },
};
