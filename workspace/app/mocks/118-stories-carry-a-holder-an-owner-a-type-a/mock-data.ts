// Mock data for c-118 Stories carry a holder, an owner, a type and links.
// Field names and values follow docs/artifacts/codeloop-ui-design.html section 3 (story fields).
import type { StoryState } from '@/lib/types';

const state = (s: Partial<StoryState> & Pick<StoryState, 'state'>): StoryState => ({ flags: [], ...s }) as StoryState;

const withHolder = {
  id: 'c-142',
  title: 'Export invoices as CSV',
  type: 'Story',
  status: state({ state: 'in-progress', stage: 'build' }),
  holderAgent: 'builder-c-142',
  owner: 'Dean',
  reviewer: 'Lucas',
  priority: 'P1',
  risk: 'low',
  area: 'billing',
  labels: ['export', 'csv'],
  release: 'next',
};

export const screens = {
  'story-properties': {
    heldByAgent: withHolder,
    heldByPerson: {
      ...withHolder,
      id: 'c-151',
      title: 'Pick which columns to export',
      type: 'Bug',
      status: state({ state: 'needs-you', waitingOn: 'review' }),
      holderAgent: undefined,
      holderPerson: 'Lucas',
      risk: 'high',
    },
    unassigned: {
      ...withHolder,
      id: 'c-153',
      title: 'Bulk delete invoices',
      type: 'Chore',
      status: state({ state: 'backlog' }),
      holderAgent: undefined,
      reviewer: undefined,
      labels: [],
      release: undefined,
    },
    error: {
      title: 'Could not save c-142',
      message: 'type must be story, bug or chore; got "epic".',
    },
  },
  'story-links': {
    blocks: [
      { type: 'blocks', id: 'c-151', title: 'Pick which columns to export', href: '/cards/c-151' },
      { type: 'relates', id: 'c-139', title: 'Schedule a weekly export', href: '/cards/c-139' },
    ],
    blockedBy: [{ type: 'blocked by', id: 'c-133', title: 'The app shell has six places', href: '/cards/c-133' }],
    error: {
      title: 'Could not add the link',
      message: 'c-999 is not a story on this board. Links point at a story that exists.',
    },
    wiki: 'Wiki pages linked from the story are shown under its Wiki tab, not here.',
  },
} as const;
