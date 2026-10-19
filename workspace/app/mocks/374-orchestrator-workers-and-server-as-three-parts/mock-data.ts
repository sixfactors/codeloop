// Mock data for c-374 Orchestrator, workers and server as three parts.
// Drawn from this project's real situation: the Codeloop server holds the record, proto-orch and
// ops-orch decide what to do next, and proto-worker / opsai-worker-ui do the work. Nothing here is
// read from a server.

export type InstanceState = 'working' | 'idle' | 'waiting' | 'stalled';

export type Instance = {
  id: string;
  template: string;
  kind: 'orchestrator' | 'worker';
  host: string;
  story?: string;
  storyTitle?: string;
  stage?: string;
  idleMinutes: number;
  startedBy: string; // person or orchestrator instance
  state: InstanceState;
  handBack: string;
  handBackTone: 'ok' | 'warn' | 'plain';
  lastAction: string;
};

export const instances: Instance[] = [
  { id: 'proto-orch', template: 'orchestrator', kind: 'orchestrator', host: 'dean-mbp', story: 'p-14', storyTitle: 'Servers CRUD and the default endpoint', stage: 'Build', idleMinutes: 1, startedBy: 'Dean', state: 'working', handBack: 'No commits: it decides, it does not build', handBackTone: 'plain', lastAction: 'briefed proto-worker on the servers page' },
  { id: 'ops-orch', template: 'orchestrator', kind: 'orchestrator', host: 'dean-mbp', story: 'c-374', storyTitle: 'Orchestrator, workers and server as three parts', stage: 'Mock', idleMinutes: 3, startedBy: 'Dean', state: 'working', handBack: 'No commits: it decides, it does not build', handBackTone: 'plain', lastAction: 'asked a worker for the Agents screens' },
  { id: 'proto-worker', template: 'codeloop-builder', kind: 'worker', host: 'dean-mbp', story: 'c-365', storyTitle: 'Set the project command time limit', stage: 'Build', idleMinutes: 4, startedBy: 'proto-orch', state: 'working', handBack: 'claims both commits', handBackTone: 'ok', lastAction: 'ran the lane test, green, committed' },
  { id: 'opsai-worker-ui', template: 'ops-ai-ui-builder', kind: 'worker', host: 'ops-ai tree on dean-mbp', story: 'o-88', storyTitle: 'Agent test panel at 400 wide', stage: 'Build', idleMinutes: 190, startedBy: 'ops-orch', state: 'stalled', handBack: 'Last commit a41f9c2 is not claimed by any hand-back', handBackTone: 'warn', lastAction: 'committed the panel, then stopped' },
  { id: 'proto-worker-2', template: 'codeloop-builder', kind: 'worker', host: 'lucas-mbp', story: 'c-373', storyTitle: 'Monitor flags in v1', stage: 'Plan', idleMinutes: 22, startedBy: 'proto-orch', state: 'waiting', handBack: 'No commit yet', handBackTone: 'plain', lastAction: 'waiting on the plan approval' },
];

export type DecideItem =
  | { id: string; kind: 'approve'; title: string; sub: string; waiting: string; command: string; machinery: string }
  | { id: string; kind: 'answer'; title: string; recommended: string; from: string; command: string; machinery: string }
  | { id: string; kind: 'decided'; title: string; answer: string; by: string; date: string; source: string; machinery: string }
  | { id: string; kind: 'yesno'; title: string; sub: string; command: string; machinery: string }
  | { id: string; kind: 'flag'; rule: string; title: string; why: string; command: string; machinery: string };

export const decide: DecideItem[] = [
  { id: 'd1', kind: 'approve', title: 'Approve the plan for monitor flags in v1', sub: '6 of 6 checks pass', waiting: 'waiting 3 h', command: 'codeloop approve c-373', machinery: 'c-373 · build lane · plan gate' },
  { id: 'd2', kind: 'decided', title: 'Should the monitor block a commit that has no card?', answer: 'No. It raises a flag and moves nothing.', by: 'Dean', date: '10-16', source: 'chat', machinery: 'c-373 · question 2 · answered by decision d-0412' },
  { id: 'd3', kind: 'answer', title: 'Should a template edit apply to a story already in a stage?', recommended: 'No. Pin the version at each stage start, so an edit applies from the next stage.', from: 'ops-orch', command: 'codeloop answer c-374 1 --accept', machinery: 'c-374 · question 1' },
  { id: 'f1', kind: 'flag', rule: 'Code ahead of stage', title: 'Hosted board sync sits at Research with 2 code commits merged', why: 'The story page and the commits disagree. Nothing was moved.', command: 'codeloop where c-232', machinery: 'rule board-lag/code-ahead · c-232 · commits 7be1a40, 91c3d2e' },
  { id: 'f2', kind: 'flag', rule: 'Commit with no card', title: 'A commit by opsai-worker-ui names no card', why: 'a41f9c2 changed 4 files in the agent test panel.', command: 'codeloop handback --claim a41f9c2', machinery: 'rule board-lag/orphan-commit · o-88' },
  { id: 'f3', kind: 'flag', rule: 'Check killed by time limit', title: 'The verify check for the time limit story was cut off at 20 minutes', why: 'The check ran 20 of its 20 minutes and was killed.', command: 'codeloop check c-365 --timeout 40', machinery: 'rule board-lag/check-killed · c-365 · verify stage' },
  { id: 'y1', kind: 'yesno', title: 'Take on: install a pack from the Protobox catalog', sub: 'proposed by proto-orch · medium', command: 'codeloop accept c-377', machinery: 'c-377 · proposal' },
];

export const dismissReasons = ['Expected: the story is waiting on me', 'Duplicate of another flag', 'The rule is wrong here', 'Not worth tracking'];

export type Template = {
  id: string;
  name: string;
  kind: 'orchestrator' | 'worker';
  role: string;
  summary: string;
  ownedPaths: string[];
  pinned: { page: string; why: string }[];
  commands: string[];
  skills: string[];
  proofRules: string[];
  handBack: string;
  questionPolicy: string;
  version: string;
  forkedFrom: string;
  used: number;
  host: string;
};

export const templates: Template[] = [
  {
    id: 'codeloop-builder', name: 'codeloop-builder', kind: 'worker', summary: 'Builds Codeloop itself: CLI, server and workspace app.', role: 'Builds one story at a time in the codeloop repo and hands it back with proof.',
    ownedPaths: ['src/**', 'workspace/app/**', 'workspace/components/shared/**', 'test/**'],
    pinned: [{ page: 'Shared-tree rules', why: 'commit by path, no stash, never restore other files' }, { page: 'Build and test without breaking the live CLI', why: 'two outages came from this' }, { page: 'What bites: rsync drops the exec bit', why: 'hit 4 times' }],
    commands: ['codeloop handback', 'codeloop check', 'codeloop ask', 'git add <paths>', 'git commit -- <paths>'],
    skills: ['lane-test-first', 'handback', 'wiki-writeback'],
    proofRules: ['Each test seen red without the fix, then green', 'Real model calls capped at 10 per story', 'Build exit code stated, not piped'],
    handBack: 'Commit range · proof command · exit code · last 20 output lines',
    questionPolicy: 'Search decisions first. Ask the orchestrator, never the owner.',
    version: 'v6', forkedFrom: 'Codeloop built-in pack, v3', used: 3, host: 'any machine with a checkout',
  },
  {
    id: 'ops-ai-ui-builder', name: 'ops-ai-ui-builder', kind: 'worker', summary: 'Builds Ops AI console screens from the approved mocks.', role: 'Builds console screens in the ops-ai repo and matches the approved screen side by side.',
    ownedPaths: ['console/app/**', 'console/components/**'],
    pinned: [{ page: 'Ops AI standards gate', why: 'pnpm verify runs before every commit' }, { page: 'Approved UI never regresses', why: 'the approved screen is the spec' }, { page: 'Ops AI: commit only your own paths', why: 'shared index, four sweeps on 10-15' }],
    commands: ['pnpm verify', 'codeloop handback', 'git commit -- <paths>'],
    skills: ['ui-spec-compare', 'compose-from-registry', 'handback'],
    proofRules: ['Screenshots at 1280 and 400 wide', 'Build exit code stated', 'Fake model only'],
    handBack: 'Commit range · screenshots · verify exit code',
    questionPolicy: 'Search decisions first. Ask ops-orch; the owner only for a new screen.',
    version: 'v3', forkedFrom: 'codeloop-builder v4', used: 1, host: 'ops-ai shared tree',
  },
  {
    id: 'orchestrator', name: 'orchestrator', kind: 'orchestrator', summary: 'Decides what to do next, briefs workers, relays the owner.', role: 'Reads the board, briefs workers from templates, reviews hand-backs, and records the owner\'s chat answers.',
    ownedPaths: ['No code paths: it never commits'],
    pinned: [{ page: 'How the hub serves a board', why: 'what the server already knows' }, { page: 'Delegation and what an orchestrator may approve', why: 'the verbs it holds' }],
    commands: ['codeloop where', 'codeloop who', 'codeloop decide', 'codeloop brief', 'codeloop flags'],
    skills: ['brief-a-worker', 'record-a-decision', 'review-a-handback'],
    proofRules: ['Every owner answer in chat is recorded as a decision with one call', 'Review a hand-back before moving a story'],
    handBack: 'A decision, a brief or a flag resolved: always on the board',
    questionPolicy: 'Search decisions first. Ask the owner only what no decision covers.',
    version: 'v4', forkedFrom: 'none (built in)', used: 2, host: 'owner\'s machine or a runner',
  },
];

export type Stage = { n: number; name: string; template: string; skill: string; check: string; gate: string; limit: string };
export const workflow = { name: 'Build lane', version: 'v4', forkedFrom: 'Codeloop built-in v2', stories: 14 };
export const stages: Stage[] = [
  { n: 1, name: 'Shape', template: 'orchestrator', skill: 'shape-an-idea', check: 'Idea names a user and an outcome', gate: 'none', limit: '5 min' },
  { n: 2, name: 'Research', template: 'codeloop-builder', skill: 'research', check: 'Findings cite files opened', gate: 'none', limit: '15 min' },
  { n: 3, name: 'Interview', template: 'orchestrator', skill: 'ask-the-owner', check: 'Every question has a recommended answer', gate: 'Answers: you', limit: '5 min' },
  { n: 4, name: 'Mock', template: 'ops-ai-ui-builder', skill: 'compose-from-registry', check: 'Screens built at 1280 and 400', gate: 'Look: you', limit: '20 min' },
  { n: 5, name: 'Plan', template: 'orchestrator', skill: 'write-the-plan', check: 'Every task has a test named', gate: 'Plan: you', limit: '10 min' },
  { n: 6, name: 'Build', template: 'codeloop-builder', skill: 'lane-test-first', check: 'Lane test, typecheck, build exit 0', gate: 'none', limit: '40 min' },
  { n: 7, name: 'Verify', template: 'codeloop-builder', skill: 'use-case-run', check: 'Each use case run and passing', gate: 'Local: you', limit: '20 min' },
  { n: 8, name: 'Review', template: 'orchestrator', skill: 'review-a-handback', check: 'No open finding above low', gate: 'PR: reviewer', limit: '10 min' },
];

export type Rule = { id: string; name: string; watches: string; threshold: string; fires: number; dismissed: number; enabled: boolean; command: string };
export const rules: Rule[] = [
  { id: 'r1', name: 'Code ahead of stage', watches: 'Merged code commits on a story still before Build', threshold: '1 code commit', fires: 14, dismissed: 2, enabled: true, command: 'codeloop where <story>' },
  { id: 'r2', name: 'Commit with no card', watches: 'A commit with no card trailer and no hand-back claiming it', threshold: 'any', fires: 22, dismissed: 3, enabled: true, command: 'codeloop handback --claim <sha>' },
  { id: 'r3', name: 'Idle in build over 3 h', watches: 'A worker holding a story in Build with no activity', threshold: '180 min', fires: 31, dismissed: 19, enabled: true, command: 'codeloop who <instance>' },
  { id: 'r4', name: 'Check killed by time limit', watches: 'A stage check ended by its time limit', threshold: 'any', fires: 6, dismissed: 0, enabled: true, command: 'codeloop check <story> --timeout <min>' },
  { id: 'r5', name: 'Proposal unseen over 2 h', watches: 'A proposal nobody has opened', threshold: '120 min', fires: 17, dismissed: 11, enabled: true, command: 'codeloop open <story>' },
];
export const NOISY_BELOW = 50;
export const precision = (r: Rule) => Math.round(((r.fires - r.dismissed) / r.fires) * 100);

export type PageState = 'current' | 'needs check' | 'archive candidate';
export type WikiPage = { id: string; title: string; kind: string; state: PageState; verified: string; verifiedAt: string; served: number; cited: number; lastServed: string };
export const pages: WikiPage[] = [
  { id: 'k1', title: 'How the hub serves a board', kind: 'architecture', state: 'current', verified: '2 days ago', verifiedAt: 'b1971b5', served: 41, cited: 9, lastServed: 'today' },
  { id: 'k2', title: 'Shared-tree rules: commit by path, no stash', kind: 'rule', state: 'current', verified: '5 days ago', verifiedAt: 'dc356c7', served: 63, cited: 22, lastServed: 'today' },
  { id: 'k3', title: 'Ports and commands', kind: 'reference', state: 'needs check', verified: '19 days ago', verifiedAt: '49fadee', served: 12, cited: 1, lastServed: '3 days ago' },
  { id: 'k4', title: 'rsync drops the exec bit', kind: 'gotcha', state: 'current', verified: '9 days ago', verifiedAt: '2a2cf56', served: 18, cited: 4, lastServed: 'yesterday' },
  { id: 'k5', title: 'Service map: ops-ai services', kind: 'architecture', state: 'needs check', verified: '27 days ago', verifiedAt: 'd26e464', served: 7, cited: 0, lastServed: '8 days ago' },
  { id: 'k6', title: 'Interview 10-02: board columns', kind: 'decision record', state: 'archive candidate', verified: '17 days ago', verifiedAt: 'ec132d5', served: 0, cited: 0, lastServed: '34 days ago' },
  { id: 'k7', title: 'Old lane names (research, spec)', kind: 'reference', state: 'archive candidate', verified: '41 days ago', verifiedAt: '6723a15', served: 0, cited: 0, lastServed: '52 days ago' },
  { id: 'k8', title: 'Seeded people and how to sign in for walks', kind: 'runbook', state: 'current', verified: '6 days ago', verifiedAt: '10fa38f', served: 15, cited: 6, lastServed: '2 days ago' },
];

export type Decision = { id: string; question: string; answer: string; by: string; source: 'chat' | 'board' | 'interview' | 'command line'; date: string; scope: string; replaces: string };
export const decisions: Decision[] = [
  { id: 'd-0412', question: 'Should the monitor block a commit that has no card?', answer: 'No. It raises a flag and moves nothing.', by: 'Dean', source: 'chat', date: '10-16', scope: 'feature: monitor', replaces: '' },
  { id: 'd-0409', question: 'Does the stage of a story get typed by hand?', answer: 'No. It is derived from documents, gates, hand-backs and commits.', by: 'Dean', source: 'chat', date: '10-19', scope: 'area: board', replaces: 'Stage set by the lane runner (09-30)' },
  { id: 'd-0377', question: 'Who sets the stage of a story?', answer: 'The lane runner sets it when it moves.', by: 'Dean', source: 'interview', date: '09-30', scope: 'area: board', replaces: '' },
  { id: 'd-0401', question: 'Are packs from the Protobox catalog in v2.0?', answer: 'After. v2.0 ships one built-in pack and team forks.', by: 'Dean', source: 'board', date: '10-19', scope: 'story: three-parts design', replaces: '' },
  { id: 'd-0398', question: 'Where does the board live?', answer: 'In ~/.codeloop, out of git.', by: 'Dean', source: 'chat', date: '10-17', scope: 'area: storage', replaces: 'Board in the repo (08-22)' },
  { id: 'd-0390', question: 'May an orchestrator approve a gate for the owner?', answer: 'Only with a delegation naming the verb and an end date.', by: 'Dean', source: 'command line', date: '10-14', scope: 'area: access', replaces: '' },
  { id: 'd-0310', question: 'Where does the board live?', answer: 'In the repo under .codeloop.', by: 'Dean', source: 'interview', date: '08-22', scope: 'area: storage', replaces: '' },
];

export const facts = [
  { key: 'stack.ports', value: 'platform 4100 · web 4002 · codeloop workspace 4044', probe: 'lsof on listening ports', at: '4 min ago' },
  { key: 'cli.version', value: '@protoboxai/codeloop 0.4.2 (npm link to ~/Projects/codeloop dist)', probe: 'codeloop --version', at: '4 min ago' },
  { key: 'board.location', value: '~/.codeloop/cards.json', probe: 'codeloop config path', at: '4 min ago' },
  { key: 'migration.heads', value: 'platform 0042 · tools 0017 · bank 0009', probe: 'alembic heads per service', at: '12 min ago' },
  { key: 'review.last_sha', value: 'b1971b5 (cards waiting on QA: 3)', probe: 'newest tick file', at: '1 h ago' },
  { key: 'model.spend', value: '6 of 10 real model calls used this story', probe: 'instance reports', at: '1 h ago' },
];
