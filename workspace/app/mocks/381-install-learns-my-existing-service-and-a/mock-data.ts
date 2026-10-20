// Mock data for the first-day screens: Getting started and Setup questions. A made-up Spring Boot
// billing service with a small TypeScript admin, so the Java detection and the two-language case
// are both on screen. Nothing here is read from a server.

export type Found = { label: string; value: string; source: string };

export const found: Found[] = [
  { label: 'Languages', value: 'Java 17, TypeScript', source: 'pom.xml, admin/tsconfig.json' },
  { label: 'Frameworks', value: 'Spring Boot 3.2, JUnit 5, React 18', source: 'pom.xml, admin/package.json' },
  { label: 'Build and test', value: './mvnw -q test, ./mvnw -q compile, npm run build (admin)', source: 'pom.xml, admin/package.json' },
  { label: 'Database', value: 'PostgreSQL, 42 Flyway migrations', source: 'src/main/resources/db/migration' },
  { label: 'Pipeline', value: 'GitHub Actions: lint, test, build, deploy', source: '.github/workflows/ci.yml' },
  { label: 'Main modules', value: 'invoice, payment, ledger, customer, admin', source: 'src/main/java/com/acme/billing' },
];

export const filesAdded = ['.codeloop/config.yaml', '.codeloop/process.yaml', '.codeloop/rules.md', 'CLAUDE.md (one marked block)', '.mcp.json'];

export type CommandRun = { command: string; where: string; result: 'ok' | 'failed' | 'stopped' | 'skipped'; seconds?: number; note: string };

export const commands: CommandRun[] = [
  { command: './mvnw -q compile', where: 'repo root', result: 'ok', seconds: 63, note: 'Build works' },
  { command: './mvnw -q test', where: 'repo root', result: 'ok', seconds: 252, note: '318 tests, all green' },
  { command: 'npm run build', where: 'admin/', result: 'ok', seconds: 48, note: 'Admin bundle builds' },
  { command: 'npm run lint', where: 'admin/', result: 'failed', seconds: 12, note: 'Exit 1: 3 lint errors in admin/src/pages. Kept as a check; it is red today' },
  { command: './mvnw verify -Pintegration', where: 'repo root', result: 'stopped', seconds: 300, note: 'Did not complete in 5 minutes. Needs a database; not used as a check' },
  { command: './scripts/deploy.sh', where: 'scripts/', result: 'skipped', note: 'Looks like a deploy. Never run during learning' },
];

export type ModulePage = { module: string; owns: string; state: 'draft' | 'confirmed' };

export const modulePages: ModulePage[] = [
  { module: 'invoice', owns: 'invoices, invoice lines, the numbering sequence', state: 'draft' },
  { module: 'payment', owns: 'payments, refunds, the Stripe webhook log', state: 'draft' },
  { module: 'ledger', owns: 'journal entries; the only writer of balances', state: 'draft' },
  { module: 'customer', owns: 'customers and their tax settings', state: 'draft' },
  { module: 'admin', owns: 'no data; reads every module through the API', state: 'draft' },
];

export const summary = [
  'Billing service for Acme: Spring Boot 3.2 on Java 17, PostgreSQL through Flyway, a small React admin in admin/.',
  'Five modules: invoice, payment, ledger, customer, admin. The ledger module is the only one that writes balances.',
  'Build: ./mvnw -q compile in 1 min. Tests: ./mvnw -q test, 318 tests, 4 min 12 s, all green.',
  'Admin builds in 48 s; npm run lint fails with 3 errors, so it is a check that is red today.',
  'The integration profile needs a database and did not finish in 5 minutes; it is not used as a check.',
  'Risky areas: invoice (61 changes in 12 months, 2 reverts) and payment (48 changes, 1 revert). Nothing else was reverted.',
  'Conventions: controllers call services, services call repositories, never the reverse; configuration lives in application.yml per profile.',
  'Database changes are Flyway migrations under db/migration; 42 have run in production.',
  'Pipeline: GitHub Actions runs lint, test and build on every pull request and deploys main.',
  'Nothing left this machine. Seven pages were drafted; confirm or correct them on Knowledge.',
];

export type Step = { name: string; on: boolean; fixed?: boolean; note?: string };
export type Preset = { id: 'light' | 'standard' | 'controlled'; name: string; recommended?: boolean; summary: string; steps: Step[] };

export const presets: Preset[] = [
  {
    id: 'light', name: 'Light', summary: 'Build, review, done. For a team that wants the least process.',
    steps: [{ name: 'Build', on: true, fixed: true }, { name: 'Review by a separate AI reviewer', on: true }, { name: 'Done when the pipeline passes', on: true, fixed: true }],
  },
  {
    id: 'standard', name: 'Standard', recommended: true, summary: 'Questions and a written plan for medium or larger work, then build, review, done. Screen designs only when a change has a screen.',
    steps: [
      { name: 'Clarifying questions', on: true, note: 'medium or larger work' },
      { name: 'Written plan, approved by you', on: true, note: 'medium or larger work' },
      { name: 'Screen design', on: true, note: 'only when the change has a screen' },
      { name: 'Build', on: true, fixed: true },
      { name: 'Review by a separate AI reviewer', on: true },
      { name: 'Done when the pipeline passes', on: true, fixed: true },
    ],
  },
  {
    id: 'controlled', name: 'Controlled', summary: 'Standard, plus research, recorded test evidence and your approval before anything reaches production.',
    steps: [
      { name: 'Research what exists', on: true },
      { name: 'Clarifying questions', on: true },
      { name: 'Written plan, approved by you', on: true },
      { name: 'Screen design', on: true, note: 'only when the change has a screen' },
      { name: 'Build', on: true, fixed: true },
      { name: 'Recorded test evidence', on: true },
      { name: 'Review by a separate AI reviewer', on: true },
      { name: 'Your approval before production', on: true },
      { name: 'Done when the pipeline passes', on: true, fixed: true },
    ],
  },
];

export type HotSpot = { module: string; changes: number; reverts: number; suggested: boolean };

export const hotSpots: HotSpot[] = [
  { module: 'invoice', changes: 61, reverts: 2, suggested: true },
  { module: 'payment', changes: 48, reverts: 1, suggested: true },
  { module: 'ledger', changes: 22, reverts: 0, suggested: true },
  { module: 'admin', changes: 40, reverts: 0, suggested: false },
  { module: 'customer', changes: 17, reverts: 0, suggested: false },
];

export type NeverRule = { rule: string; how: 'hook' | 'review'; why: string };

export const neverRules: NeverRule[] = [
  { rule: 'Push straight to the main branch', how: 'hook', why: 'Blocked before the push leaves the machine' },
  { rule: 'Edit a database migration that has already run', how: 'hook', why: 'Blocked at commit for a file under db/migration older than the newest applied one' },
  { rule: 'Show a secret', how: 'hook', why: 'A key or token pattern in a diff blocks the commit' },
  { rule: 'Touch production', how: 'review', why: 'No local check can tell a production target; the reviewer checks it' },
  { rule: 'Add a dependency without asking', how: 'review', why: 'The reviewer flags any change to the dependencies in pom.xml or package.json' },
];

export type Convention = { rule: string; from: string };

export const conventions: Convention[] = [
  { rule: 'Controllers call services, services call repositories, never the reverse', from: '38 of 38 controllers; no repository import in a controller' },
  { rule: 'Configuration lives in application.yml per profile, never in code', from: 'src/main/resources/application-*.yml; no hard-coded host or port found' },
  { rule: 'Every endpoint has a test under src/test in the same package', from: '41 of 44 endpoints; the 3 without are listed on the invoice page' },
];

export type QuestionCard = { n: number; title: string; recommended: string; from: string };

export const questions: QuestionCard[] = [
  { n: 1, title: 'Which areas are sensitive?', recommended: 'invoice, payment and ledger. A change there needs your approval of the plan before build.', from: 'the two modules with reverts, and the one that writes balances' },
  { n: 2, title: 'How much process per change?', recommended: 'Standard. Questions and a plan for medium or larger work; screen designs only when a change has a screen.', from: 'a team of five with a pipeline that already gates main' },
  { n: 3, title: 'Who reviews?', recommended: 'A separate AI reviewer checks every change. You review only sensitive areas and anything that leaves the machine.', from: 'the plan you approved' },
  { n: 4, title: 'What counts as done?', recommended: 'The checks your pipeline already runs: lint, test and build in .github/workflows/ci.yml.', from: 'the pipeline that gates main today' },
  { n: 5, title: 'What must never happen?', recommended: 'Five rules, three enforced by a hook and two checked at review. Add more below.', from: 'the plan you approved, fitted to this repository' },
  { n: 6, title: 'Keep the conventions it found as rules?', recommended: 'Yes, keep all three. Each names where it was seen, so an agent can check itself.', from: 'what the code does today' },
];
