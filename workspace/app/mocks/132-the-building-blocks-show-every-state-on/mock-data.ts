// Mock data for c-132 The building blocks show every state on one page.
// Every state below comes from docs/artifacts/codeloop-ui-design.html section 4 and section 3.
import type { StoryState } from '@/lib/types';

const state = (s: Partial<StoryState> & Pick<StoryState, 'state'>): StoryState => ({ flags: [], ...s }) as StoryState;

export const screens = {
  'blocks-gallery': {
    keys: [
      { id: 'c-142', note: 'Plain text when there is nowhere to link' },
      { id: 'c-150', href: '/cards/c-150', note: 'A link to the story' },
    ],
    statuses: [
      { label: 'Backlog', display: state({ state: 'backlog' }) },
      { label: 'Up next', display: state({ state: 'up-next' }) },
      { label: 'In progress, agent working', display: state({ state: 'in-progress', stage: 'build' }), agent: 'builder-c-142' },
      { label: 'In progress, nobody working', display: state({ state: 'in-progress', stage: 'spec' }) },
      { label: 'Needs you', display: state({ state: 'needs-you', waitingOn: 'local-check' }) },
      { label: 'Done', display: state({ state: 'done' }) },
      { label: 'Shipped', display: state({ state: 'shipped' }) },
      { label: 'Flag: failing', display: state({ state: 'in-progress', stage: 'build', health: 'failing' }) },
      { label: 'Flag: blocked', display: state({ state: 'up-next', flags: ['blocked'] }) },
    ],
    holders: [
      { label: 'An agent (square)', agent: 'builder-c-142' },
      { label: 'Nobody holds it', agent: undefined },
    ],
    priorities: [
      { band: 'P1', score: 91 },
      { band: 'P2', score: 64 },
      { band: 'P3', score: 38 },
      { band: 'P4', score: 12 },
    ],
    proofs: [
      { label: 'No evidence yet', done: 0, total: 4 },
      { label: 'Some passed', done: 2, total: 4 },
      { label: 'All passed', done: 4, total: 4 },
      { label: 'One failed', failed: 1, done: 2, total: 4 },
    ],
    gates: [
      { label: 'Spec gate', display: state({ state: 'needs-you', waitingOn: 'spec' }) },
      { label: 'Local check', display: state({ state: 'needs-you', waitingOn: 'local-check' }) },
      { label: 'Review', display: state({ state: 'needs-you', waitingOn: 'review' }) },
    ],
    questions: [
      { label: 'One question', text: '1 question' },
      { label: 'Several questions', text: '3 questions' },
    ],
    links: [
      { type: 'blocks', text: 'blocks c-150' },
      { type: 'blocked by', text: 'blocked by c-133' },
      { type: 'wiki', text: 'wiki: design system' },
    ],
    properties: [
      { label: 'Holder', value: 'builder-c-142' },
      { label: 'Priority', value: 'P1 · score 91' },
      { label: 'Empty value', value: '' },
      { label: 'Monospace value', value: 'feat/ui-design-system', mono: true },
    ],
    activity: [
      { who: 'builder-c-142', what: 'edited workspace/components/shared/state-pill.tsx', when: '14:02' },
      { who: 'builder-c-142', what: 'check passed (build)', when: '14:06' },
      { who: 'builder-c-142', what: 'check failing: 2 of 4 acceptance lines have no evidence', when: '14:09' },
      { who: 'Dean', what: 'approved the spec gate', when: '14:15' },
    ],
    queries: [
      { label: 'Empty', q: '' },
      { label: 'With chips', q: 'status:build holder:agent P1 area:auth' },
    ],
    doc: '# Design system\n\nThe look every screen is built from.\n\n| Block | Use for |\n|---|---|\n| Key | A story or page id |\n| Status | A state, a flag, who it waits on |\n\nChanged by c-130, c-132.',
  },
} as const;
