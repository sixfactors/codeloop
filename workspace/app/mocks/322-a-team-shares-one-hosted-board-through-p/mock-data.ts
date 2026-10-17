// Mock data for c-322 A team shares one hosted board through Protobox.
// One team of three people, two machines each plus a shared check runner, three projects and eight
// agents. Cloud keeps the board, the wiki and knowledge base, skills and agent presence; the agents
// themselves run on each person's machine, so every agent row says whose machine it reported from.
import type { StoryState, SummaryView } from '@/lib/types';

export type Role = 'owner' | 'reviewer' | 'member' | 'visitor';
export type AgentKind = 'Claude Code' | 'Cursor' | 'Codex' | 'CI';
export type AgentState = 'working' | 'waiting on owner' | 'stalled' | 'done';

export type Person = { id: string; name: string; role: Role; email: string; machines: string[]; lastSeen: string };
export type Project = { id: string; name: string; stories: number; private: boolean };
export type Agent = {
  id: string;
  kind: AgentKind;
  person: string;
  machine: string;
  project: string;
  story: string;
  storyTitle: string;
  branch: string;
  startedAt: string;
  lastActivity: string;
  lastAction: string;
  state: AgentState;
};

export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', reviewer: 'Reviewer', member: 'Member', visitor: 'Public visitor' };

export const people: Person[] = [
  { id: 'ana', name: 'Ana Ruiz', role: 'owner', email: 'ana@example.com', machines: ['ana-laptop', 'ana-studio'], lastSeen: 'now' },
  { id: 'sam', name: 'Sam Chen', role: 'reviewer', email: 'sam@example.com', machines: ['sam-laptop', 'sam-desktop'], lastSeen: '6 min ago' },
  { id: 'jo', name: 'Jo Park', role: 'member', email: 'jo@example.com', machines: ['jo-laptop', 'jo-desktop'], lastSeen: '40 min ago' },
];

export const personName = (id: string) => people.find((p) => p.id === id)?.name ?? id;

export const projects: Project[] = [
  { id: 'storefront', name: 'storefront', stories: 41, private: false },
  { id: 'billing-api', name: 'billing-api', stories: 27, private: true },
  { id: 'mobile-app', name: 'mobile-app', stories: 33, private: true },
];

export const agents: Agent[] = [
  { id: 'a1', kind: 'Claude Code', person: 'ana', machine: 'ana-laptop', project: 'storefront', story: 'SC-142', storyTitle: 'Shoppers can save a cart and come back to it', branch: 'feat/storefront-saved-carts', startedAt: 'Today 09:05', lastActivity: '2 min ago', lastAction: 'Wrote the cart restore step', state: 'working' },
  { id: 'a2', kind: 'Cursor', person: 'sam', machine: 'sam-desktop', project: 'billing-api', story: 'SC-207', storyTitle: 'Invoices export as a spreadsheet', branch: 'feat/billing-invoice-export', startedAt: 'Today 08:30', lastActivity: '14 min ago', lastAction: 'Handed back the plan for approval', state: 'waiting on owner' },
  { id: 'a3', kind: 'Codex', person: 'jo', machine: 'jo-laptop', project: 'mobile-app', story: 'SC-088', storyTitle: 'Sign in with a one-time code by email', branch: 'feat/mobile-email-code-sign-in', startedAt: 'Today 07:50', lastActivity: '47 min ago', lastAction: 'Started the email sender test, then went quiet', state: 'stalled' },
  { id: 'a4', kind: 'Claude Code', person: 'jo', machine: 'jo-desktop', project: 'storefront', story: 'SC-151', storyTitle: 'Out-of-stock items say when they return', branch: 'feat/storefront-restock-dates', startedAt: 'Today 09:20', lastActivity: '1 min ago', lastAction: 'Added the restock date to the product page', state: 'working' },
  { id: 'a5', kind: 'CI', person: 'sam', machine: 'ci-runner', project: 'storefront', story: 'SC-142', storyTitle: 'Shoppers can save a cart and come back to it', branch: 'feat/storefront-saved-carts', startedAt: 'Today 09:31', lastActivity: '5 min ago', lastAction: 'Ran the use case checks, all passing', state: 'done' },
  { id: 'a6', kind: 'Codex', person: 'sam', machine: 'sam-laptop', project: 'storefront', story: 'SC-142', storyTitle: 'Shoppers can save a cart and come back to it', branch: 'feat/storefront-saved-carts', startedAt: 'Yesterday 16:10', lastActivity: 'Yesterday 17:02', lastAction: 'Finished research and the mock', state: 'done' },
  { id: 'a7', kind: 'Cursor', person: 'ana', machine: 'ana-studio', project: 'mobile-app', story: 'SC-093', storyTitle: 'A push notification when an order ships', branch: 'feat/mobile-shipped-push', startedAt: 'Yesterday 11:00', lastActivity: 'Yesterday 13:40', lastAction: 'Review accepted', state: 'done' },
  { id: 'a8', kind: 'Claude Code', person: 'ana', machine: 'ana-studio', project: 'billing-api', story: 'SC-211', storyTitle: 'Failed card payments retry the next day', branch: 'feat/billing-payment-retry', startedAt: 'Today 08:45', lastActivity: '9 min ago', lastAction: 'Asked two questions about retry limits', state: 'waiting on owner' },
];

const st = (s: Partial<StoryState> & Pick<StoryState, 'state'>): StoryState => ({ flags: [], ...s });

export const home = {
  needsYou: [
    { id: 'SC-207', project: 'billing-api', title: 'Invoices export as a spreadsheet', display: st({ state: 'needs-you', stage: 'spec', waitingOn: 'spec' }), why: 'The plan is ready for your approval', since: '14 min' },
    { id: 'SC-211', project: 'billing-api', title: 'Failed card payments retry the next day', display: st({ state: 'needs-you', waitingOn: 'questions' }), why: 'Two questions about retry limits', since: '9 min' },
    { id: 'SC-088', project: 'mobile-app', title: 'Sign in with a one-time code by email', display: st({ state: 'needs-you', stage: 'build', waitingOn: 'stuck' }), why: 'Jo’s agent has been quiet for 47 minutes', since: '47 min' },
  ],
  failing: [
    { id: 'SC-160', project: 'storefront', title: 'Gift cards apply at checkout', display: st({ state: 'in-progress', stage: 'verify', health: 'failing' }), why: 'The checkout total check fails on a gift card with no balance left' },
  ],
  shipped: [
    { id: 'SC-093', project: 'mobile-app', title: 'A push notification when an order ships', who: 'Ana Ruiz', at: 'Yesterday' },
    { id: 'SC-138', project: 'storefront', title: 'Search remembers the last filter', who: 'Jo Park', at: 'Wed' },
    { id: 'SC-199', project: 'billing-api', title: 'Receipts carry the tax number', who: 'Sam Chen', at: 'Tue' },
  ],
};

export const story = {
  id: 'SC-142',
  project: 'storefront',
  title: 'Shoppers can save a cart and come back to it',
  branch: 'feat/storefront-saved-carts',
  owner: 'ana',
  holder: { agent: 'a1', label: 'Claude Code on ana-laptop', person: 'ana' },
  summary: {
    needed: { text: 'A shopper who leaves with items in the cart finds the same cart when they come back, on any device they sign in from.', by: 'Codex', byKind: 'agent', step: 'research' },
    done: { text: 'Research and the mock are finished. The plan has 6 tasks; 4 are built and every use case check passes so far.', by: 'Claude Code', byKind: 'agent', step: 'build' },
    you: { text: 'Nothing for now. Ana’s agent is building the last two tasks.', by: 'board', byKind: 'board', step: 'build' },
  } as SummaryView,
  display: st({ state: 'in-progress', stage: 'build' }),
  agents: ['a1', 'a5', 'a6'],
};

/** What each role may approve or do. Cloud never merges or deploys, so neither appears here. */
export const permissions: { action: string; roles: Role[] }[] = [
  { action: 'Read the board, the wiki and the knowledge base', roles: ['owner', 'reviewer', 'member', 'visitor'] },
  { action: 'Answer an agent’s questions on a story', roles: ['owner', 'reviewer', 'member'] },
  { action: 'Approve a new story onto the board', roles: ['owner'] },
  { action: 'Approve a plan before building starts', roles: ['owner', 'reviewer'] },
  { action: 'Accept finished work at review', roles: ['owner', 'reviewer'] },
  { action: 'Invite people and change roles', roles: ['owner'] },
  { action: 'Connect a project and choose what is public', roles: ['owner'] },
];

export type PlanRow = { feature: string; local: boolean | string; cloud: boolean | string };

export const plans: PlanRow[] = [
  { feature: 'A board for every project, with stories, checks and history', local: true, cloud: true },
  { feature: 'A wiki and knowledge base your agents read before they work', local: true, cloud: true },
  { feature: 'Skills your agents can use', local: true, cloud: 'Shared across the team' },
  { feature: 'Runs your agents for you on your machine', local: true, cloud: 'No. Cloud coordinates the agents you run' },
  { feature: 'A team, with owner, reviewer and member roles', local: false, cloud: true },
  { feature: 'See every agent working across everyone’s machines', local: false, cloud: true },
  { feature: 'One board kept in step across machines', local: false, cloud: true },
  { feature: 'A hosted MCP link for any agent to read and update the board', local: false, cloud: true },
  { feature: 'One account, shared with Protobox, so you sign up once', local: false, cloud: true },
  { feature: 'A public board and wiki for a project, at its own link', local: false, cloud: 'Later' },
];

export const connect = {
  project: 'storefront',
  team: 'Ruiz and Co',
  syncs: [
    { what: 'Stories, their steps, checks and history', detail: '41 stories' },
    { what: 'The wiki and knowledge base', detail: '58 pages' },
    { what: 'Skills', detail: '6 skills' },
    { what: 'Which agents are working, on which machine, story and branch name', detail: 'Updated while they run' },
  ],
  stays: [
    'Your code, commits and diffs',
    'Secrets and environment files',
    'What your agents type and read on your machine',
  ],
  mcpLink: 'https://cloud.codeloop.example/t/ruiz-and-co/mcp',
};

export const publicView = {
  project: 'storefront',
  stories: [
    { id: 'SC-142', title: 'Shoppers can save a cart and come back to it', display: st({ state: 'in-progress', stage: 'build' }) },
    { id: 'SC-151', title: 'Out-of-stock items say when they return', display: st({ state: 'in-progress', stage: 'build' }) },
    { id: 'SC-160', title: 'Gift cards apply at checkout', display: st({ state: 'in-progress', stage: 'verify' }) },
    { id: 'SC-138', title: 'Search remembers the last filter', display: st({ state: 'shipped' }) },
  ],
  hidden: { stories: 3, projects: 2 },
  agentsWorking: 2,
};

/** Signing up creates the Protobox account behind codeloop, so a person signs up once. */
export const signUp = {
  name: 'Ana Ruiz',
  email: 'ana@example.com',
  team: 'Ruiz and Co',
};

/**
 * Linking a machine: `codeloop login` asks Cloud for a code, prints it, and waits while the person
 * approves that code in the browser. The browser is already signed in, so nothing is typed twice.
 */
export const deviceLink = {
  code: 'WXYZ-4821',
  machine: 'ana-laptop',
  verifyUrl: 'https://cloud.codeloop.example/device',
  expiresIn: '9 minutes',
  terminal: [
    '$ codeloop login',
    'Open https://cloud.codeloop.example/device',
    'and enter the code WXYZ-4821',
    'Waiting for you to approve it in the browser...',
  ],
  terminalApproved: [
    '$ codeloop login',
    'Approved by Ana Ruiz in the browser.',
    'This machine (ana-laptop) is linked to Ruiz and Co.',
    'Agent key saved. Agents on this machine can now reach the board.',
  ],
};

export type AgentClient = 'claude-code' | 'cursor' | 'codex';

/** Copy-ready setup for each agent client. Every one reads the key `codeloop login` saved. */
export const connectAgents = {
  team: 'Ruiz and Co',
  mcpLink: 'https://cloud.codeloop.example/t/ruiz-and-co/mcp',
  clients: [
    {
      id: 'claude-code' as AgentClient,
      label: 'Claude Code',
      where: 'Run once in the project folder',
      snippet: 'claude mcp add --transport http codeloop \\\n  https://cloud.codeloop.example/t/ruiz-and-co/mcp \\\n  --header "Authorization: Bearer $CODELOOP_KEY"',
    },
    {
      id: 'cursor' as AgentClient,
      label: 'Cursor',
      where: 'Add to .cursor/mcp.json in the project',
      snippet: '{\n  "mcpServers": {\n    "codeloop": {\n      "url": "https://cloud.codeloop.example/t/ruiz-and-co/mcp",\n      "headers": { "Authorization": "Bearer ${env:CODELOOP_KEY}" }\n    }\n  }\n}',
    },
    {
      id: 'codex' as AgentClient,
      label: 'Codex',
      where: 'Add to ~/.codex/config.toml',
      snippet: '[mcp_servers.codeloop]\nurl = "https://cloud.codeloop.example/t/ruiz-and-co/mcp"\nbearer_token_env_var = "CODELOOP_KEY"',
    },
  ],
  login: 'codeloop login',
  /** What `codeloop login` sends. The CLI is a wrapper over these two calls. */
  loginApi: [
    { step: 'Ask for a code', call: 'POST /api/device/code' },
    { step: 'Wait for approval, then receive the agent key', call: 'POST /api/device/token' },
  ],
  keys: [
    { id: 'k1', kind: 'person' as const, label: 'Ana Ruiz', detail: 'Signed in to this browser', key: 'Browser session', lastUsed: 'now', inUse: true },
    { id: 'k2', kind: 'agent' as const, label: 'ana-laptop', detail: 'Claude Code, Cursor', key: 'cl_agent_7Hq2...9fK1', lastUsed: '2 min ago', inUse: true },
    { id: 'k3', kind: 'agent' as const, label: 'ana-studio', detail: 'Claude Code, Cursor', key: 'cl_agent_Pm4x...2bQe', lastUsed: '9 min ago', inUse: false },
  ],
};

/** Project settings. Publishing is a later feature, shown switched off. */
export const projectSettings = {
  project: 'storefront',
  team: 'Ruiz and Co',
  keyPrefix: 'SC',
  nextKey: 'SC-161',
  visibility: 'Team only',
  publicUrl: 'https://cloud.codeloop.example/p/ruiz-and-co/storefront',
  publishes: ['The board, with each story and its state', 'The wiki pages you mark public'],
  neverPublished: ['People, machines and agent keys', 'Private stories and other projects', 'Answers and comments on stories'],
};

export const publicWiki = [
  { title: 'How saved carts work', updated: '2 days ago' },
  { title: 'Checkout rules', updated: 'last week' },
  { title: 'Restock dates', updated: 'today' },
];
