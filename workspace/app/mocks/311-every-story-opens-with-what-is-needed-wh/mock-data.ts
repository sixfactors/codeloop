// Mock data for c-311 Every story opens with what is needed, what is done and what I must do.
// The summary lines, the step bar, the folded sections and their counts, as the story page would show them.
import type { Journey, StageRubric, StoryCommit, Task } from '@/lib/types';

export type Line = { text: string; by: string; byKind: 'agent' | 'you' | 'board'; at: string; step: string };
export type Summary = { needed: Line; done: Line; you: Line; mark?: 'unwritten' | 'stale' };

const ORDER = ['research', 'interview', 'mock', 'spec', 'data-model', 'build', 'verify', 'review', 'staging', 'live'];

const journey = (current: string, gateAt?: string, agent?: string): Journey => {
  const at = ORDER.indexOf(current);
  const steps = ORDER.map((id, i) => ({
    id,
    state: i < at ? 'done' : i === at ? (gateAt ? 'gate' : 'current') : 'ahead',
    ...(id === 'spec' ? { gate: { name: 'spec', approver: 'owner' } } : {}),
    ...(i < at ? { durationMs: [6, 4, 9, 5][i % 4] * 60_000, who: 'claude' } : {}),
    ...(i === at && gateAt ? { who: 'owner', leftAt: gateAt } : {}),
  }));
  const holder = gateAt ? { kind: 'you', gate: 'spec', awaiting: 'owner', openQuestions: 0 } : { kind: agent ? 'agent' : 'nobody', ...(agent ? { agent } : {}), openQuestions: 0 };
  return { steps, holder } as unknown as Journey;
};

const rubric = {
  stage: 'spec',
  rows: [
    { id: 'S1', criterion: 'Title, story, persona, size, metric, done_when pass the story standard', judged: 'check', status: 'pass' },
    { id: 'S2', criterion: 'One to five acceptance lines, each noticeable by a user', judged: 'check', status: 'pass' },
    { id: 'S3', criterion: 'Every interview answer appears in a field, named', judged: 'attest', status: 'pass', evidence: 'spec.md:27' },
    { id: 'S4', criterion: 'Every acceptance line has at least one task', judged: 'check', status: 'fail', finding: 'acceptance line US5 has no task' },
  ],
  problems: ['S4 acceptance line US5 has no task'],
} as unknown as StageRubric;

const tasks = [
  { id: 'T001', done: true, parallel: false, accept: 'US1', layer: 'api', text: 'Export every invoice in a date range as a spreadsheet' },
  { id: 'T002', done: true, parallel: false, accept: 'US2', layer: 'api', text: 'Totals in the last row' },
  { id: 'T003', done: false, parallel: false, accept: 'US1', layer: 'ui', text: 'Export button on the invoices page' },
] as unknown as Task[];

const commits = [
  { sha: '6da701a2', subject: 'Export every invoice in a date range as a spreadsheet', branches: [], merged: true, at: Date.parse('2026-10-17T09:12:00Z') },
  { sha: '3ff7445b', subject: 'Totals in the last row', branches: [], merged: true, at: Date.parse('2026-10-17T09:40:00Z') },
] as unknown as StoryCommit[];

const line = (text: string, by: string, byKind: Line['byKind'], at: string, step: string): Line => ({ text, by, byKind, at, step });

export const screens = {
  'story-page': {
    story: { id: 'c-142', title: 'Export invoices as a spreadsheet', lane: 'build', size: 'M', feature: 'billing-exports', persona: 'founder' },
    written: {
      summary: {
        needed: line('A spreadsheet of every invoice in a date range, opened from the invoices page.', 'claude', 'agent', 'Fri 09:41', 'spec'),
        done: line('Research, questions and the drawing are finished; the plan has 8 tasks.', 'claude', 'agent', 'Fri 09:41', 'spec'),
        you: line('Approve the plan, or send it back with what to change.', 'the board', 'board', 'Fri 09:41', 'spec'),
      } as Summary,
      journey: journey('spec', '2026-10-17T09:41:00Z'),
    },
    edited: {
      summary: {
        needed: line('A spreadsheet of every invoice in a date range. Totals in the last row.', 'you', 'you', 'Fri 10:02', 'spec'),
        done: line('Research, questions and the drawing are finished. The totals row is in the plan as task 9 for you to approve.', 'claude', 'agent', 'Fri 10:30', 'spec'),
        you: line('Approve the plan, or send it back with what to change.', 'the board', 'board', 'Fri 10:30', 'spec'),
      } as Summary,
      journey: journey('spec', '2026-10-17T10:30:00Z'),
    },
    unwritten: {
      summary: {
        mark: 'unwritten',
        needed: line('Export invoices as a spreadsheet, from the story line.', 'the board', 'board', 'Thu 21:58', 'research'),
        done: line('Nothing yet. The story started at research four minutes ago.', 'the board', 'board', 'Thu 21:58', 'research'),
        you: line('Nothing for now. An agent is on the research step.', 'the board', 'board', 'Thu 21:58', 'research'),
      } as Summary,
      journey: journey('research', undefined, 'claude on dean-mbp, since 21:58'),
    },
    stale: {
      summary: {
        mark: 'stale',
        needed: line('A spreadsheet of every invoice in a date range.', 'claude', 'agent', 'Thu 22:10', 'research'),
        done: line('Research is finished; four questions are waiting for you.', 'claude', 'agent', 'Thu 22:10', 'research'),
        you: line('Approve the plan, or send it back with what to change.', 'the board', 'board', 'Fri 09:41', 'spec'),
      } as Summary,
      journey: journey('spec', '2026-10-17T09:41:00Z'),
    },
    rubric,
    tasks,
    commits,
    history: [
      { at: 'Fri 09:41', text: 'claude handed back the spec step with 8 tasks' },
      { at: 'Fri 09:40', text: 'The spec check failed: acceptance line US5 has no task' },
      { at: 'Fri 09:12', text: 'You answered four questions, taking every recommendation' },
      { at: 'Thu 22:10', text: 'claude wrote the research and asked four questions' },
    ],
    raw: 'codeloop spec check c-142\n  acceptance line US5 has no task\nexit 1',
    error: { title: 'Story failed to load', message: 'The board did not answer: connection refused on the local hub' },
  },
};
